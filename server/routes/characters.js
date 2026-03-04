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

// 내 캐릭터 목록 조회
router.get('/', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM characters WHERE user_id=? ORDER BY updated_at DESC',
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching characters:', err);
        res.status(500).json({ error: '서버 오류: ' + err.message });
    }
});

// 캐릭터 생성
router.post('/', auth, async (req, res) => {
    try {
        const { name, persona, greeting, background, environment, avatar_url, is_public } = req.body;
        if (!name) return res.status(400).json({ error: '이름은 필수입니다' });

        console.log('Creating character for user:', req.user.id, 'with data:', req.body);

        const [result] = await pool.query(
            `INSERT INTO characters (user_id, name, persona, greeting, background, environment, avatar_url, is_public)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, name, persona, greeting, background, environment, avatar_url, is_public ? 1 : 0]
        );
        const [rows] = await pool.query('SELECT * FROM characters WHERE id=?', [result.insertId]);
        res.json(rows[0]);
    } catch (err) {
        console.error('Error creating character:', err);
        res.status(500).json({ error: '캐릭터 생성 실패: ' + err.message });
    }
});

// 캐릭터 수정
router.put('/:id', auth, async (req, res) => {
    try {
        const { name, persona, greeting, background, environment, avatar_url, is_public } = req.body;
        await pool.query(
            `UPDATE characters SET name=?, persona=?, greeting=?, background=?, environment=?, avatar_url=?, is_public=?
             WHERE id=? AND user_id=?`,
            [name, persona, greeting, background, environment, avatar_url, is_public ? 1 : 0, req.params.id, req.user.id]
        );
        const [rows] = await pool.query('SELECT * FROM characters WHERE id=?', [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating character:', err);
        res.status(500).json({ error: '캐릭터 수정 실패: ' + err.message });
    }
});

// 캐릭터 삭제
router.delete('/:id', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM characters WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting character:', err);
        res.status(500).json({ error: '캐릭터 삭제 실패: ' + err.message });
    }
});

// 공개 캐릭터 목록 (탐색용)
router.get('/public', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, name, persona, avatar_url FROM characters WHERE is_public=1 ORDER BY updated_at DESC LIMIT 50'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching public characters:', err);
        res.status(500).json({ error: '서버 오류: ' + err.message });
    }
});

export default router;
