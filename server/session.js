import jwt from 'jsonwebtoken';
import pool from './db.js';

function createSessionError(message, status = 401, code = 'SESSION_ERROR') {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

export async function resolveSessionUser(req, { allowGuestAdmin = false } = {}) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        if (allowGuestAdmin) {
            return { id: 1, name: '손님', email: '', role: 'admin', is_adult: false, is_premium: false, is_suspended: false };
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
        'SELECT id, name, email, role, is_adult, is_premium, is_suspended FROM users WHERE id=? LIMIT 1',
        [payload.id]
    );

    if (!rows.length) {
        throw createSessionError('사용자를 찾을 수 없습니다.', 401, 'USER_NOT_FOUND');
    }

    const user = rows[0];
    if (Number(user.is_suspended) === 1) {
        throw createSessionError('정지된 계정입니다.', 403, 'SUSPENDED');
    }

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_adult: Boolean(user.is_adult),
        is_premium: Boolean(user.is_premium),
        is_suspended: Boolean(user.is_suspended),
    };
}

export function getSessionErrorMessage(err) {
    return err?.message || '인증 실패';
}
