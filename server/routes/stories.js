import express from 'express';
import pool from '../db.js';
import { getStoryLimitForUser } from '../db.js';
import { hydrateCharacterRow, serializeCharacterPayload } from '../persona.js';
import { resolveSessionUser } from '../session.js';

const router = express.Router();

function parseJsonField(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizePublicStatus(value) {
    return ['private', 'pending', 'approved', 'rejected'].includes(value) ? value : 'private';
}

function normalizePublicMethod(value) {
    return ['private', 'request', 'approved', 'direct'].includes(value) ? value : null;
}

function canDirectPublish(user) {
    return user?.role === 'admin' || Boolean(user?.can_publish_community);
}

function resolvePublicStoryState(currentStory, requestedMethod, requestedPublic, user) {
    const status = normalizePublicStatus(currentStory?.public_status);
    const currentMethod = normalizePublicMethod(currentStory?.public_method);
    let method = normalizePublicMethod(requestedMethod);

    if (!method) {
        if (requestedPublic) {
            method = canDirectPublish(user) ? 'direct' : 'request';
        } else if (currentMethod) {
            method = currentMethod;
        } else if (status === 'approved' && currentStory?.is_public) {
            method = 'approved';
        } else if (status === 'pending') {
            method = 'request';
        } else {
            method = 'private';
        }
    }

    if (method === 'approved' && status !== 'approved') {
        method = requestedPublic ? (canDirectPublish(user) ? 'direct' : 'request') : 'private';
    }

    if (method === 'direct' && !canDirectPublish(user)) {
        const error = new Error('직접 공개 권한이 없습니다.');
        error.status = 403;
        throw error;
    }

    if (method === 'private') {
        return {
            is_public: 0,
            public_status: 'private',
            public_method: 'private',
            public_requested_at: null,
            public_reviewed_at: null,
            public_reviewed_by: null,
            public_review_message: null,
        };
    }

    if (method === 'request') {
        const requestedAt = status === 'pending'
            ? (currentStory?.public_requested_at || new Date())
            : new Date();

        return {
            is_public: 0,
            public_status: 'pending',
            public_method: 'request',
            public_requested_at: requestedAt,
            public_reviewed_at: null,
            public_reviewed_by: null,
            public_review_message: null,
        };
    }

    if (method === 'direct') {
        return {
            is_public: 1,
            public_status: 'approved',
            public_method: 'direct',
            public_requested_at: null,
            public_reviewed_at: null,
            public_reviewed_by: null,
            public_review_message: null,
        };
    }

    if (status === 'approved') {
        return {
            is_public: 1,
            public_status: 'approved',
            public_method: 'approved',
            public_requested_at: currentStory?.public_requested_at || null,
            public_reviewed_at: currentStory?.public_reviewed_at || null,
            public_reviewed_by: currentStory?.public_reviewed_by || null,
            public_review_message: currentStory?.public_review_message || null,
        };
    }

    return {
        is_public: 0,
        public_status: 'private',
        public_method: 'private',
        public_requested_at: null,
        public_reviewed_at: null,
        public_reviewed_by: null,
        public_review_message: null,
    };
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

async function updateStorySettingsHandler(req, res) {
    try {
        const storyId = req.params.id;
        const { viewer_settings } = req.body;

        // 권한 체크
        const [check] = await pool.query('SELECT id FROM stories WHERE id=? AND user_id=?', [storyId, req.user.id]);
        if (!check.length) return res.status(403).json({ error: '권한이 없습니다.' });

        await pool.query(
            'UPDATE stories SET viewer_settings=? WHERE id=? AND user_id=?',
            [JSON.stringify(viewer_settings), storyId, req.user.id]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('Error updating story settings:', err);
        res.status(500).json({ error: '설정 저장 실패: ' + err.message });
    }
}

// ── 내 이야기 목록 조회 ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
    try {
        const [stories] = await pool.query(
            'SELECT * FROM stories WHERE user_id=? ORDER BY updated_at DESC',
            [req.user.id]
        );

        // 붙어있는 등장인물 정보까지 같이 가져오기 (초기 로드를 위해)
        for (let story of stories) {
            const [chars] = await pool.query('SELECT * FROM story_characters WHERE story_id=?', [story.id]);
            story.characters = chars.map(hydrateCharacterRow);
            story.viewer_settings = parseJsonField(story.viewer_settings, null);
        }

        res.json(stories);
    } catch (err) {
        console.error('Error fetching stories:', err);
        res.status(500).json({ error: '서버 오류: ' + err.message });
    }
});

// ── 단일 이야기 상세 조회 ───────────────────────────────────
router.get('/:id', auth, async (req, res) => {
    try {
        const [stories] = await pool.query('SELECT * FROM stories WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!stories.length) return res.status(404).json({ error: '이야기를 찾을 수 없습니다.' });

        const story = stories[0];
        const [chars] = await pool.query('SELECT * FROM story_characters WHERE story_id=?', [story.id]);
        story.characters = chars.map(hydrateCharacterRow);
        story.viewer_settings = parseJsonField(story.viewer_settings, null);

        res.json(story);
    } catch (err) {
        console.error('Error fetching story:', err);
        res.status(500).json({ error: '서버 오류: ' + err.message });
    }
});

// ── 새 이야기 및 등장인물 생성 ──────────────────────────────
router.post('/', auth, async (req, res) => {
    const conn = await pool.getConnection(); // 트랜잭션을 위해 단일 커넥션 확보
    try {
        await conn.beginTransaction();

        const { title, background, environment, is_public, public_method, characters } = req.body;

        if (!title) throw new Error('이야기 제목은 필수입니다.');
        if (characters && characters.length > 7) throw new Error('등장인물은 최대 7명까지만 가능합니다.');

        const [countRows] = await conn.query('SELECT COUNT(*) AS storyCount FROM stories WHERE user_id=?', [req.user.id]);
        const storyCount = Number(countRows[0]?.storyCount || 0);
        const storyLimit = getStoryLimitForUser(req.user);
        if (storyCount >= storyLimit) {
            const error = new Error(`이야기는 최대 ${storyLimit}개까지 보유할 수 있습니다.`);
            error.status = 403;
            error.code = 'STORY_LIMIT_REACHED';
            error.storyCount = storyCount;
            error.storyLimit = storyLimit;
            throw error;
        }

        const publicState = resolvePublicStoryState(null, public_method, Boolean(is_public), req.user);

        // 1. 이야기(방) 생성
        const [storyResult] = await conn.query(
            `INSERT INTO stories (
                user_id, title, background, environment, is_public, public_status, public_method,
                public_requested_at, public_reviewed_at, public_reviewed_by, public_review_message, cover_image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                title,
                background,
                environment,
                publicState.is_public,
                publicState.public_status,
                publicState.public_method,
                publicState.public_requested_at,
                publicState.public_reviewed_at,
                publicState.public_reviewed_by,
                publicState.public_review_message,
                null,
            ]
        );
        const storyId = storyResult.insertId;

        // 2. 등장인물들 생성
        if (characters && characters.length > 0) {
            for (const char of characters) {
                const { name, personaJson } = serializeCharacterPayload(char);
                if (!name) throw new Error('등장인물의 이름이 누락되었습니다.');
                await conn.query(
                    `INSERT INTO story_characters (story_id, name, persona_json)
                     VALUES (?, ?, ?)`,
                    [storyId, name, personaJson]
                );
            }
        }

        await conn.commit();

        // 생성된 완성본 반환
        const [rows] = await conn.query('SELECT * FROM stories WHERE id=?', [storyId]);
        const story = rows[0];
        const [chars] = await conn.query('SELECT * FROM story_characters WHERE story_id=?', [storyId]);
        story.characters = chars.map(hydrateCharacterRow);
        story.viewer_settings = parseJsonField(story.viewer_settings, null);

        res.json(story);
    } catch (err) {
        await conn.rollback();
        console.error('Error creating story:', err);
        res.status(err.status || 500).json({
            error: (err.status ? err.message : '이야기 생성 실패: ' + err.message),
            code: err.code || null,
            storyCount: Number(err.storyCount || 0),
            storyLimit: Number(err.storyLimit || 0),
        });
    } finally {
        conn.release();
    }
});

// ── 이야기 설정(뷰어설정)만 개별 업데이트 ────────────────────
router.put('/settings/:id', auth, updateStorySettingsHandler);
router.put('/:id/settings', auth, updateStorySettingsHandler);

// ── 이야기 수정 (등장인물 포함) ─────────────────────────────
router.put('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const storyId = req.params.id;
        const { title, background, environment, is_public, public_method, cover_image_url, characters } = req.body;

        // 본인 소유 확인
        const [check] = await conn.query('SELECT id, public_status, public_method, public_requested_at, public_reviewed_at, public_reviewed_by, public_review_message, cover_image_url FROM stories WHERE id=? AND user_id=?', [storyId, req.user.id]);
        if (!check.length) throw new Error('권한이 없거나 이야기를 찾을 수 없습니다.');
        if (characters && characters.length > 7) throw new Error('등장인물은 최대 7명까지만 가능합니다.');
        const currentStory = check[0];
        const publicState = resolvePublicStoryState(currentStory, public_method, Boolean(is_public), req.user);
        const nextCoverImageUrl = normalizePublicStatus(currentStory.public_status) === 'approved' && typeof cover_image_url === 'string'
            ? cover_image_url
            : currentStory.cover_image_url || null;

        // 1. 이야기 메인 정보 업데이트
        await conn.query(
            `UPDATE stories SET title=?, background=?, environment=?, is_public=?, public_status=?, public_method=?, public_requested_at=?, public_reviewed_at=?, public_reviewed_by=?, public_review_message=?, cover_image_url=?
             WHERE id=? AND user_id=?`,
            [
                title,
                background,
                environment,
                publicState.is_public,
                publicState.public_status,
                publicState.public_method,
                publicState.public_requested_at,
                publicState.public_reviewed_at,
                publicState.public_reviewed_by,
                publicState.public_review_message,
                nextCoverImageUrl,
                storyId,
                req.user.id,
            ]
        );

        // 2. 등장인물 업데이트 (단순화를 위해 기존 인물 삭제 후 재생성)
        // ※ 실제 프로덕션에서는 세밀한 diff 처리를 하거나 id 매핑을 해야하지만, 배열 전체 덮어쓰기 방식으로 구현
        await conn.query('DELETE FROM story_characters WHERE story_id=?', [storyId]);

        if (characters && characters.length > 0) {
            for (const char of characters) {
                const { name, personaJson } = serializeCharacterPayload(char);
                if (!name) throw new Error('등장인물의 이름이 누락되었습니다.');
                await conn.query(
                    `INSERT INTO story_characters (story_id, name, persona_json)
                     VALUES (?, ?, ?)`,
                    [storyId, name, personaJson]
                );
            }
        }

        await conn.commit();

        const [rows] = await conn.query('SELECT * FROM stories WHERE id=?', [storyId]);
        const story = rows[0];
        const [chars] = await conn.query('SELECT * FROM story_characters WHERE story_id=?', [storyId]);
        story.characters = chars.map(hydrateCharacterRow);
        story.viewer_settings = parseJsonField(story.viewer_settings, null);

        res.json(story);
    } catch (err) {
        await conn.rollback();
        console.error('Error updating story:', err);
        res.status(err.status || 500).json({ error: (err.status ? err.message : '수정 실패: ' + err.message) });
    } finally {
        conn.release();
    }
});

router.get('/community', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                s.id,
                s.title,
                s.background,
                s.environment,
                s.cover_image_url AS coverImageUrl,
                s.public_status AS publicStatus,
                s.public_method AS publicMethod,
                s.is_public AS isPublic,
                s.updated_at AS updatedAt,
                s.created_at AS createdAt,
                u.name AS authorName,
                u.role AS authorRole
            FROM stories s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.is_public = 1
              AND s.public_status = 'approved'
              AND s.user_id <> ?
            ORDER BY s.updated_at DESC, s.id DESC
            LIMIT 100
        `, [req.user.id]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching community stories:', err);
        res.status(500).json({ error: '커뮤니티 목록을 불러올 수 없습니다.' });
    }
});

// ── 이야기 삭제 ─────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
    try {
        // ON DELETE CASCADE 설정이 되어있으므로 stories만 지우면 캐릭터와 메시지도 날아감
        await pool.query('DELETE FROM stories WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting story:', err);
        res.status(500).json({ error: '이야기 삭제 실패: ' + err.message });
    }
});

// ── 공개 이야기 목록 조회 ───────────────────────────────────
router.get('/public/feed', async (_req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                s.id,
                s.title,
                s.background,
                s.environment,
                s.cover_image_url AS coverImageUrl,
                s.public_method AS publicMethod,
                s.updated_at AS updatedAt,
                u.name AS authorName
            FROM stories s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.is_public=1
              AND s.public_method IN ('approved', 'direct')
            ORDER BY s.updated_at DESC, s.id DESC
            LIMIT 50
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching public stories:', err);
        res.status(500).json({ error: '서버 오류: ' + err.message });
    }
});

export default router;
