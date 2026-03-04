import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        // Guest mode fallback: use ID 1 (Admin/Seed user)
        req.user = { id: 1, role: 'admin', name: 'Guest' };
        return next();
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: '토큰 만료' });
    }
}

// 대화 이력 조회
router.get('/:characterId', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM chat_messages
             WHERE character_id=? AND user_id=?
             ORDER BY created_at ASC LIMIT 200`,
            [req.params.characterId, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching chat history:', err);
        res.status(500).json({ error: '대화 이력 로드 실패' });
    }
});

// 메시지 전송 + AI 응답
router.post('/:characterId', auth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: '내용 없음' });

        // 캐릭터 정보 가져오기
        const [chars] = await pool.query('SELECT * FROM characters WHERE id=?', [req.params.characterId]);
        if (!chars.length) return res.status(404).json({ error: '캐릭터 없음' });
        const char = chars[0];

        // 사용자 메시지 저장
        await pool.query(
            'INSERT INTO chat_messages (character_id, user_id, role, content) VALUES (?,?,?,?)',
            [char.id, req.user.id, 'user', content]
        );

        // ── AI 응답 생성 ──────────────────────────────────────
        let aiReply;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
            // Gemini API 실제 호출
            try {
                const systemPrompt = buildSystemPrompt(char);
                const [history] = await pool.query(
                    `SELECT role, content FROM chat_messages
                     WHERE character_id=? AND user_id=?
                     ORDER BY created_at DESC LIMIT 20`,
                    [char.id, req.user.id]
                );
                const messages = history.reverse().map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemPrompt }] },
                            contents: messages,
                            generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
                        })
                    }
                );
                const data = await response.json();
                aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '(응답 생성 실패)';
            } catch (e) {
                aiReply = `[오류] Gemini API 호출 실패: ${e.message}`;
            }
        } else {
            // Gemini API 키 미설정 시 Mock 응답
            aiReply = `${char.name}: "${content}" — 흥미로운 말이군요. (Gemini API 키를 설정하면 실제 AI 응답을 받을 수 있습니다.)`;
        }

        // AI 응답 저장
        await pool.query(
            'INSERT INTO chat_messages (character_id, user_id, role, content) VALUES (?,?,?,?)',
            [char.id, req.user.id, 'assistant', aiReply]
        );

        res.json({ role: 'assistant', content: aiReply });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: '메시지 전송 실패' });
    }
});

// 대화 기록 초기화
router.delete('/:characterId/clear', auth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM chat_messages WHERE character_id=? AND user_id=?',
            [req.params.characterId, req.user.id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Error clearing chat:', err);
        res.status(500).json({ error: '대화 기록 초기화 실패' });
    }
});

function buildSystemPrompt(char) {
    return `당신은 "${char.name}"라는 캐릭터입니다. 아래 설정에 맞게 대화해주세요.

[캐릭터 기본 설정]
${char.persona || '특별한 설정 없음'}

[배경 및 세계관]
${char.background || '특별한 배경 없음'}

[주변 환경]
${char.environment || '특별한 환경 없음'}

[규칙]
- 항상 "${char.name}"의 말투와 성격으로 대화하세요.
- 설정 밖의 내용은 캐릭터 관점에서 자연스럽게 대응하세요.
- 한국어로 대화하세요.
- ${char.greeting ? `대화 시작 인사: "${char.greeting}"` : ''}`;
}

export default router;
