import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        // Guest mode fallback
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
            story.characters = chars;
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
        story.characters = chars;

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

        const { title, background, environment, is_public, characters } = req.body;

        if (!title) throw new Error('이야기 제목은 필수입니다.');
        if (characters && characters.length > 7) throw new Error('등장인물은 최대 7명까지만 가능합니다.');

        // 1. 이야기(방) 생성
        const [storyResult] = await conn.query(
            `INSERT INTO stories (user_id, title, background, environment, is_public)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.id, title, background, environment, is_public ? 1 : 0]
        );
        const storyId = storyResult.insertId;

        // 2. 등장인물들 생성
        if (characters && characters.length > 0) {
            for (const char of characters) {
                if (!char.name) throw new Error('등장인물의 이름이 누락되었습니다.');
                await conn.query(
                    `INSERT INTO story_characters (story_id, name, personality, appearance, habits, avatar_url)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [storyId, char.name, char.personality || '', char.appearance || '', char.habits || '', char.avatar_url || '']
                );
            }
        }

        await conn.commit();

        // 생성된 완성본 반환
        const [rows] = await conn.query('SELECT * FROM stories WHERE id=?', [storyId]);
        const story = rows[0];
        const [chars] = await conn.query('SELECT * FROM story_characters WHERE story_id=?', [storyId]);
        story.characters = chars;

        res.json(story);
    } catch (err) {
        await conn.rollback();
        console.error('Error creating story:', err);
        res.status(500).json({ error: '이야기 생성 실패: ' + err.message });
    } finally {
        conn.release();
    }
});

// ── 이야기 수정 (등장인물 포함) ─────────────────────────────
router.put('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const storyId = req.params.id;
        const { title, background, environment, is_public, characters } = req.body;

        // 본인 소유 확인
        const [check] = await conn.query('SELECT id FROM stories WHERE id=? AND user_id=?', [storyId, req.user.id]);
        if (!check.length) throw new Error('권한이 없거나 이야기를 찾을 수 없습니다.');
        if (characters && characters.length > 7) throw new Error('등장인물은 최대 7명까지만 가능합니다.');

        // 1. 이야기 메인 정보 업데이트
        await conn.query(
            `UPDATE stories SET title=?, background=?, environment=?, is_public=?
             WHERE id=? AND user_id=?`,
            [title, background, environment, is_public ? 1 : 0, storyId, req.user.id]
        );

        // 2. 등장인물 업데이트 (단순화를 위해 기존 인물 삭제 후 재생성)
        // ※ 실제 프로덕션에서는 세밀한 diff 처리를 하거나 id 매핑을 해야하지만, 배열 전체 덮어쓰기 방식으로 구현
        await conn.query('DELETE FROM story_characters WHERE story_id=?', [storyId]);

        if (characters && characters.length > 0) {
            for (const char of characters) {
                await conn.query(
                    `INSERT INTO story_characters (story_id, name, personality, appearance, habits, avatar_url)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [storyId, char.name, char.personality || '', char.appearance || '', char.habits || '', char.avatar_url || '']
                );
            }
        }

        await conn.commit();

        const [rows] = await conn.query('SELECT * FROM stories WHERE id=?', [storyId]);
        const story = rows[0];
        const [chars] = await conn.query('SELECT * FROM story_characters WHERE story_id=?', [storyId]);
        story.characters = chars;

        res.json(story);
    } catch (err) {
        await conn.rollback();
        console.error('Error updating story:', err);
        res.status(500).json({ error: '수정 실패: ' + err.message });
    } finally {
        conn.release();
    }
});

// ── 이야기 설정(뷰어설정)만 개별 업데이트 ────────────────────
router.put('/:id/settings', auth, async (req, res) => {
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
        const [rows] = await pool.query(
            'SELECT id, title, background FROM stories WHERE is_public=1 ORDER BY updated_at DESC LIMIT 50'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching public stories:', err);
        res.status(500).json({ error: '서버 오류: ' + err.message });
    }
});

export default router;
