import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import { initDB } from './db.js';
import authRouter, { passport } from './routes/auth.js';
import storiesRouter from './routes/stories.js';
import chatRouter from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
    origin: true, // Allow all origins for debugging
    credentials: true,
}));
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/chat', chatRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Boot ────────────────────────────────────────────────────
async function start() {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`\n🚀 Bana Novel 🍌 백엔드 서버 실행 중: http://localhost:${PORT}`);
            console.log(`📋 헬스체크: http://localhost:${PORT}/health\n`);
        });
    } catch (err) {
        console.error('❌ 서버 시작 실패:', err.message);
        console.error('💡 server/.env 파일의 DB 설정을 확인하세요.');
    }
}

start();
