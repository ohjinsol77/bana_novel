import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pkg from 'passport-naver-v2';
const { Strategy: NaverStrategy } = pkg;
import pool from '../db.js';
import { adjustUserPointBalance, getChatPointCostForUser, getStoryLimitForUser, WELCOME_POINT_BONUS } from '../db.js';
import { resolveSessionUser } from '../session.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const router = express.Router();
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5174';

// ── Upsert user & issue JWT ──────────────────────────────────
async function upsertUser({ oauth_id, provider, name, email, profile_img }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [existingRows] = await conn.query(
            'SELECT * FROM users WHERE oauth_id=? AND provider=? LIMIT 1 FOR UPDATE',
            [oauth_id, provider]
        );
        const isNew = !existingRows.length;

        if (isNew) {
            await conn.query(
                `INSERT INTO users (oauth_id, provider, name, email, profile_img, point_balance)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [oauth_id, provider, name, email, profile_img]
            );
        } else {
            await conn.query(
                `UPDATE users
                 SET name=?, email=?, profile_img=?
                 WHERE oauth_id=? AND provider=?`,
                [name, email, profile_img, oauth_id, provider]
            );
        }

        const [users] = await conn.query(
            `SELECT *
             FROM users
             WHERE oauth_id=? AND provider=?
             LIMIT 1
             FOR UPDATE`,
            [oauth_id, provider]
        );
        const user = users[0];

        if (isNew) {
            const result = await adjustUserPointBalance(conn, {
                userId: user.id,
                amount: WELCOME_POINT_BONUS,
                transactionType: 'welcome',
                note: '회원가입 웰컴 포인트',
                referenceType: 'auth',
                referenceId: user.id,
            });
            user.point_balance = result.afterBalance;
        }

        await conn.commit();
        return user;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function getOrCreateAppleAdminUser() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [existingRows] = await conn.query(
            'SELECT * FROM users WHERE oauth_id=? AND provider=? LIMIT 1 FOR UPDATE',
            ['admin_seed', 'local']
        );

        if (!existingRows.length) {
            await conn.query(
                `INSERT INTO users (oauth_id, provider, name, email, role, point_balance)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['admin_seed', 'local', '관리자', 'admin@novelai.com', 'admin', 0]
            );
        }

        const [rows] = await conn.query(
            'SELECT * FROM users WHERE oauth_id=? AND provider=? LIMIT 1 FOR UPDATE',
            ['admin_seed', 'local']
        );
        const user = rows[0];

        if (String(user.role) !== 'admin') {
            await conn.query('UPDATE users SET role=? WHERE id=?', ['admin', user.id]);
            user.role = 'admin';
        }

        await conn.commit();
        return user;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

function makeToken(user) {
    return jwt.sign(
        {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_adult: user.is_adult,
            is_premium: user.is_premium,
            can_publish_community: Boolean(user.can_publish_community),
            point_balance: Number(user.point_balance || 0),
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// ── Passport strategies ──────────────────────────────────────
passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    callbackURL: process.env.KAKAO_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await upsertUser({
            oauth_id: String(profile.id),
            provider: 'kakao',
            name: profile.displayName || profile.username,
            email: profile._json?.kakao_account?.email,
            profile_img: profile._json?.properties?.profile_image,
        });
        done(null, user);
    } catch (e) { done(e); }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await upsertUser({
            oauth_id: profile.id,
            provider: 'google',
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            profile_img: profile.photos?.[0]?.value,
        });
        done(null, user);
    } catch (e) { done(e); }
}));

passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: process.env.NAVER_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await upsertUser({
            oauth_id: String(profile.id),
            provider: 'naver',
            name: profile.displayName,
            email: profile.email,
            profile_img: profile.profileImage,
        });
        done(null, user);
    } catch (e) { done(e); }
}));

// ── Routes ───────────────────────────────────────────────────
const oauthCallback = (provider) => (req, res) => {
    const token = makeToken(req.user);
    res.redirect(`${FRONTEND}/?token=${token}`);
};

router.get('/apple', async (_req, res) => {
    try {
        const user = await getOrCreateAppleAdminUser();
        const token = makeToken(user);
        res.redirect(`${FRONTEND}/?token=${token}`);
    } catch (err) {
        console.error('Apple admin login failed:', err);
        res.status(500).send('애플 관리자 로그인에 실패했습니다.');
    }
});

// Kakao
router.get('/kakao', passport.authenticate('kakao'));
router.get('/kakao/callback',
    passport.authenticate('kakao', { session: false, failureRedirect: `${FRONTEND}/login` }),
    oauthCallback('kakao'));

// Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND}/login` }),
    oauthCallback('google'));

// Naver
router.get('/naver', passport.authenticate('naver'));
router.get('/naver/callback',
    passport.authenticate('naver', { session: false, failureRedirect: `${FRONTEND}/login` }),
    oauthCallback('naver'));

// Token verify (프론트엔드가 토큰으로 본인 정보 확인)
router.get('/me', async (req, res) => {
    try {
        const user = await resolveSessionUser(req);
        res.json({
            ...user,
            point_balance: Number(user.point_balance || 0),
            story_limit: getStoryLimitForUser(user),
            chat_point_cost: getChatPointCostForUser(user),
        });
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message || '토큰 만료 또는 유효하지 않음' });
    }
});

// Admin: 전체 사용자 목록
router.get('/users', async (req, res) => {
    try {
        const me = await resolveSessionUser(req);
        if (me.role !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });

        try {
            const [rows] = await pool.query('SELECT id, name, email, role, provider, is_adult AS isAdult, is_premium AS isPremium, is_suspended AS isSuspended, can_publish_community AS canPublishCommunity, point_balance AS pointBalance, created_at AS createdAt FROM users ORDER BY id DESC');
            res.json(rows);
        } catch (dbErr) {
            console.error('Error fetching users:', dbErr);
            res.status(500).json({ error: '데이터베이스 조회 실패' });
        }
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message || '인증 실패' });
    }
});

export { passport };
export default router;
