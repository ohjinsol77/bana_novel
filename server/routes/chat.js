import express from 'express';
import pool from '../db.js';
import { appendFile, mkdir } from 'fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { adjustUserPointBalance, getChatPointCostForUser, POINT_TOP_UP_OPTIONS } from '../db.js';
import { formatCharacterPersona, hydrateCharacterRow } from '../persona.js';
import { resolveSessionUser } from '../session.js';

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
    resolveSessionUser(req)
        .then((user) => {
            req.user = user;
            next();
        })
        .catch((err) => {
            res.status(err.status || 401).json({ error: err.message || '토큰 만료' });
        });
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

// AI가 작성한 메시지 수정
router.put('/:storyId/messages/:messageId', auth, async (req, res) => {
    try {
        const storyId = Number(req.params.storyId);
        const messageId = Number(req.params.messageId);
        const content = String(req.body?.content || '').trim();

        if (!storyId || !messageId) {
            return res.status(400).json({ error: '잘못된 요청입니다.' });
        }

        if (!content) {
            return res.status(400).json({ error: '수정할 내용을 입력해주세요.' });
        }

        const [storyRows] = await pool.query(
            'SELECT id FROM stories WHERE id=? AND user_id=? LIMIT 1',
            [storyId, req.user.id]
        );
        if (!storyRows.length) {
            return res.status(403).json({ error: '권한이 없습니다.' });
        }

        const [messageRows] = await pool.query(
            'SELECT id, role FROM story_messages WHERE id=? AND story_id=? AND user_id=? LIMIT 1',
            [messageId, storyId, req.user.id]
        );
        if (!messageRows.length) {
            return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
        }

        if (messageRows[0].role !== 'assistant') {
            return res.status(403).json({ error: 'AI가 작성한 글만 수정할 수 있습니다.' });
        }

        await pool.query(
            'UPDATE story_messages SET content=? WHERE id=? AND story_id=? AND user_id=? AND role=\'assistant\'',
            [content, messageId, storyId, req.user.id]
        );

        const [updatedRows] = await pool.query(
            'SELECT id, story_id, user_id, role, content, created_at FROM story_messages WHERE id=? AND story_id=? AND user_id=? LIMIT 1',
            [messageId, storyId, req.user.id]
        );

        res.json(updatedRows[0] || { ok: true });
    } catch (err) {
        console.error('Error updating story message:', err);
        res.status(500).json({ error: '메시지 수정에 실패했습니다.' });
    }
});

// 스토리 한 단락 쓰기(유저) + AI 작가 생성
router.post('/:storyId', auth, async (req, res) => {
    const conn = await pool.getConnection();
    let chargedPoints = 0;
    let pointChargeTransactionId = null;
    let remainingPoints = Number(req.user?.point_balance || 0);
    let transactionCommitted = false;
    let userMessageSaved = false;
    let pointsRefunded = false;
    try {
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: '내용 없음' });

        const storyId = req.params.storyId;
        const chatCost = getChatPointCostForUser(req.user);
        await writeChatDebugLog({
            event: 'chat_request_received',
            storyId,
            userId: req.user.id,
            contentPreview: String(content).slice(0, 120),
        });

        // 1. 스토리 정보 가져오기
        const [stories] = await conn.query('SELECT * FROM stories WHERE id=? AND user_id=?', [storyId, req.user.id]);
        if (!stories.length) {
            await writeChatDebugLog({
                event: 'chat_story_not_found',
                storyId,
                userId: req.user.id,
            });
            return res.status(404).json({ error: '이야기를 찾을 수 없거나 권한이 없습니다.' });
        }
        const story = stories[0];

        await conn.beginTransaction();
        // 2. 스토리 내 등장인물 목록 모두 가져오기
        const [characterRows] = await conn.query('SELECT * FROM story_characters WHERE story_id=?', [storyId]);
        const characters = characterRows.map(hydrateCharacterRow);

        // 사용자의 턴 기록 저장
        await conn.query(
            'INSERT INTO story_messages (story_id, user_id, role, content) VALUES (?,?,?,?)',
            [storyId, req.user.id, 'user', content]
        );
        userMessageSaved = true;
        if (chatCost > 0) {
            const pointResult = await adjustUserPointBalance(conn, {
                userId: req.user.id,
                amount: -chatCost,
                transactionType: 'chat',
                note: `대화 차감 (${chatCost}P)`,
                referenceType: 'story',
                referenceId: Number(storyId),
            });
            chargedPoints = chatCost;
            pointChargeTransactionId = pointResult.transactionId;
            remainingPoints = pointResult.afterBalance;
        }
        await conn.commit();
        transactionCommitted = true;

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
                    let generatedText = data?.candidates?.[0]?.content?.parts
                        ?.map((part) => part?.text || '')
                        .join('')
                        .trim();

                    // 토큰 제한(MAX_TOKENS) 등으로 인해 응답이 중간에 끊긴 경우, 마지막 완성된 형식의 문장까지만 유지합니다.
                    if (generatedText) {
                        const finishReason = data?.candidates?.[0]?.finishReason;
                        const isCutOff = finishReason === 'MAX_TOKENS' || !/[.!?”\'\"]$/.test(generatedText);
                        if (isCutOff && generatedText.length > 100) {
                            // 문장의 끝을 나타내는 구두점(., !, ?, 따옴표 등)으로 끝나는 덩어리들만 모두 모아 합침으로써 
                            // 뒤에 덜 작성된 미완성 문자열 찌꺼기를 깔끔하게 제거합니다.
                            const sentences = generatedText.match(/[^.!?”\'\"]+[.!?”\'\"]+/g);
                            if (sentences && sentences.length > 0) {
                                generatedText = sentences.join('').trim();
                            }
                        }
                    }

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

        if (aiReply === GEMINI_FAILURE_MESSAGE && chargedPoints > 0) {
            const refundConn = await pool.getConnection();
            try {
                await refundConn.beginTransaction();
                const refundResult = await adjustUserPointBalance(refundConn, {
                    userId: req.user.id,
                    amount: chargedPoints,
                    transactionType: 'refund',
                    note: 'AI 응답 실패 환불',
                    referenceType: 'story',
                    referenceId: Number(storyId),
                    createdBy: null,
                });
                await refundConn.commit();
                remainingPoints = refundResult.afterBalance;
                pointsRefunded = true;
            } catch (refundErr) {
                await refundConn.rollback();
                console.error('Point refund failed:', refundErr);
                await writeChatDebugLog({
                    event: 'chat_refund_failed',
                    storyId,
                    userId: req.user.id,
                    amount: chargedPoints,
                    chargeTransactionId: pointChargeTransactionId,
                    error: refundErr?.message || String(refundErr),
                });
            } finally {
                refundConn.release();
            }
        }

        // AI 생성 문단 저장
        await conn.query(
            'INSERT INTO story_messages (story_id, user_id, role, content) VALUES (?,?,?,?)',
            [storyId, req.user.id, 'assistant', aiReply]
        );

        await writeChatDebugLog({
            event: 'chat_response_saved',
            storyId,
            userId: req.user.id,
            isFailureMessage: aiReply === GEMINI_FAILURE_MESSAGE,
        });

        res.json({
            role: 'assistant',
            content: aiReply,
            remainingPoints,
            pointsCharged: aiReply === GEMINI_FAILURE_MESSAGE ? 0 : chargedPoints,
        });
    } catch (err) {
        try {
            if (!transactionCommitted && conn && conn.connection && conn.connection._closing !== true) {
                await conn.rollback();
            }
        } catch {
            // ignore rollback failure
        }
        if (transactionCommitted && chargedPoints > 0 && !pointsRefunded) {
            const refundConn = await pool.getConnection();
            try {
                await refundConn.beginTransaction();
                const refundResult = await adjustUserPointBalance(refundConn, {
                    userId: req.user.id,
                    amount: chargedPoints,
                    transactionType: 'refund',
                    note: userMessageSaved ? '집필 실패 자동 환불' : '포인트 차감 오류 환불',
                    referenceType: 'story',
                    referenceId: Number(req.params.storyId),
                });
                await refundConn.commit();
                remainingPoints = refundResult.afterBalance;
                pointsRefunded = true;
            } catch (refundErr) {
                await refundConn.rollback();
                console.error('Point rollback refund failed:', refundErr);
            } finally {
                refundConn.release();
            }
        }
        console.error('Error writing story:', err);
        await writeChatDebugLog({
            event: 'chat_route_exception',
            storyId: req.params.storyId,
            userId: req.user?.id || null,
            error: err?.message || String(err),
            stack: err?.stack || null,
        });
        const isInsufficient = err.code === 'INSUFFICIENT_POINTS' || err.status === 402;
        res.status(err.status || (isInsufficient ? 402 : 500)).json({
            error: isInsufficient
                ? '대화를 위한 포인트가 부족합니다. 충전하시겠습니까?'
                : (err.message || '집필 전송 실패'),
            code: err.code || null,
            pointBalance: Number(err.pointBalance || req.user?.point_balance || 0),
            requiredPoints: Number(err.requiredPoints || getChatPointCostForUser(req.user)),
            shortage: Number(err.shortage || 0),
            topUpOptions: err.topUpOptions || POINT_TOP_UP_OPTIONS,
            remainingPoints,
        });
    } finally {
        conn.release();
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
    let prompt = `당신은 뛰어난 웹소설의 공동 작가입니다. 직전 입력을 바탕으로, 아래에 주어진 <배경 세계관>과 <등장인물 설정>을 완벽하게 반영해 이야기의 **다음 장면(상황 묘사, 대화 등)**을 소설체로 길고 생생하게 작성하세요.
등장인물 설정은 모두 이야기 속 인물들의 성격, 관계, 역할을 뜻합니다. 이 정보는 소설 속 장면을 자연스럽게 이어 쓰는 데만 사용하세요.
등장인물 설정은 내부적으로 영어 키워드와 압축된 메타데이터로 전달될 수 있지만, 사용자 고유의 이름, 배경, 메모는 원문 그대로 해석하세요.

<소설 배경 및 세계관>
제목: ${story.title}
배경: ${story.background || '특별한 배경 없음'}
주변 환경: ${story.environment || '특별한 환경 없음'}

<등장인물 설정 (총 ${characters.length}명)>
`;

    characters.forEach((c, i) => {
        prompt += `\n[페르소나 ${i + 1}]\n${formatCharacterPersona(c)}\n`;
    });

    const protagonistNames = characters
        .filter((c) => c.isProtagonist)
        .map((c) => c.name)
        .filter(Boolean);

    if (protagonistNames.length) {
        prompt += `\n<주인공 설정>\n주인공으로 지정된 인물: ${protagonistNames.join(', ')}\n이 인물을 장면의 중심축으로 두고 이야기를 전개하세요.\n`;
    }

    prompt += `
<집필 규칙>
1. 직전 입력은 장면 지시로 받아들이고, 그 흐름을 자연스럽게 이어서 흥미진진하게 전개하세요.
2. 각 캐릭터의 성격, 이야기 속 관계, 말투를 일관성 있게 묘사하세요. 독자나 작가와의 관계는 절대 언급하지 마세요. 여러 캐릭터가 동시에 대화하거나 얽히는 장면을 적극적으로 묘사하세요.
3. 반드시 한국어로만 웹소설 문체를 사용하세요. 지문과 대화를 적절히 분배하세요.
4. AI임을 암시하는 말("네, 이어서 작성하겠습니다" 등)은 절대 출력하지 말고 바로 소설 본문만 작성하세요.
5. 분량은 적절히(한국어 약 1000자~1500자 내외) 조절하여, 글이 도중에 잘리지 않도록 반드시 완전한 문장(마침표, 따옴표 등)으로 끝맺으세요.`;

    return prompt;
}

export default router;
