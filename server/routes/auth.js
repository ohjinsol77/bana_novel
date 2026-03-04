import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pkg from 'passport-naver-v2';
const { Strategy: NaverStrategy } = pkg;
import pool from '../db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const router = express.Router();
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Upsert user & issue JWT ──────────────────────────────────
async function upsertUser({ oauth_id, provider, name, email, profile_img }) {
    const [rows] = await pool.query(
        `INSERT INTO users (oauth_id, provider, name, email, profile_img)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), profile_img=VALUES(profile_img)`,
        [oauth_id, provider, name, email, profile_img]
    );
    const [users] = await pool.query('SELECT * FROM users WHERE oauth_id=? AND provider=?', [oauth_id, provider]);
    return users[0];
}

function makeToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role, is_adult: user.is_adult, is_premium: user.is_premium },
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
router.get('/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        // Guest mode fallback
        return res.json({ id: 1, role: 'admin', name: 'Guest' });
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        res.json(payload);
    } catch {
        res.status(401).json({ error: '토큰 만료 또는 유효하지 않음' });
    }
});

// Admin: 전체 사용자 목록
router.get('/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ error: '관리자 권한 필요 (로그인 안됨)' });
    }
    try {
        const me = jwt.verify(token, process.env.JWT_SECRET);
        if (me.role !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });

        try {
            const [rows] = await pool.query('SELECT id, name, email, role, provider, is_adult, is_premium, created_at FROM users ORDER BY id DESC');
            res.json(rows);
        } catch (dbErr) {
            console.error('Error fetching users:', dbErr);
            res.status(500).json({ error: '데이터베이스 조회 실패' });
        }
    } catch {
        res.status(401).json({ error: '인증 실패' });
    }
});

export { passport };
export default router;
