import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFile, mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import { initDB } from './db.js';
import authRouter, { passport } from './routes/auth.js';
import storiesRouter from './routes/stories.js';
import chatRouter from './routes/chat.js';
import adminRouter from './routes/admin.js';
import pointsRouter from './routes/points.js';

const app = express();
const PORT = process.env.PORT || 4000;
const LOG_DIR = process.env.GEMINI_LOG_DIR || join(process.cwd(), 'server', 'logs');
const HTTP_DEBUG_LOG_PATH = join(LOG_DIR, 'http-debug.log');
const RUNTIME_MARKER = 'bana-novel-runtime-2026-03-05-1635';

async function writeHttpDebugLog(payload) {
    const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`;
    try {
        await mkdir(LOG_DIR, { recursive: true });
        await appendFile(HTTP_DEBUG_LOG_PATH, line, 'utf8');
    } catch (err) {
        console.error('HTTP debug log write failed:', err?.message || String(err));
    }
}

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
    origin: true, // Allow all origins for debugging
    credentials: true,
}));
app.use((req, res, next) => {
    const startedAt = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.on('finish', () => {
        void writeHttpDebugLog({
            method: req.method,
            url: req.originalUrl || req.url,
            status: res.statusCode,
            ip: req.ip,
            userAgent: req.headers['user-agent'] || '',
            durationMs: Date.now() - startedAt,
        });
    });
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
app.use('/api/admin', adminRouter);
app.use('/api/points', pointsRouter);

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        runtimeMarker: RUNTIME_MARKER,
        logPath: HTTP_DEBUG_LOG_PATH,
    });
});

app.use((req, res) => {
    void writeHttpDebugLog({
        event: 'route_not_found',
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip,
    });
    res.status(404).json({ error: `요청 경로를 찾을 수 없습니다: ${req.method} ${req.originalUrl || req.url}` });
});

// ── Boot ────────────────────────────────────────────────────
async function start() {
    try {
        await initDB();
        await writeHttpDebugLog({
            event: 'server_boot',
            runtimeMarker: RUNTIME_MARKER,
            cwd: process.cwd(),
            logPath: HTTP_DEBUG_LOG_PATH,
            port: PORT,
        });
        app.listen(PORT, () => {
            console.log(`\n🚀 Bana Novel 🍌 백엔드 서버 실행 중: http://localhost:${PORT}`);
            console.log(`📋 헬스체크: http://localhost:${PORT}/health\n`);
            console.log(`🧩 Runtime Marker: ${RUNTIME_MARKER}`);
            console.log(`📝 HTTP Log Path: ${HTTP_DEBUG_LOG_PATH}\n`);
        });
    } catch (err) {
        console.error('❌ 서버 시작 실패:', err.message);
        console.error('💡 server/.env 파일의 DB 설정을 확인하세요.');
    }
}

start();
