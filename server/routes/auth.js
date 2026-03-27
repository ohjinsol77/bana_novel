import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pkg from 'passport-naver-v2';
const { Strategy: NaverStrategy } = pkg;
import { randomInt } from 'crypto';
import pool from '../db.js';
import {
    adjustUserPointBalance,
    getChatPointCostForUser,
    getStoryLimitForUser,
    PHONE_VERIFICATION_CODE_TTL_MINUTES,
    WELCOME_POINT_BONUS,
} from '../db.js';
import { resolveSessionUser } from '../session.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const router = express.Router();
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5174';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const PHONE_VERIFICATION_SECRET = process.env.PHONE_VERIFICATION_SECRET || process.env.JWT_SECRET;
const OAUTH_LINK_SECRET = process.env.OAUTH_LINK_SECRET || process.env.JWT_SECRET;
const PASSWORD_MIN_LENGTH = 8;
const OAUTH_PROVIDERS = new Set(['kakao', 'google', 'naver']);

function createAuthError(message, status = 400, code = 'AUTH_ERROR', extra = {}) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    Object.assign(error, extra);
    return error;
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeOAuthProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    if (!OAUTH_PROVIDERS.has(provider)) {
        throw createAuthError('지원하지 않는 SNS입니다.', 400, 'INVALID_OAUTH_PROVIDER');
    }
    return provider;
}

function normalizePhoneNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        throw createAuthError('휴대폰 번호를 입력해주세요.', 400, 'INVALID_PHONE_NUMBER');
    }

    const normalized = digits.startsWith('82') && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
    if (!/^01[016789]\d{7,8}$/.test(normalized)) {
        throw createAuthError('휴대폰 번호 형식이 올바르지 않습니다.', 400, 'INVALID_PHONE_NUMBER');
    }
    return normalized;
}

function normalizeBirthDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw createAuthError('생년월일은 YYYY-MM-DD 형식이어야 합니다.', 400, 'INVALID_BIRTH_DATE');
    }
    const date = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
        throw createAuthError('생년월일을 확인해주세요.', 400, 'INVALID_BIRTH_DATE');
    }
    return text;
}

function isAdultBirthDate(birthDate) {
    if (!birthDate) return false;
    const date = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    const age = today.getUTCFullYear() - date.getUTCFullYear();
    const monthDiff = today.getUTCMonth() - date.getUTCMonth();
    const dayDiff = today.getUTCDate() - date.getUTCDate();
    const effectiveAge = monthDiff > 0 || (monthDiff === 0 && dayDiff >= 0) ? age : age - 1;
    return effectiveAge >= 19;
}

function maskPhoneNumber(phoneNumber) {
    const value = normalizePhoneNumber(phoneNumber);
    if (value.length <= 4) return value;
    return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(-4)}`;
}

function generateVerificationCode() {
    return String(randomInt(0, 1000000)).padStart(6, '0');
}

function getVerificationProviderForPurpose(purpose) {
    return purpose === 'signup' ? 'sms' : 'pass';
}

function issuePhoneVerificationToken(payload) {
    return jwt.sign(
        {
            purpose: payload.purpose,
            verificationId: payload.verificationId,
            phoneNumber: payload.phoneNumber,
            provider: payload.provider || getVerificationProviderForPurpose(payload.purpose),
        },
        PHONE_VERIFICATION_SECRET,
        { expiresIn: '10m' }
    );
}

function verifyPhoneVerificationToken(token) {
    return jwt.verify(token, PHONE_VERIFICATION_SECRET);
}

function buildAuthUserPayload(user) {
    const storyLimit = getStoryLimitForUser(user);
    const chatPointCost = getChatPointCostForUser(user);
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider || 'local',
        is_adult: Boolean(user.is_adult),
        is_premium: Boolean(user.is_premium),
        is_suspended: Boolean(user.is_suspended),
        can_publish_community: Boolean(user.can_publish_community),
        phone_number: user.phone_number || null,
        phone_verified_at: user.phone_verified_at || null,
        pass_verified_at: user.pass_verified_at || null,
        adult_verified_at: user.adult_verified_at || null,
        birth_date: user.birth_date || null,
        linked_providers: Array.isArray(user.linked_providers) ? user.linked_providers : [],
        point_balance: Number(user.point_balance || 0),
        story_limit: storyLimit,
        chat_point_cost: chatPointCost,
    };
}

function issueOAuthLinkState({ userId, provider }) {
    return jwt.sign(
        {
            purpose: 'oauth_link',
            userId,
            provider,
        },
        OAUTH_LINK_SECRET,
        { expiresIn: '10m' }
    );
}

function verifyOAuthLinkState(state) {
    const payload = jwt.verify(state, OAUTH_LINK_SECRET);
    if (payload?.purpose !== 'oauth_link') {
        throw createAuthError('잘못된 연결 요청입니다.', 400, 'INVALID_OAUTH_LINK_STATE');
    }
    return payload;
}

async function loadLinkedProvidersByUserId(connOrPool, userId) {
    const [rows] = await connOrPool.query(
        'SELECT provider FROM user_oauth_identities WHERE user_id=? ORDER BY provider',
        [userId]
    );
    return rows.map((row) => row.provider);
}

async function sendVerificationCodeSms({ phoneNumber, code, purpose }) {
    const providerUrl = process.env.SMS_API_URL;
    const providerKey = process.env.SMS_API_KEY;
    const providerSender = process.env.SMS_SENDER || 'NovelAI';

    if (providerUrl && providerKey) {
        const response = await fetch(providerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerKey}`,
            },
            body: JSON.stringify({
                to: phoneNumber,
                sender: providerSender,
                message: `[${providerSender}] 인증번호는 ${code}입니다.`,
                purpose,
            }),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw createAuthError(
                `SMS 발송에 실패했습니다. ${detail || response.status}`,
                502,
                'SMS_SEND_FAILED'
            );
        }
        return { provider: 'api' };
    }

    if (process.env.NODE_ENV !== 'production' || process.env.SMS_DEV_MODE === '1') {
        console.log(`[SMS:${purpose}] ${phoneNumber} -> ${code}`);
        return { provider: 'dev', code };
    }

    throw createAuthError('SMS 발송 설정이 필요합니다.', 500, 'SMS_PROVIDER_REQUIRED');
}

async function sendVerificationCodePass({ phoneNumber, code, purpose }) {
    const providerUrl = process.env.PASS_API_URL || process.env.PASS_SMS_API_URL;
    const providerKey = process.env.PASS_API_KEY || process.env.PASS_SMS_API_KEY;
    const providerSender = process.env.PASS_SENDER || 'NovelAI PASS';

    if (providerUrl && providerKey) {
        const response = await fetch(providerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerKey}`,
            },
            body: JSON.stringify({
                to: phoneNumber,
                sender: providerSender,
                message: `[${providerSender}] PASS 인증번호는 ${code}입니다.`,
                purpose,
                provider: 'pass',
            }),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw createAuthError(
                `PASS 발송에 실패했습니다. ${detail || response.status}`,
                502,
                'PASS_SEND_FAILED'
            );
        }
        return { provider: 'api' };
    }

    if (process.env.NODE_ENV !== 'production' || process.env.PASS_DEV_MODE === '1') {
        console.log(`[PASS:${purpose}] ${phoneNumber} -> ${code}`);
        return { provider: 'dev', code };
    }

    throw createAuthError('PASS 발송 설정이 필요합니다.', 500, 'PASS_PROVIDER_REQUIRED');
}

async function sendVerificationCodeByProvider({ provider, phoneNumber, code, purpose }) {
    if (provider === 'pass') {
        return sendVerificationCodePass({ phoneNumber, code, purpose });
    }
    return sendVerificationCodeSms({ phoneNumber, code, purpose });
}

async function createPhoneVerification({ phoneNumber, purpose, provider, createdForUserId = null }) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const verificationPurpose = ['signup', 'identity', 'adult', 'topup'].includes(purpose) ? purpose : null;
    if (!verificationPurpose) {
        throw createAuthError('잘못된 인증 목적입니다.', 400, 'INVALID_VERIFICATION_PURPOSE');
    }
    const verificationProvider = provider || getVerificationProviderForPurpose(verificationPurpose);

    const code = generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + PHONE_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
    const conn = await pool.getConnection();
    let committed = false;

    try {
        await conn.beginTransaction();
        const [result] = await conn.query(
            `
            INSERT INTO phone_verifications (
                phone_number, provider, purpose, code_hash, expires_at, created_for_user_id
            ) VALUES (?, ?, ?, ?, ?, ?)
            `,
            [normalizedPhone, verificationProvider, verificationPurpose, codeHash, expiresAt, createdForUserId]
        );
        await conn.commit();
        committed = true;

        await sendVerificationCodeByProvider({
            provider: verificationProvider,
            phoneNumber: normalizedPhone,
            code,
            purpose: verificationPurpose,
        });

        return {
            verificationId: result.insertId,
            phoneNumber: normalizedPhone,
            maskedPhoneNumber: maskPhoneNumber(normalizedPhone),
            expiresAt: expiresAt.toISOString(),
            provider: verificationProvider,
            code: (process.env.NODE_ENV !== 'production' || process.env.SMS_DEV_MODE === '1' || process.env.PASS_DEV_MODE === '1') ? code : undefined,
        };
    } catch (err) {
        if (!committed) {
            await conn.rollback();
        }
        throw err;
    } finally {
        conn.release();
    }
}

async function confirmPhoneVerification({ verificationId, code, provider }) {
    const parsedVerificationId = Number(verificationId);
    const normalizedCode = String(code || '').trim();
    if (!Number.isInteger(parsedVerificationId) || parsedVerificationId <= 0) {
        throw createAuthError('인증 정보를 확인해주세요.', 400, 'INVALID_VERIFICATION_ID');
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw createAuthError('인증번호는 6자리 숫자입니다.', 400, 'INVALID_VERIFICATION_CODE');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            `
            SELECT id, phone_number AS phoneNumber, provider, purpose, code_hash AS codeHash, attempt_count AS attemptCount, expires_at AS expiresAt, verified_at AS verifiedAt, used_at AS usedAt
            FROM phone_verifications
            WHERE id=?
            LIMIT 1
            FOR UPDATE
            `,
            [parsedVerificationId]
        );

        if (!rows.length) {
            throw createAuthError('인증 요청을 찾을 수 없습니다.', 404, 'VERIFICATION_NOT_FOUND');
        }

        const record = rows[0];
        if (provider && record.provider !== provider) {
            throw createAuthError('인증 수단이 일치하지 않습니다.', 400, 'VERIFICATION_PROVIDER_MISMATCH');
        }
        const now = new Date();
        if (record.usedAt) {
            throw createAuthError('이미 사용된 인증입니다.', 400, 'VERIFICATION_ALREADY_USED');
        }
        if (new Date(record.expiresAt).getTime() < now.getTime()) {
            throw createAuthError('인증 시간이 만료되었습니다.', 410, 'VERIFICATION_EXPIRED');
        }
        if (Number(record.attemptCount || 0) >= 5) {
            throw createAuthError('인증 시도 횟수를 초과했습니다.', 429, 'VERIFICATION_LIMIT');
        }

        const matched = await bcrypt.compare(normalizedCode, record.codeHash);
        await conn.query(
            'UPDATE phone_verifications SET attempt_count = attempt_count + 1 WHERE id=?',
            [parsedVerificationId]
        );
        if (!matched) {
            throw createAuthError('인증번호가 일치하지 않습니다.', 400, 'VERIFICATION_CODE_MISMATCH');
        }

        if (!record.verifiedAt) {
            await conn.query(
                'UPDATE phone_verifications SET verified_at=NOW() WHERE id=?',
                [parsedVerificationId]
            );
        }

        await conn.commit();

        return {
            verificationToken: issuePhoneVerificationToken({
                verificationId: parsedVerificationId,
                phoneNumber: record.phoneNumber,
                purpose: record.purpose,
                provider: record.provider,
            }),
            phoneNumber: record.phoneNumber,
            purpose: record.purpose,
            provider: record.provider,
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function readLocalUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const [rows] = await pool.query(
        `
        SELECT *
        FROM users
        WHERE provider='local' AND LOWER(email)=?
        LIMIT 1
        `,
        [normalizedEmail]
    );
    return rows[0] || null;
}

async function loadOAuthIdentityUser(conn, provider, oauthId) {
    const [rows] = await conn.query(
        `
        SELECT u.*
        FROM user_oauth_identities i
        INNER JOIN users u ON u.id = i.user_id
        WHERE i.provider=? AND i.provider_user_id=?
        LIMIT 1
        FOR UPDATE
        `,
        [provider, oauthId]
    );
    return rows[0] || null;
}

async function loadLegacyOAuthUser(conn, provider, oauthId) {
    const [rows] = await conn.query(
        'SELECT * FROM users WHERE oauth_id=? AND provider=? LIMIT 1 FOR UPDATE',
        [oauthId, provider]
    );
    return rows[0] || null;
}

async function upsertOAuthIdentity(conn, {
    userId,
    provider,
    providerUserId,
    email = null,
    name = null,
    profileImg = null,
}) {
    await conn.query(
        `
        INSERT INTO user_oauth_identities (user_id, provider, provider_user_id, provider_email, provider_name, profile_img)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            provider_email = VALUES(provider_email),
            provider_name = VALUES(provider_name),
            profile_img = VALUES(profile_img)
        `,
        [userId, provider, providerUserId, email, name, profileImg]
    );
}

async function mergeUserRecords(conn, { targetUserId, sourceUserId }) {
    if (Number(targetUserId) === Number(sourceUserId)) return;
    await conn.query('UPDATE stories SET user_id=? WHERE user_id=?', [targetUserId, sourceUserId]);
    await conn.query('UPDATE story_messages SET user_id=? WHERE user_id=?', [targetUserId, sourceUserId]);
    await conn.query('UPDATE point_transactions SET user_id=? WHERE user_id=?', [targetUserId, sourceUserId]);
    await conn.query('UPDATE point_transactions SET created_by=? WHERE created_by=?', [targetUserId, sourceUserId]);
    await conn.query('UPDATE phone_verifications SET created_for_user_id=? WHERE created_for_user_id=?', [targetUserId, sourceUserId]);
    await conn.query('UPDATE user_oauth_identities SET user_id=? WHERE user_id=?', [targetUserId, sourceUserId]);
    await conn.query('DELETE FROM users WHERE id=?', [sourceUserId]);
}

// ── Upsert user & issue JWT ──────────────────────────────────
async function upsertUser({ oauth_id, provider, name, email, profile_img }) {
    const normalizedProvider = normalizeOAuthProvider(provider);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        let user = await loadOAuthIdentityUser(conn, normalizedProvider, oauth_id);
        const foundByIdentity = Boolean(user);
        let isNew = false;

        if (!user) {
            user = await loadLegacyOAuthUser(conn, normalizedProvider, oauth_id);
        }

        if (!user) {
            await conn.query(
                `INSERT INTO users (oauth_id, provider, name, email, profile_img, point_balance)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [oauth_id, normalizedProvider, name, email, profile_img]
            );
            user = await loadLegacyOAuthUser(conn, normalizedProvider, oauth_id);
            isNew = true;
        } else if (!foundByIdentity || user.provider !== 'local') {
            await conn.query(
                `UPDATE users
                 SET name=?, email=?, profile_img=?
                 WHERE id=?`,
                [name, email, profile_img, user.id]
            );
        }

        await upsertOAuthIdentity(conn, {
            userId: user.id,
            provider: normalizedProvider,
            providerUserId: oauth_id,
            email,
            name,
            profileImg: profile_img,
        });

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

        user.linked_providers = await loadLinkedProvidersByUserId(conn, user.id);

        await conn.commit();
        return user;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function linkOAuthIdentityToUser({ userId, provider, oauthId, name, email, profileImg }) {
    const normalizedProvider = normalizeOAuthProvider(provider);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [targetRows] = await conn.query(
            'SELECT * FROM users WHERE id=? LIMIT 1 FOR UPDATE',
            [userId]
        );
        if (!targetRows.length) {
            throw createAuthError('사용자를 찾을 수 없습니다.', 404, 'USER_NOT_FOUND');
        }

        const targetUser = targetRows[0];
        if (targetUser.provider !== 'local') {
            throw createAuthError('일반 계정에서만 SNS 연결이 가능합니다.', 400, 'OAUTH_LINK_REQUIRES_LOCAL');
        }

        const [identityRows] = await conn.query(
            `
            SELECT id, user_id AS userId, provider, provider_user_id AS providerUserId
            FROM user_oauth_identities
            WHERE provider=? AND provider_user_id=?
            LIMIT 1
            FOR UPDATE
            `,
            [normalizedProvider, oauthId]
        );

        if (identityRows.length) {
            const identity = identityRows[0];
            if (Number(identity.userId) !== Number(userId)) {
                await mergeUserRecords(conn, {
                    targetUserId: userId,
                    sourceUserId: Number(identity.userId),
                });
            }
        }

        await upsertOAuthIdentity(conn, {
            userId,
            provider: normalizedProvider,
            providerUserId: oauthId,
            email,
            name,
            profileImg,
        });

        const linkedProviders = await loadLinkedProvidersByUserId(conn, userId);

        await conn.commit();
        return {
            ...targetUser,
            linked_providers: linkedProviders,
        };
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
        done(null, {
            oauth_id: String(profile.id),
            provider: 'kakao',
            name: profile.displayName || profile.username,
            email: profile._json?.kakao_account?.email,
            profile_img: profile._json?.properties?.profile_image,
        });
    } catch (e) { done(e); }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        done(null, {
            oauth_id: profile.id,
            provider: 'google',
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            profile_img: profile.photos?.[0]?.value,
        });
    } catch (e) { done(e); }
}));

passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: process.env.NAVER_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        done(null, {
            oauth_id: String(profile.id),
            provider: 'naver',
            name: profile.displayName,
            email: profile.email,
            profile_img: profile.profileImage,
        });
    } catch (e) { done(e); }
}));

// ── Routes ───────────────────────────────────────────────────
const startOAuth = (provider, options = {}) => (req, res, next) => {
    const state = String(req.query.state || '').trim();
    return passport.authenticate(provider, {
        ...options,
        session: false,
        state: state || undefined,
    })(req, res, next);
};

const oauthCallback = (provider) => async (req, res) => {
    try {
        const state = String(req.query.state || '').trim();
        if (state) {
            const payload = verifyOAuthLinkState(state);
            if (payload.provider !== provider) {
                throw createAuthError('SNS 연결 대상이 일치하지 않습니다.', 400, 'OAUTH_LINK_PROVIDER_MISMATCH');
            }

            await linkOAuthIdentityToUser({
                userId: Number(payload.userId),
                provider,
                oauthId: String(req.user?.oauth_id || ''),
                name: req.user?.name || '',
                email: req.user?.email || null,
                profileImg: req.user?.profile_img || null,
            });
            return res.redirect(`${FRONTEND}/profile?linkSuccess=1`);
        }

        const user = await upsertUser(req.user);
        const token = makeToken(user);
        res.redirect(`${FRONTEND}/?token=${token}`);
    } catch (err) {
        console.error(`${provider} OAuth callback failed:`, err);
        const message = encodeURIComponent(err.message || 'SNS 연결에 실패했습니다.');
        res.redirect(`${FRONTEND}/profile?linkError=${message}`);
    }
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

router.post('/phone/request', async (req, res) => {
    try {
        const payload = await createPhoneVerification({
            phoneNumber: req.body?.phoneNumber,
            purpose: String(req.body?.purpose || 'signup'),
            createdForUserId: req.body?.createdForUserId ? Number(req.body.createdForUserId) : null,
        });
        res.json({
            verificationId: payload.verificationId,
            maskedPhoneNumber: payload.maskedPhoneNumber,
            expiresAt: payload.expiresAt,
            provider: payload.provider,
            debugCode: payload.code,
        });
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message || '인증번호 전송에 실패했습니다.',
            code: err.code || null,
        });
    }
});

router.post('/pass/request', async (req, res) => {
    try {
        const purpose = String(req.body?.purpose || '').trim();
        if (!['identity', 'adult', 'topup'].includes(purpose)) {
            return res.status(400).json({ error: 'PASS 인증은 본인확인, 성인인증, 충전용으로만 사용할 수 있습니다.' });
        }
        const payload = await createPhoneVerification({
            phoneNumber: req.body?.phoneNumber,
            purpose,
            provider: 'pass',
            createdForUserId: req.body?.createdForUserId ? Number(req.body.createdForUserId) : null,
        });
        res.json({
            verificationId: payload.verificationId,
            maskedPhoneNumber: payload.maskedPhoneNumber,
            expiresAt: payload.expiresAt,
            provider: payload.provider,
            debugCode: payload.code,
        });
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message || 'PASS 인증번호 전송에 실패했습니다.',
            code: err.code || null,
        });
    }
});

router.post('/phone/verify', async (req, res) => {
    try {
        const payload = await confirmPhoneVerification({
            verificationId: req.body?.verificationId,
            code: req.body?.code,
        });
        res.json({
            ...payload,
            expiresInMinutes: PHONE_VERIFICATION_CODE_TTL_MINUTES,
        });
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message || '인증번호 확인에 실패했습니다.',
            code: err.code || null,
        });
    }
});

router.post('/pass/verify', async (req, res) => {
    try {
        const payload = await confirmPhoneVerification({
            verificationId: req.body?.verificationId,
            code: req.body?.code,
            provider: 'pass',
        });
        if (!['identity', 'adult', 'topup'].includes(payload.purpose)) {
            return res.status(400).json({ error: 'PASS 인증용 인증만 사용할 수 있습니다.' });
        }
        res.json({
            ...payload,
            expiresInMinutes: PHONE_VERIFICATION_CODE_TTL_MINUTES,
        });
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message || 'PASS 인증번호 확인에 실패했습니다.',
            code: err.code || null,
        });
    }
});

router.post('/link/start', async (req, res) => {
    try {
        const user = await resolveSessionUser(req);
        const provider = normalizeOAuthProvider(req.body?.provider);

        const state = issueOAuthLinkState({
            userId: user.id,
            provider,
        });

        res.json({
            provider,
            state,
            url: `${API_BASE_URL}/auth/${provider}?state=${encodeURIComponent(state)}`,
        });
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message || 'SNS 연결 시작에 실패했습니다.',
            code: err.code || null,
        });
    }
});

router.post('/register', async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!name) {
        return res.status(400).json({ error: '이름을 입력해주세요.' });
    }
    if (!email) {
        return res.status(400).json({ error: '이메일을 입력해주세요.' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
        return res.status(400).json({ error: `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.` });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [existingRows] = await conn.query(
            'SELECT id FROM users WHERE provider=? AND LOWER(email)=? LIMIT 1 FOR UPDATE',
            ['local', email]
        );
        if (existingRows.length) {
            throw createAuthError('이미 가입된 이메일입니다.', 409, 'EMAIL_ALREADY_EXISTS');
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const oauthId = `local:${email}`;
        const [insertResult] = await conn.query(
            `
            INSERT INTO users (
                oauth_id, provider, name, email, password_hash, phone_number,
                phone_verified_at, birth_date, is_adult, adult_verified_at, point_balance
            ) VALUES (?, 'local', ?, ?, ?, NULL, NULL, NULL, 0, NULL, 0)
            `,
            [
                oauthId,
                name,
                email,
                passwordHash,
            ]
        );

        const [users] = await conn.query(
            'SELECT * FROM users WHERE id=? LIMIT 1 FOR UPDATE',
            [insertResult.insertId]
        );
        const user = users[0];

        const welcome = await adjustUserPointBalance(conn, {
            userId: user.id,
            amount: WELCOME_POINT_BONUS,
            transactionType: 'welcome',
            note: '회원가입 웰컴 포인트',
            referenceType: 'auth',
            referenceId: user.id,
        });

        await conn.commit();
        user.point_balance = welcome.afterBalance;

        const token = makeToken(user);
        res.json({
            token,
            user: {
                ...buildAuthUserPayload(user),
                point_balance: Number(user.point_balance || 0),
            },
        });
    } catch (err) {
        await conn.rollback();
        console.error('Local register failed:', err);
        res.status(err.status || 500).json({
            error: err.message || '회원가입에 실패했습니다.',
            code: err.code || null,
        });
    } finally {
        conn.release();
    }
});

router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
        return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    try {
        const user = await readLocalUserByEmail(email);
        if (!user || !user.password_hash) {
            return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        const matched = await bcrypt.compare(password, user.password_hash);
        if (!matched) {
            return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }
        if (Number(user.is_suspended) === 1) {
            return res.status(403).json({ error: '정지된 계정입니다.' });
        }

        const token = makeToken(user);
        res.json({
            token,
            user: {
                ...buildAuthUserPayload(user),
                point_balance: Number(user.point_balance || 0),
            },
        });
    } catch (err) {
        console.error('Local login failed:', err);
        res.status(err.status || 500).json({
            error: err.message || '로그인에 실패했습니다.',
            code: err.code || null,
        });
    }
});

// Kakao
router.get('/kakao', startOAuth('kakao'));
router.get('/kakao/callback',
    passport.authenticate('kakao', { session: false, failureRedirect: `${FRONTEND}/login` }),
    oauthCallback('kakao'));

// Google
router.get('/google', startOAuth('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND}/login` }),
    oauthCallback('google'));

// Naver
router.get('/naver', startOAuth('naver'));
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

async function completePassVerification(req, res, { requireBirthDate = false, updateAdultFields = false } = {}) {
    try {
        const user = await resolveSessionUser(req);
        const token = String(req.body?.verificationToken || '').trim();
        if (!token) {
            return res.status(400).json({ error: '인증 토큰이 필요합니다.' });
        }

        const payload = verifyPhoneVerificationToken(token);
        if (!['identity', 'adult', 'topup'].includes(payload.purpose)) {
            return res.status(400).json({ error: 'PASS 인증용 인증만 사용할 수 있습니다.' });
        }
        const [verificationRows] = await pool.query(
            `
            SELECT id, phone_number AS phoneNumber, provider, purpose, verified_at AS verifiedAt, used_at AS usedAt
            FROM phone_verifications
            WHERE id=? AND phone_number=? AND provider='pass' AND purpose=?
            LIMIT 1
            `,
            [payload.verificationId, payload.phoneNumber, payload.purpose]
        );
        if (!verificationRows.length || verificationRows[0].usedAt) {
            return res.status(400).json({ error: '유효한 인증 정보가 아닙니다.' });
        }

        const [rows] = await pool.query(
            'SELECT id, phone_number AS phoneNumber FROM users WHERE id=? LIMIT 1',
            [user.id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        await pool.query(
            `
            UPDATE users
            SET phone_number=?, phone_verified_at=NOW(), pass_verified_at=NOW(), adult_verified_at=NOW(), is_adult=1
            WHERE id=?
            `,
            [payload.phoneNumber, user.id]
        );
        await pool.query(
            'UPDATE phone_verifications SET used_at=NOW() WHERE id=?',
            [payload.verificationId]
        );

        const updatedUser = {
            ...user,
            phone_number: payload.phoneNumber,
            phone_verified_at: new Date().toISOString(),
            pass_verified_at: new Date().toISOString(),
            adult_verified_at: new Date().toISOString(),
            is_adult: true,
        };

        res.json({
            ok: true,
            user: buildAuthUserPayload(updatedUser),
        });
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message || 'PASS 인증에 실패했습니다.' });
    }
}

router.post('/me/phone', async (req, res) => {
    return completePassVerification(req, res);
});

router.post('/me/pass', async (req, res) => {
    return completePassVerification(req, res);
});

router.post('/me/adult', async (req, res) => {
    try {
        const user = await resolveSessionUser(req);
        const birthDate = normalizeBirthDate(req.body?.birthDate);
        const token = String(req.body?.verificationToken || '').trim();

        if (!token) {
            return res.status(400).json({ error: '인증 토큰이 필요합니다.' });
        }
        if (!birthDate) {
            return res.status(400).json({ error: '생년월일을 입력해주세요.' });
        }

        const payload = verifyPhoneVerificationToken(token);
        if (!['adult', 'identity', 'topup'].includes(payload.purpose)) {
            return res.status(400).json({ error: 'PASS 성인인증용 인증만 사용할 수 있습니다.' });
        }
        if (!isAdultBirthDate(birthDate)) {
            return res.status(400).json({ error: '성인만 인증할 수 있습니다.' });
        }

        const [verificationRows] = await pool.query(
            `
            SELECT id, phone_number AS phoneNumber, provider, used_at AS usedAt
            FROM phone_verifications
            WHERE id=? AND phone_number=? AND provider='pass' AND purpose=?
            LIMIT 1
            `,
            [payload.verificationId, payload.phoneNumber, payload.purpose]
        );
        if (!verificationRows.length || verificationRows[0].usedAt) {
            return res.status(400).json({ error: '유효한 인증 정보가 아닙니다.' });
        }

        await pool.query(
            `
            UPDATE users
            SET phone_number=?, phone_verified_at=NOW(), birth_date=?, is_adult=1, adult_verified_at=NOW(), pass_verified_at=NOW()
            WHERE id=?
            `,
            [payload.phoneNumber, birthDate, user.id]
        );
        await pool.query(
            'UPDATE phone_verifications SET used_at=NOW() WHERE id=?',
            [payload.verificationId]
        );

        res.json({
            ok: true,
            user: {
                ...buildAuthUserPayload({
                    ...user,
                    phone_number: payload.phoneNumber,
                    phone_verified_at: new Date().toISOString(),
                    birth_date: birthDate,
                    is_adult: true,
                    adult_verified_at: new Date().toISOString(),
                    pass_verified_at: new Date().toISOString(),
                }),
            },
        });
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message || 'PASS 성인인증에 실패했습니다.' });
    }
});

// Admin: 전체 사용자 목록
router.get('/users', async (req, res) => {
    try {
        const me = await resolveSessionUser(req);
        if (me.role !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });

        try {
            const [rows] = await pool.query('SELECT id, name, email, role, provider, is_adult AS isAdult, is_premium AS isPremium, is_suspended AS isSuspended, can_publish_community AS canPublishCommunity, phone_number AS phoneNumber, phone_verified_at AS phoneVerifiedAt, pass_verified_at AS passVerifiedAt, adult_verified_at AS adultVerifiedAt, birth_date AS birthDate, point_balance AS pointBalance, created_at AS createdAt FROM users ORDER BY id DESC');
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
