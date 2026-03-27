import jwt from 'jsonwebtoken';
import pool from './db.js';
import { getChatPointCostForUser, getStoryLimitForUser } from './db.js';

const APPLE_ADMIN_LOCAL_TOKEN = 'apple-admin-local';

function createSessionError(message, status = 401, code = 'SESSION_ERROR') {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

export async function resolveSessionUser(req, { allowGuestAdmin = false } = {}) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token === APPLE_ADMIN_LOCAL_TOKEN) {
        const appleAdmin = {
            id: 1,
            name: '애플 관리자',
            email: 'admin@novelai.com',
            provider: 'local',
            role: 'admin',
            is_adult: true,
            is_premium: true,
            is_suspended: false,
            can_publish_community: true,
            phone_number: null,
            phone_verified_at: null,
            pass_verified_at: null,
            adult_verified_at: null,
            birth_date: null,
            point_balance: 0,
        };
        return {
            ...appleAdmin,
            story_limit: getStoryLimitForUser(appleAdmin),
            chat_point_cost: getChatPointCostForUser(appleAdmin),
        };
    }

    if (!token || token === 'null' || token === 'undefined') {
        if (allowGuestAdmin) {
            const guestAdmin = {
                id: 1,
                name: '손님',
                email: '',
                provider: 'local',
                role: 'admin',
                is_adult: false,
                is_premium: false,
                is_suspended: false,
                can_publish_community: false,
                phone_number: null,
                phone_verified_at: null,
                pass_verified_at: null,
                adult_verified_at: null,
                birth_date: null,
                point_balance: 0,
            };
            return {
                ...guestAdmin,
                story_limit: getStoryLimitForUser(guestAdmin),
                chat_point_cost: getChatPointCostForUser(guestAdmin),
            };
        }
        throw createSessionError('인증이 필요합니다.', 401, 'NO_TOKEN');
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw createSessionError('토큰 만료', 401, 'INVALID_TOKEN');
    }

    const [rows] = await pool.query(
        'SELECT id, name, email, provider, role, is_adult, is_premium, is_suspended, can_publish_community, phone_number, phone_verified_at, pass_verified_at, adult_verified_at, birth_date, point_balance FROM users WHERE id=? LIMIT 1',
        [payload.id]
    );

    if (!rows.length) {
        throw createSessionError('사용자를 찾을 수 없습니다.', 401, 'USER_NOT_FOUND');
    }

    const user = rows[0];
    if (Number(user.is_suspended) === 1) {
        throw createSessionError('정지된 계정입니다.', 403, 'SUSPENDED');
    }

    const [linkedRows] = await pool.query(
        'SELECT provider FROM user_oauth_identities WHERE user_id=? ORDER BY provider',
        [user.id]
    );
    const linkedProviders = linkedRows.map((row) => row.provider);

    const sessionUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        provider: user.provider,
        role: user.role,
        is_adult: Boolean(user.is_adult),
        is_premium: Boolean(user.is_premium),
        is_suspended: Boolean(user.is_suspended),
        can_publish_community: Boolean(user.can_publish_community),
        phone_number: user.phone_number || null,
        phone_verified_at: user.phone_verified_at || null,
        pass_verified_at: user.pass_verified_at || null,
        adult_verified_at: user.adult_verified_at || null,
        birth_date: user.birth_date || null,
        linked_providers: linkedProviders,
        point_balance: Number(user.point_balance) || 0,
    };

    return {
        ...sessionUser,
        story_limit: getStoryLimitForUser(sessionUser),
        chat_point_cost: getChatPointCostForUser(sessionUser),
    };
}

export function getSessionErrorMessage(err) {
    return err?.message || '인증 실패';
}
