import express from 'express';
import pool from '../db.js';
import { adjustUserPointBalance, getChatPointCostForUser, getStoryLimitForUser, POINT_TOP_UP_OPTIONS } from '../db.js';
import { resolveSessionUser } from '../session.js';

const router = express.Router();

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

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: '관리자 권한 필요' });
    }
    next();
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadRecentTransactions(userId, limit = 20) {
    const [rows] = await pool.query(
        `
        SELECT
            id,
            user_id AS userId,
            amount,
            balance_after AS balanceAfter,
            transaction_type AS transactionType,
            note,
            reference_type AS referenceType,
            reference_id AS referenceId,
            created_by AS createdBy,
            created_at AS createdAt
        FROM point_transactions
        WHERE user_id=?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        `,
        [userId, limit]
    );
    return rows.map((row) => ({
        ...row,
        userId: toNumber(row.userId),
        amount: toNumber(row.amount),
        balanceAfter: toNumber(row.balanceAfter),
        referenceId: row.referenceId === null || row.referenceId === undefined ? null : toNumber(row.referenceId, null),
        createdBy: row.createdBy === null || row.createdBy === undefined ? null : toNumber(row.createdBy, null),
    }));
}

router.get('/me', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT point_balance AS pointBalance, is_premium AS isPremium, role FROM users WHERE id=? LIMIT 1',
            [req.user.id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        const pointBalance = toNumber(rows[0].pointBalance, 0);
        const chatCost = getChatPointCostForUser(req.user);
        const storyLimit = getStoryLimitForUser(req.user);
        const [storyRows] = await pool.query('SELECT COUNT(*) AS storyCount FROM stories WHERE user_id=?', [req.user.id]);
        const storyCount = toNumber(storyRows[0]?.storyCount, 0);

        res.json({
            pointBalance,
            chatCost,
            storyLimit,
            storyCount,
            canCharge: true,
            topUpOptions: POINT_TOP_UP_OPTIONS,
            recentTransactions: await loadRecentTransactions(req.user.id, 20),
        });
    } catch (err) {
        console.error('Error loading my points:', err);
        res.status(500).json({ error: '포인트 정보를 불러올 수 없습니다.' });
    }
});

router.post('/topup', auth, async (req, res) => {
    const amount = Math.floor(Number(req.body?.amount));
    const packageName = String(req.body?.packageName || '').trim();
    if (!Number.isFinite(amount) || amount < 50 || amount % 50 !== 0) {
        return res.status(400).json({
            error: '충전 금액은 50포인트 단위로 입력해주세요.',
            topUpOptions: POINT_TOP_UP_OPTIONS,
        });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const pointResult = await adjustUserPointBalance(conn, {
            userId: req.user.id,
            amount,
            transactionType: 'topup',
            note: packageName ? `${packageName} 충전` : `포인트 충전 +${amount}`,
            referenceType: 'topup',
            referenceId: null,
        });
        await conn.commit();
        res.json({
            ok: true,
            pointBalance: pointResult.afterBalance,
            transactionId: pointResult.transactionId,
        });
    } catch (err) {
        await conn.rollback();
        console.error('Error topping up points:', err);
        res.status(err.status || 500).json({
            error: err.message || '포인트 충전에 실패했습니다.',
            code: err.code || null,
            pointBalance: Number(err.pointBalance || 0),
            topUpOptions: err.topUpOptions || POINT_TOP_UP_OPTIONS,
        });
    } finally {
        conn.release();
    }
});

router.get('/admin/dashboard', auth, requireAdmin, async (req, res) => {
    try {
        const [summaryRows] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM users) AS userCount,
                (SELECT COUNT(*) FROM users WHERE is_premium=1) AS premiumUserCount,
                (SELECT COUNT(*) FROM users WHERE point_balance > 0) AS activePointUserCount,
                (SELECT COALESCE(SUM(point_balance), 0) FROM users) AS totalBalance,
                (SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) FROM point_transactions) AS totalInflow,
                (SELECT COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) FROM point_transactions) AS totalOutflow,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'welcome' THEN amount ELSE 0 END), 0) FROM point_transactions) AS welcomeGranted,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'topup' THEN amount ELSE 0 END), 0) FROM point_transactions) AS totalTopup,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'chat' AND amount < 0 THEN -amount ELSE 0 END), 0) FROM point_transactions) AS chatSpent,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'admin_grant' THEN amount ELSE 0 END), 0) FROM point_transactions) AS adminGranted,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'admin_deduct' THEN -amount ELSE 0 END), 0) FROM point_transactions) AS adminDeducted,
                (SELECT COUNT(*) FROM point_transactions) AS transactionCount,
                (SELECT COUNT(*) FROM point_transactions WHERE created_at >= NOW() - INTERVAL 24 HOUR) AS transactions24h,
                (SELECT COALESCE(SUM(amount), 0) FROM point_transactions WHERE created_at >= NOW() - INTERVAL 24 HOUR) AS net24h
        `);

        const [ledgerRows] = await pool.query(`
            SELECT
                p.id,
                p.user_id AS userId,
                u.name AS userName,
                u.email AS userEmail,
                u.role AS userRole,
                u.is_premium AS isPremium,
                p.amount,
                p.balance_after AS balanceAfter,
                p.transaction_type AS transactionType,
                p.note,
                p.reference_type AS referenceType,
                p.reference_id AS referenceId,
                p.created_by AS createdBy,
                p.created_at AS createdAt
            FROM point_transactions p
            LEFT JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT 150
        `);

        const [topUsers] = await pool.query(`
            SELECT id, name, email, role, is_premium AS isPremium, point_balance AS pointBalance, created_at AS createdAt
            FROM users
            ORDER BY point_balance DESC, id DESC
            LIMIT 50
        `);

        res.json({
            summary: {
                userCount: toNumber(summaryRows[0]?.userCount),
                premiumUserCount: toNumber(summaryRows[0]?.premiumUserCount),
                activePointUserCount: toNumber(summaryRows[0]?.activePointUserCount),
                totalBalance: toNumber(summaryRows[0]?.totalBalance),
                totalInflow: toNumber(summaryRows[0]?.totalInflow),
                totalOutflow: toNumber(summaryRows[0]?.totalOutflow),
                welcomeGranted: toNumber(summaryRows[0]?.welcomeGranted),
                totalTopup: toNumber(summaryRows[0]?.totalTopup),
                chatSpent: toNumber(summaryRows[0]?.chatSpent),
                adminGranted: toNumber(summaryRows[0]?.adminGranted),
                adminDeducted: toNumber(summaryRows[0]?.adminDeducted),
                transactionCount: toNumber(summaryRows[0]?.transactionCount),
                transactions24h: toNumber(summaryRows[0]?.transactions24h),
                net24h: toNumber(summaryRows[0]?.net24h),
            },
            ledger: ledgerRows,
            topUsers,
        });
    } catch (err) {
        console.error('Error loading point dashboard:', err);
        res.status(500).json({ error: '포인트 대시보드를 불러올 수 없습니다.' });
    }
});

router.get('/admin/users/:id', auth, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const [userRows] = await pool.query(
            `
            SELECT
                id, name, email, role, provider,
                is_adult AS isAdult,
                is_premium AS isPremium,
                is_suspended AS isSuspended,
                can_publish_community AS canPublishCommunity,
                point_balance AS pointBalance,
                created_at AS createdAt
            FROM users
            WHERE id=?
            LIMIT 1
            `,
            [userId]
        );
        if (!userRows.length) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }

        const [storyRows] = await pool.query(
            'SELECT COUNT(*) AS storyCount FROM stories WHERE user_id=?',
            [userId]
        );

        res.json({
            user: {
                ...userRows[0],
                pointBalance: toNumber(userRows[0].pointBalance, 0),
            },
            storyCount: toNumber(storyRows[0]?.storyCount, 0),
            recentTransactions: await loadRecentTransactions(userId, 20),
        });
    } catch (err) {
        console.error('Error loading point user detail:', err);
        res.status(500).json({ error: '회원 포인트 정보를 불러올 수 없습니다.' });
    }
});

router.post('/admin/users/:id/adjust', auth, requireAdmin, async (req, res) => {
    const amount = Math.floor(Number(req.body?.amount));
    const note = String(req.body?.note || '').trim();
    if (!Number.isFinite(amount) || amount === 0) {
        return res.status(400).json({ error: '변경 포인트를 입력해주세요.' });
    }
    if (!note) {
        return res.status(400).json({ error: '사유를 입력해주세요.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [targetRows] = await conn.query(
            'SELECT id, role, point_balance FROM users WHERE id=? LIMIT 1 FOR UPDATE',
            [req.params.id]
        );
        if (!targetRows.length) {
            const error = new Error('회원을 찾을 수 없습니다.');
            error.status = 404;
            throw error;
        }
        if (targetRows[0].role === 'admin') {
            const error = new Error('관리자 계정은 포인트를 변경할 수 없습니다.');
            error.status = 403;
            throw error;
        }

        const pointResult = await adjustUserPointBalance(conn, {
            userId: targetRows[0].id,
            amount,
            transactionType: amount > 0 ? 'admin_grant' : 'admin_deduct',
            note,
            referenceType: 'admin',
            referenceId: req.user.id,
            createdBy: req.user.id,
        });

        await conn.commit();
        res.json({ ok: true, pointBalance: pointResult.afterBalance, transactionId: pointResult.transactionId });
    } catch (err) {
        await conn.rollback();
        console.error('Error adjusting points:', err);
        res.status(err.status || 500).json({
            error: err.message || '포인트 조정에 실패했습니다.',
            code: err.code || null,
            pointBalance: Number(err.pointBalance || 0),
            requiredPoints: Number(err.requiredPoints || 0),
            shortage: Number(err.shortage || 0),
        });
    } finally {
        conn.release();
    }
});

router.get('/admin/users/:id/transactions', auth, requireAdmin, async (req, res) => {
    try {
        const transactions = await loadRecentTransactions(req.params.id, 50);
        res.json({ transactions });
    } catch (err) {
        console.error('Error loading point transactions:', err);
        res.status(500).json({ error: '포인트 내역을 불러올 수 없습니다.' });
    }
});

export default router;
