import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { appendFile, mkdir } from 'fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { formatCharacterPersona, hydrateCharacterRow } from '../persona.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const router = express.Router();
const GEMINI_FAILURE_MESSAGE = '(AI 집필에 실패했습니다. 연결을 확인하세요.)';
const GEMINI_ERROR_LOG_DIR = process.env.GEMINI_LOG_DIR || join(process.cwd(), 'server', 'logs');
const GEMINI_ERROR_LOG_PATH = join(GEMINI_ERROR_LOG_DIR, 'gemini-errors.log');
const CHAT_DEBUG_LOG_PATH = join(GEMINI_ERROR_LOG_DIR, 'chat-debug.log');

async function appendLogFile(filePath, details) {
    const logEntry = [
        `=== ${new Date().toISOString()} ===`,
        JSON.stringify(details, null, 2),
        '',
    ].join('\n');

    try {
        await mkdir(GEMINI_ERROR_LOG_DIR, { recursive: true });
        await appendFile(filePath, logEntry, 'utf8');
    } catch (logErr) {
        console.error('Gemini log write failed:', {
            path: filePath,
            baseDir: GEMINI_ERROR_LOG_DIR,
            error: logErr?.message || String(logErr),
        });
    }
}

async function writeGeminiErrorLog(details) {
    await appendLogFile(GEMINI_ERROR_LOG_PATH, details);
}

async function writeChatDebugLog(details) {
    await appendLogFile(CHAT_DEBUG_LOG_PATH, details);
}

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        // Guest mode fallback: use ID 1 (Admin/Seed user)
        req.user = { id: 1, role: 'admin', name: '손님' };
        return next();
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: '토큰 만료' });
    }
}

// 대화 이력 조회 (이제 스토리 단위)
router.get('/:storyId', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM story_messages
             WHERE story_id=? AND user_id=?
             ORDER BY created_at ASC LIMIT 500`,
            [req.params.storyId, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching story messages:', err);
        res.status(500).json({ error: '집필 기록 로드 실패' });
    }
});

// 스토리 한 단락 쓰기(유저) + AI 작가 생성
router.post('/:storyId', auth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: '내용 없음' });

        const storyId = req.params.storyId;
        await writeChatDebugLog({
            event: 'chat_request_received',
            storyId,
            userId: req.user.id,
            contentPreview: String(content).slice(0, 120),
        });

        // 1. 스토리 정보 가져오기
        const [stories] = await pool.query('SELECT * FROM stories WHERE id=? AND user_id=?', [storyId, req.user.id]);
        if (!stories.length) {
            await writeChatDebugLog({
                event: 'chat_story_not_found',
                storyId,
                userId: req.user.id,
            });
            return res.status(404).json({ error: '이야기를 찾을 수 없거나 권한이 없습니다.' });
        }
        const story = stories[0];

        // 2. 스토리 내 등장인물 목록 모두 가져오기
        const [characterRows] = await pool.query('SELECT * FROM story_characters WHERE story_id=?', [storyId]);
        const characters = characterRows.map(hydrateCharacterRow);

        // 사용자의 턴 기록 저장
        await pool.query(
            'INSERT INTO story_messages (story_id, user_id, role, content) VALUES (?,?,?,?)',
            [storyId, req.user.id, 'user', content]
        );

        // ── AI 작가 응답 생성 ──────────────────────────────────────
        let aiReply;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
            // 작가용 시스템 프롬프트 구성
            const systemPrompt = buildWriterPrompt(story, characters);
            const modelName = 'gemini-2.5-flash';

            // 최근 문맥 가져오기
            const [history] = await pool.query(
                `SELECT role, content FROM story_messages
                 WHERE story_id=? AND user_id=?
                 ORDER BY created_at DESC LIMIT 30`,
                [storyId, req.user.id]
            );

            const reversedHistory = history.reverse();
            const filteredHistory = reversedHistory.filter((msg) => {
                if (msg.role !== 'assistant') return true;
                const text = String(msg.content || '').trim();
                if (!text) return false;
                if (text === GEMINI_FAILURE_MESSAGE) return false;
                if (text.startsWith('[오류]')) return false;
                if (text.startsWith('(AI 작가 모의 응답)')) return false;
                return true;
            });

            const historyForModel = filteredHistory.length ? filteredHistory : [{ role: 'user', content }];
            const messages = historyForModel.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            await writeChatDebugLog({
                event: 'gemini_history_filtered',
                storyId,
                userId: req.user.id,
                rawHistoryCount: reversedHistory.length,
                usedHistoryCount: messages.length,
                droppedCount: reversedHistory.length - filteredHistory.length,
            });

            try {
                const requestBody = {
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: messages,
                    generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
                };

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    }
                );
                const rawBody = await response.text();
                let data = null;

                try {
                    data = rawBody ? JSON.parse(rawBody) : null;
                } catch {
                    data = null;
                }

                await writeChatDebugLog({
                    event: 'gemini_response_received',
                    storyId,
                    userId: req.user.id,
                    model: modelName,
                    status: response.status,
                    statusText: response.statusText,
                    hasCandidates: Boolean(data?.candidates?.length),
                    hasError: Boolean(data?.error),
                    requestBytes: Buffer.byteLength(JSON.stringify(requestBody), 'utf8'),
                    finishReason: data?.candidates?.[0]?.finishReason || null,
                });

                if (!response.ok) {
                    const errorDetails = {
                        model: modelName,
                        storyId,
                        userId: req.user.id,
                        status: response.status,
                        statusText: response.statusText,
                        error: data?.error || null,
                        promptFeedback: data?.promptFeedback || null,
                        body: data || rawBody,
                    };
                    console.error('Gemini API Error:', errorDetails);
                    await writeGeminiErrorLog(errorDetails);
                    aiReply = GEMINI_FAILURE_MESSAGE;
                } else {
                    const generatedText = data?.candidates?.[0]?.content?.parts
                        ?.map((part) => part?.text || '')
                        .join('')
                        .trim();

                    if (!generatedText) {
                        const errorDetails = {
                            model: modelName,
                            storyId,
                            userId: req.user.id,
                            promptFeedback: data?.promptFeedback || null,
                            finishReason: data?.candidates?.[0]?.finishReason || null,
                            candidates: data?.candidates || null,
                            body: data || rawBody,
                        };
                        console.error('Gemini API Empty Candidate:', errorDetails);
                        await writeGeminiErrorLog(errorDetails);
                        aiReply = GEMINI_FAILURE_MESSAGE;
                    } else {
                        aiReply = generatedText;
                        await writeChatDebugLog({
                            event: 'gemini_response_success',
                            storyId,
                            userId: req.user.id,
                            model: modelName,
                            outputLength: generatedText.length,
                        });
                    }
                }
            } catch (e) {
                console.error('Gemini Error:', e);
                await writeGeminiErrorLog({
                    model: modelName,
                    storyId,
                    userId: req.user.id,
                    exception: e?.message || String(e),
                    stack: e?.stack || null,
                });
                aiReply = GEMINI_FAILURE_MESSAGE;
            }
        } else {
            // Mock 응답
            aiReply = `(AI 작가 모의 응답) 입력하신 "${content}" 에 이어서, [${characters.map(c => c.name).join(', ')}] 인물들이 얽힌 다음 단락을 이어나갑니다. GEMINI API 키를 설정해주세요.`;
            await writeChatDebugLog({
                event: 'gemini_mock_response',
                storyId,
                userId: req.user.id,
            });
        }

        // AI 생성 문단 저장
        await pool.query(
            'INSERT INTO story_messages (story_id, user_id, role, content) VALUES (?,?,?,?)',
            [storyId, req.user.id, 'assistant', aiReply]
        );

        await writeChatDebugLog({
            event: 'chat_response_saved',
            storyId,
            userId: req.user.id,
            isFailureMessage: aiReply === GEMINI_FAILURE_MESSAGE,
        });

        res.json({ role: 'assistant', content: aiReply });
    } catch (err) {
        console.error('Error writing story:', err);
        await writeChatDebugLog({
            event: 'chat_route_exception',
            storyId: req.params.storyId,
            userId: req.user?.id || null,
            error: err?.message || String(err),
            stack: err?.stack || null,
        });
        res.status(500).json({ error: '집필 전송 실패' });
    }
});

// 대화 기록 초기화
router.delete('/:storyId/clear', auth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM story_messages WHERE story_id=? AND user_id=?',
            [req.params.storyId, req.user.id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Error clearing story messages:', err);
        res.status(500).json({ error: '초기화 실패' });
    }
});

function buildWriterPrompt(story, characters) {
    let prompt = `당신은 뛰어난 웹소설의 공동 작가입니다. 사용자와 함께 번갈아가며 훌륭한 소설 한 편을 만들어가야 합니다.
사용자의 지시나 대사가 입력되면, 아래에 주어진 <배경 세계관>과 <등장인물 설정>을 완벽하게 반영하여 이야기의 **다음 단락(상황 묘사, 대화 등)**을 소설체로 길고 생생하게 집필하세요. 사용자가 등장인물 중 한 명의 시점이 될 수도, 전지적 작가 시점이 될 수도 있습니다.

<소설 배경 및 세계관>
제목: ${story.title}
배경: ${story.background || '특별한 배경 없음'}
주변 환경: ${story.environment || '특별한 환경 없음'}

<등장인물 설정 (총 ${characters.length}명)>
`;

    characters.forEach((c, i) => {
        prompt += `\n[페르소나 ${i + 1}]\n${formatCharacterPersona(c)}\n`;
    });

    prompt += `
<집필 규칙>
1. 사용자의 직전 입력을 부드럽게 이어받아 흥미진진하게 내용을 전개하세요.
2. 각 캐릭터의 성격과 말투를 일관성 있게 묘사하세요. 여러 캐릭터가 동시에 대화하거나 얽히는 장면을 적극적으로 묘사하세요.
3. 한국어 웹소설 문체를 사용하세요. 지문과 대화를 적절히 분배하세요.
4. AI임을 암시하는 말("네, 이어서 작성하겠습니다" 등)은 절대 출력하지 말고 바로 소설 본문만 작성하세요.`;

    return prompt;
}

export default router;
