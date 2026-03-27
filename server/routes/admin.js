import express from 'express';
import pool from '../db.js';
import { adjustUserPointBalance, getChatPointCostForUser, getPointSettings, getStoryLimitForUser, savePointSettings } from '../db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveSessionUser } from '../session.js';
import { hydrateCharacterRow } from '../persona.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const router = express.Router();

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

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

function parseJsonField(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toPercent(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateInput(value, fallback = null) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function floorToGranularity(date, granularity) {
    const next = new Date(date);
    if (granularity === 'hour') {
        next.setUTCMinutes(0, 0, 0);
    } else {
        next.setUTCHours(0, 0, 0, 0);
    }
    return next;
}

function addGranularityStep(date, granularity) {
    const next = new Date(date);
    if (granularity === 'hour') {
        next.setUTCHours(next.getUTCHours() + 1);
    } else {
        next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
}

function formatBucketLabel(date, granularity) {
    const iso = date.toISOString();
    if (granularity === 'hour') {
        return `${iso.slice(0, 13).replace('T', ' ')}:00:00`;
    }
    return iso.slice(0, 10);
}

function buildFilledSeries(startDate, endDate, granularity, userRows, storyRows, messageRows) {
    const start = floorToGranularity(startDate, granularity);
    const end = floorToGranularity(endDate, granularity);
    const series = [];
    const index = new Map();

    for (let cursor = start; cursor <= end; cursor = addGranularityStep(cursor, granularity)) {
        const bucket = formatBucketLabel(cursor, granularity);
        const row = {
            bucket,
            userCount: 0,
            storyCount: 0,
            messageCount: 0,
            totalCount: 0,
        };
        index.set(bucket, row);
        series.push(row);
    }

    const applyRows = (rows, key) => {
        for (const row of rows) {
            const bucket = row.bucket;
            const target = index.get(bucket);
            if (!target) continue;
            target[key] = toNumber(row.value);
            target.totalCount = target.userCount + target.storyCount + target.messageCount;
        }
    };

    applyRows(userRows, 'userCount');
    applyRows(storyRows, 'storyCount');
    applyRows(messageRows, 'messageCount');

    for (const row of series) {
        row.totalCount = row.userCount + row.storyCount + row.messageCount;
    }

    return series;
}

function parseStatsRange(query = {}) {
    const presetRaw = String(query.preset || query.range || '24h').toLowerCase();
    const preset = ['24h', '7d', '30d', 'custom'].includes(presetRaw) ? presetRaw : '24h';
    const now = new Date();

    let end = parseDateInput(query.end, now);
    let start = parseDateInput(query.start, null);

    if (preset === '24h' && !query.start && !query.end) {
        end = now;
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (preset === '7d' && !query.start && !query.end) {
        end = now;
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (preset === '30d' && !query.start && !query.end) {
        end = now;
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (preset === 'custom') {
        start = parseDateInput(query.start, new Date(now.getTime() - 24 * 60 * 60 * 1000));
        end = parseDateInput(query.end, now);
    } else if (!query.start && !query.end) {
        end = now;
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        end = now;
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const spanHours = Math.max(1, (end.getTime() - start.getTime()) / (60 * 60 * 1000));
    const granularity = spanHours <= 48 ? 'hour' : 'day';

    return { preset, start, end, granularity };
}

async function fetchCountRows(tableName, start, end, granularity) {
    const bucketExpression = granularity === 'hour'
        ? "DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')"
        : "DATE_FORMAT(created_at, '%Y-%m-%d')";
    const [rows] = await pool.query(
        `SELECT ${bucketExpression} AS bucket, COUNT(*) AS value
         FROM ${tableName}
         WHERE created_at BETWEEN ? AND ?
         GROUP BY bucket
         ORDER BY bucket ASC`,
        [start, end]
    );
    return rows;
}

async function fetchRangeStats({ preset, start, end, granularity }) {
    const [userRows, storyRows, messageRows, summaryRows] = await Promise.all([
        fetchCountRows('users', start, end, granularity),
        fetchCountRows('stories', start, end, granularity),
        fetchCountRows('story_messages', start, end, granularity),
        pool.query(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE created_at BETWEEN ? AND ?) AS userCount,
                (SELECT COUNT(*) FROM stories WHERE created_at BETWEEN ? AND ?) AS storyCount,
                (SELECT COUNT(*) FROM story_messages WHERE created_at BETWEEN ? AND ?) AS messageCount,
                (SELECT COUNT(DISTINCT user_id) FROM stories WHERE created_at BETWEEN ? AND ?) AS storyOwnerCount,
                (SELECT COUNT(DISTINCT user_id) FROM story_messages WHERE created_at BETWEEN ? AND ?) AS activeWriterCount,
                (SELECT COUNT(*) FROM stories WHERE is_public=1 AND created_at BETWEEN ? AND ?) AS publicStoryCount,
                (SELECT COUNT(*) FROM users WHERE is_premium=1 AND created_at BETWEEN ? AND ?) AS premiumUserCount,
                (SELECT COUNT(*) FROM users WHERE is_suspended=1 AND created_at BETWEEN ? AND ?) AS suspendedUserCount
        `, [
            start, end,
            start, end,
            start, end,
            start, end,
            start, end,
            start, end,
            start, end,
            start, end,
        ])
    ]);

    const rangeSeries = buildFilledSeries(start, end, granularity, userRows, storyRows, messageRows);
    const summaryRow = summaryRows[0][0] || {};
    const totalCount = rangeSeries.reduce((sum, row) => sum + row.totalCount, 0);
    const bucketCount = rangeSeries.length || 1;

    return {
        selectedRange: {
            preset,
            start: start.toISOString(),
            end: end.toISOString(),
            granularity,
            label: `${formatBucketLabel(floorToGranularity(start, granularity), granularity)} ~ ${formatBucketLabel(floorToGranularity(end, granularity), granularity)}`,
        },
        rangeUsage: rangeSeries,
        rangeSummary: {
            userCount: toNumber(summaryRow.userCount),
            storyCount: toNumber(summaryRow.storyCount),
            messageCount: toNumber(summaryRow.messageCount),
            storyOwnerCount: toNumber(summaryRow.storyOwnerCount),
            activeWriterCount: toNumber(summaryRow.activeWriterCount),
            publicStoryCount: toNumber(summaryRow.publicStoryCount),
            premiumUserCount: toNumber(summaryRow.premiumUserCount),
            suspendedUserCount: toNumber(summaryRow.suspendedUserCount),
            totalCount,
            avgCountPerBucket: totalCount / bucketCount,
            bucketCount,
        },
    };
}

async function loadPointTransactions(limit = 150, conn = pool) {
    const [rows] = await conn.query(
        `
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
        LIMIT ?
        `,
        [limit]
    );
    return rows.map((row) => ({
        ...row,
        amount: toNumber(row.amount),
        balanceAfter: toNumber(row.balanceAfter),
        userId: toNumber(row.userId),
        referenceId: row.referenceId === null || row.referenceId === undefined ? null : toNumber(row.referenceId, null),
        createdBy: row.createdBy === null || row.createdBy === undefined ? null : toNumber(row.createdBy, null),
    }));
}

async function loadPointUserDetail(userId) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [userRows] = await conn.query(
            `
            SELECT
                id, name, email, role, provider,
                is_adult AS isAdult,
                is_premium AS isPremium,
                is_suspended AS isSuspended,
                can_publish_community AS canPublishCommunity,
                phone_number AS phoneNumber,
                phone_verified_at AS phoneVerifiedAt,
                pass_verified_at AS passVerifiedAt,
                adult_verified_at AS adultVerifiedAt,
                birth_date AS birthDate,
                point_balance AS pointBalance,
                created_at AS createdAt
            FROM users
            WHERE id=?
            LIMIT 1
            `,
            [userId]
        );
        if (!userRows.length) {
            await conn.rollback();
            return null;
        }

        const [storyRows] = await conn.query('SELECT COUNT(*) AS storyCount FROM stories WHERE user_id=?', [userId]);
        const recentTransactions = await loadPointTransactions(30, conn);
        await conn.commit();

        const user = userRows[0];
        const sessionLikeUser = {
            role: user.role,
            is_premium: Boolean(user.isPremium),
        };

        return {
            user: {
                ...user,
                pointBalance: toNumber(user.pointBalance),
            },
            storyCount: toNumber(storyRows[0]?.storyCount),
            storyLimit: getStoryLimitForUser(sessionLikeUser),
            chatCost: getChatPointCostForUser(sessionLikeUser),
            recentTransactions: recentTransactions.map((row) => ({
                ...row,
                userId: toNumber(row.userId),
                amount: toNumber(row.amount),
                balanceAfter: toNumber(row.balanceAfter),
                referenceId: row.referenceId === null || row.referenceId === undefined ? null : toNumber(row.referenceId, null),
                createdBy: row.createdBy === null || row.createdBy === undefined ? null : toNumber(row.createdBy, null),
            })),
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function buildPointDashboard() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [summaryRows] = await conn.query(`
            SELECT
                (SELECT COUNT(*) FROM users) AS userCount,
                (SELECT COUNT(*) FROM users WHERE is_premium=1) AS premiumUserCount,
                (SELECT COUNT(*) FROM users WHERE point_balance > 0) AS activePointUserCount,
                (SELECT COALESCE(SUM(point_balance), 0) FROM users) AS totalBalance,
                (SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) FROM point_transactions) AS totalInflow,
                (SELECT COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) FROM point_transactions) AS totalOutflow,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'welcome' THEN amount ELSE 0 END), 0) FROM point_transactions) AS welcomeGranted,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'topup' THEN amount ELSE 0 END), 0) FROM point_transactions) AS totalTopup,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'chat' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) FROM point_transactions) AS chatSpent,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'binding' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) FROM point_transactions) AS bindingSpent,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'admin_grant' THEN amount ELSE 0 END), 0) FROM point_transactions) AS adminGranted,
                (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'admin_deduct' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) FROM point_transactions) AS adminDeducted,
                (SELECT COUNT(*) FROM point_transactions) AS transactionCount,
                (SELECT COUNT(*) FROM point_transactions WHERE created_at >= NOW() - INTERVAL 24 HOUR) AS transactions24h,
                (SELECT COALESCE(SUM(amount), 0) FROM point_transactions WHERE created_at >= NOW() - INTERVAL 24 HOUR) AS net24h
        `);
        const ledgerRows = await loadPointTransactions(150, conn);
        const [topUsers] = await conn.query(`
            SELECT id, name, email, role, is_premium AS isPremium, point_balance AS pointBalance, created_at AS createdAt
            FROM users
            ORDER BY point_balance DESC, id DESC
            LIMIT 50
        `);
        const [transactionTypeRows] = await conn.query(`
            SELECT transaction_type AS label, COUNT(*) AS value
            FROM point_transactions
            GROUP BY transaction_type
            ORDER BY value DESC, label ASC
        `);
        const [dailyFlowRows] = await conn.query(`
            SELECT
                DATE_FORMAT(created_at, '%Y-%m-%d') AS bucket,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS inflow,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS outflow,
                COALESCE(SUM(amount), 0) AS net
            FROM point_transactions
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
            GROUP BY bucket
            ORDER BY bucket ASC
        `);
        await conn.commit();

        const summaryRow = summaryRows[0] || {};
        return {
            pointSettings: getPointSettings(),
            summary: {
                userCount: toNumber(summaryRow.userCount),
                premiumUserCount: toNumber(summaryRow.premiumUserCount),
                activePointUserCount: toNumber(summaryRow.activePointUserCount),
                totalBalance: toNumber(summaryRow.totalBalance),
                totalInflow: toNumber(summaryRow.totalInflow),
                totalOutflow: toNumber(summaryRow.totalOutflow),
                welcomeGranted: toNumber(summaryRow.welcomeGranted),
                totalTopup: toNumber(summaryRow.totalTopup),
                chatSpent: toNumber(summaryRow.chatSpent),
                adminGranted: toNumber(summaryRow.adminGranted),
                adminDeducted: toNumber(summaryRow.adminDeducted),
                transactionCount: toNumber(summaryRow.transactionCount),
                transactions24h: toNumber(summaryRow.transactions24h),
                net24h: toNumber(summaryRow.net24h),
            },
            ledger: ledgerRows,
            topUsers: topUsers.map((row) => ({
                ...row,
                id: toNumber(row.id),
                isPremium: toNumber(row.isPremium),
                pointBalance: toNumber(row.pointBalance),
            })),
            transactionTypes: transactionTypeRows.map((row) => ({
                label: row.label,
                value: toNumber(row.value),
            })),
            dailyFlow: dailyFlowRows.map((row) => ({
                bucket: row.bucket,
                inflow: toNumber(row.inflow),
                outflow: toNumber(row.outflow),
                net: toNumber(row.net),
            })),
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function refreshDashboard(res, query = {}) {
    const period = parseStatsRange(query);
    const [summaryRows] = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM users) AS userCount,
            (SELECT COUNT(*) FROM users WHERE role='admin') AS adminCount,
            (SELECT COUNT(*) FROM users WHERE is_premium=1) AS premiumCount,
            (SELECT COUNT(*) FROM users WHERE is_adult=1) AS adultCount,
            (SELECT COUNT(*) FROM users WHERE is_suspended=1) AS suspendedCount,
            (SELECT COUNT(*) FROM stories) AS storyCount,
            (SELECT COUNT(*) FROM stories WHERE is_public=1) AS publicStoryCount,
            (SELECT COUNT(*) FROM stories WHERE public_status='pending') AS publicRequestCount,
            (SELECT COUNT(*) FROM story_characters) AS characterCount,
            (SELECT COUNT(*) FROM story_messages) AS messageCount,
            (SELECT COUNT(DISTINCT user_id) FROM stories) AS storyOwnerCount,
            (SELECT COUNT(DISTINCT user_id) FROM story_messages) AS activeWriterCount,
            (SELECT COALESCE(SUM(point_balance), 0) FROM users) AS totalPointBalance,
            (SELECT COUNT(*) FROM point_transactions) AS pointTransactionCount,
            (SELECT COALESCE(SUM(CASE WHEN transaction_type='topup' THEN amount ELSE 0 END), 0) FROM point_transactions) AS pointTopupTotal,
            (SELECT COALESCE(SUM(CASE WHEN transaction_type='chat' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) FROM point_transactions) AS pointChatSpent,
            (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 24 HOUR) AS users24h,
            (SELECT COUNT(*) FROM stories WHERE updated_at >= NOW() - INTERVAL 24 HOUR) AS stories24h,
            (SELECT COUNT(*) FROM story_messages WHERE created_at >= NOW() - INTERVAL 24 HOUR) AS messages24h,
            (SELECT ROUND(COALESCE(SUM(data_length + index_length), 0) / 1024 / 1024, 2)
             FROM information_schema.tables
             WHERE table_schema = DATABASE()) AS databaseSizeMb
    `);

    const rawSummary = summaryRows[0] || {};
    const summary = {
        userCount: toNumber(rawSummary.userCount),
        adminCount: toNumber(rawSummary.adminCount),
        premiumCount: toNumber(rawSummary.premiumCount),
        adultCount: toNumber(rawSummary.adultCount),
        suspendedCount: toNumber(rawSummary.suspendedCount),
        storyCount: toNumber(rawSummary.storyCount),
        publicStoryCount: toNumber(rawSummary.publicStoryCount),
        publicRequestCount: toNumber(rawSummary.publicRequestCount),
        characterCount: toNumber(rawSummary.characterCount),
        messageCount: toNumber(rawSummary.messageCount),
        storyOwnerCount: toNumber(rawSummary.storyOwnerCount),
        activeWriterCount: toNumber(rawSummary.activeWriterCount),
        totalPointBalance: toNumber(rawSummary.totalPointBalance),
        pointTransactionCount: toNumber(rawSummary.pointTransactionCount),
        pointTopupTotal: toNumber(rawSummary.pointTopupTotal),
        pointChatSpent: toNumber(rawSummary.pointChatSpent),
        bindingSpent: toNumber(rawSummary.bindingSpent),
        users24h: toNumber(rawSummary.users24h),
        stories24h: toNumber(rawSummary.stories24h),
        messages24h: toNumber(rawSummary.messages24h),
        databaseSizeMb: rawSummary.databaseSizeMb === null || rawSummary.databaseSizeMb === undefined
            ? null
            : toNumber(rawSummary.databaseSizeMb, null),
    };

    const [users] = await pool.query(`
        SELECT id, name, email, role, provider, is_adult AS isAdult, is_premium AS isPremium, is_suspended AS isSuspended, can_publish_community AS canPublishCommunity, phone_number AS phoneNumber, phone_verified_at AS phoneVerifiedAt, pass_verified_at AS passVerifiedAt, adult_verified_at AS adultVerifiedAt, birth_date AS birthDate, point_balance AS pointBalance, created_at AS createdAt
        FROM users
        ORDER BY created_at DESC, id DESC
    `);

    const [stories] = await pool.query(`
        SELECT
            s.id,
            s.title,
            s.background,
            s.environment,
            s.is_public AS isPublic,
            s.public_status AS publicStatus,
            s.public_method AS publicMethod,
            s.cover_image_url AS coverImageUrl,
            s.public_requested_at AS publicRequestedAt,
            s.public_reviewed_at AS publicReviewedAt,
            s.public_review_message AS publicReviewMessage,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            u.name AS authorName,
            u.email AS authorEmail,
            COALESCE(char_counts.characterCount, 0) AS characterCount,
            COALESCE(msg_counts.messageCount, 0) AS messageCount
        FROM stories s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS characterCount
            FROM story_characters
            GROUP BY story_id
        ) char_counts ON char_counts.story_id = s.id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS messageCount
            FROM story_messages
            GROUP BY story_id
        ) msg_counts ON msg_counts.story_id = s.id
        ORDER BY s.updated_at DESC, s.id DESC
        LIMIT 25
    `);

    const [publicStories] = await pool.query(`
        SELECT
            s.id,
            s.title,
            s.background,
            s.environment,
            s.is_public AS isPublic,
            s.public_status AS publicStatus,
            s.public_method AS publicMethod,
            s.cover_image_url AS coverImageUrl,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            u.name AS authorName,
            COALESCE(char_counts.characterCount, 0) AS characterCount,
            COALESCE(msg_counts.messageCount, 0) AS messageCount
        FROM stories s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS characterCount
            FROM story_characters
            GROUP BY story_id
        ) char_counts ON char_counts.story_id = s.id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS messageCount
            FROM story_messages
            GROUP BY story_id
        ) msg_counts ON msg_counts.story_id = s.id
        WHERE s.is_public = 1
        ORDER BY s.updated_at DESC, s.id DESC
        LIMIT 12
    `);

    const [publicRequests] = await pool.query(`
        SELECT
            s.id,
            s.title,
            s.background,
            s.environment,
            s.is_public AS isPublic,
            s.public_status AS publicStatus,
            s.public_method AS publicMethod,
            s.cover_image_url AS coverImageUrl,
            s.public_requested_at AS publicRequestedAt,
            s.public_review_message AS publicReviewMessage,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            u.name AS authorName,
            u.email AS authorEmail,
            COALESCE(char_counts.characterCount, 0) AS characterCount,
            COALESCE(msg_counts.messageCount, 0) AS messageCount
        FROM stories s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS characterCount
            FROM story_characters
            GROUP BY story_id
        ) char_counts ON char_counts.story_id = s.id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS messageCount
            FROM story_messages
            GROUP BY story_id
        ) msg_counts ON msg_counts.story_id = s.id
        WHERE s.public_status = 'pending'
        ORDER BY COALESCE(s.public_requested_at, s.updated_at) DESC, s.id DESC
        LIMIT 20
    `);

    const [publicReviewHistory] = await pool.query(`
        SELECT
            s.id,
            s.title,
            s.background,
            s.environment,
            s.is_public AS isPublic,
            s.public_status AS publicStatus,
            s.cover_image_url AS coverImageUrl,
            s.public_requested_at AS publicRequestedAt,
            s.public_reviewed_at AS publicReviewedAt,
            s.public_review_message AS publicReviewMessage,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            u.name AS authorName,
            u.email AS authorEmail,
            COALESCE(char_counts.characterCount, 0) AS characterCount,
            COALESCE(msg_counts.messageCount, 0) AS messageCount
        FROM stories s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS characterCount
            FROM story_characters
            GROUP BY story_id
        ) char_counts ON char_counts.story_id = s.id
        LEFT JOIN (
            SELECT story_id, COUNT(*) AS messageCount
            FROM story_messages
            GROUP BY story_id
        ) msg_counts ON msg_counts.story_id = s.id
        WHERE (s.public_status = 'approved' AND s.public_method = 'approved')
           OR s.public_status = 'rejected'
        ORDER BY COALESCE(s.public_reviewed_at, s.updated_at) DESC, s.id DESC
        LIMIT 20
    `);

    const [messages] = await pool.query(`
        SELECT
            m.id,
            m.story_id AS storyId,
            s.title AS storyTitle,
            m.user_id AS userId,
            u.name AS authorName,
            m.role,
            m.content,
            m.created_at AS createdAt
        FROM story_messages m
        LEFT JOIN stories s ON s.id = m.story_id
        LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 30
    `);

    const [tableStats] = await pool.query(`
        SELECT
            table_name AS tableName,
            table_rows AS estimatedRows,
            ROUND((data_length + index_length) / 1024 / 1024, 2) AS sizeMb
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('users', 'stories', 'story_characters', 'story_messages', 'point_transactions')
        ORDER BY FIELD(table_name, 'users', 'stories', 'story_characters', 'story_messages', 'point_transactions')
    `);

    const [hourlyUsage] = await pool.query(`
        WITH RECURSIVE hours AS (
            SELECT DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 23 HOUR), '%Y-%m-%d %H:00:00') AS bucket
            UNION ALL
            SELECT DATE_FORMAT(DATE_ADD(STR_TO_DATE(bucket, '%Y-%m-%d %H:00:00'), INTERVAL 1 HOUR), '%Y-%m-%d %H:00:00')
            FROM hours
            WHERE bucket < DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00')
        ),
        user_hours AS (
            SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS bucket, COUNT(*) AS userCount
            FROM users
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 23 HOUR)
            GROUP BY bucket
        ),
        story_hours AS (
            SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS bucket, COUNT(*) AS storyCount
            FROM stories
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 23 HOUR)
            GROUP BY bucket
        ),
        message_hours AS (
            SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS bucket, COUNT(*) AS messageCount
            FROM story_messages
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 23 HOUR)
            GROUP BY bucket
        )
        SELECT
            hours.bucket AS bucket,
            COALESCE(user_hours.userCount, 0) AS userCount,
            COALESCE(story_hours.storyCount, 0) AS storyCount,
            COALESCE(message_hours.messageCount, 0) AS messageCount,
            COALESCE(user_hours.userCount, 0) + COALESCE(story_hours.storyCount, 0) + COALESCE(message_hours.messageCount, 0) AS totalCount
        FROM hours
        LEFT JOIN user_hours ON user_hours.bucket = hours.bucket
        LEFT JOIN story_hours ON story_hours.bucket = hours.bucket
        LEFT JOIN message_hours ON message_hours.bucket = hours.bucket
        ORDER BY hours.bucket ASC
    `);

    const [dailyUsage] = await pool.query(`
        WITH RECURSIVE days AS (
            SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY) AS day
            UNION ALL
            SELECT DATE_ADD(day, INTERVAL 1 DAY)
            FROM days
            WHERE day < CURDATE()
        ),
        user_days AS (
            SELECT DATE(created_at) AS day, COUNT(*) AS userCount
            FROM users
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY day
        ),
        story_days AS (
            SELECT DATE(created_at) AS day, COUNT(*) AS storyCount
            FROM stories
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY day
        ),
        message_days AS (
            SELECT DATE(created_at) AS day, COUNT(*) AS messageCount
            FROM story_messages
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY day
        )
        SELECT
            DATE_FORMAT(days.day, '%Y-%m-%d') AS bucket,
            COALESCE(user_days.userCount, 0) AS userCount,
            COALESCE(story_days.storyCount, 0) AS storyCount,
            COALESCE(message_days.messageCount, 0) AS messageCount,
            COALESCE(user_days.userCount, 0) + COALESCE(story_days.storyCount, 0) + COALESCE(message_days.messageCount, 0) AS totalCount
        FROM days
        LEFT JOIN user_days ON user_days.day = days.day
        LEFT JOIN story_days ON story_days.day = days.day
        LEFT JOIN message_days ON message_days.day = days.day
        ORDER BY days.day ASC
    `);

    const [providerCounts] = await pool.query(`
        SELECT provider AS label, COUNT(*) AS value
        FROM users
        GROUP BY provider
        ORDER BY value DESC, provider ASC
    `);

    const [roleCounts] = await pool.query(`
        SELECT role AS label, COUNT(*) AS value
        FROM users
        GROUP BY role
        ORDER BY value DESC, role ASC
    `);

    const [messageRoleCounts] = await pool.query(`
        SELECT role AS label, COUNT(*) AS value
        FROM story_messages
        GROUP BY role
        ORDER BY value DESC, role ASC
    `);

    const [storyVisibilityCounts] = await pool.query(`
        SELECT
            CASE WHEN is_public = 1 THEN '공개' ELSE '비공개' END AS label,
            COUNT(*) AS value
        FROM stories
        GROUP BY is_public
        ORDER BY value DESC
    `);

    const [averageRows] = await pool.query(`
        SELECT
            ROUND(COALESCE((SELECT COUNT(*) FROM story_messages) / NULLIF((SELECT COUNT(*) FROM stories), 0), 0), 2) AS avgMessagesPerStory,
            ROUND(COALESCE((SELECT COUNT(*) FROM story_characters) / NULLIF((SELECT COUNT(*) FROM stories), 0), 0), 2) AS avgCharactersPerStory,
            ROUND(COALESCE((SELECT COUNT(*) FROM stories WHERE is_public=1) / NULLIF((SELECT COUNT(*) FROM stories), 0), 0) * 100, 1) AS publicStoryRate,
            ROUND(COALESCE((SELECT COUNT(*) FROM users WHERE is_premium=1) / NULLIF((SELECT COUNT(*) FROM users), 0), 0) * 100, 1) AS premiumRate,
            ROUND(COALESCE((SELECT COUNT(*) FROM users WHERE is_suspended=1) / NULLIF((SELECT COUNT(*) FROM users), 0), 0) * 100, 1) AS suspendedRate,
            ROUND(COALESCE((SELECT COUNT(DISTINCT user_id) FROM story_messages) / NULLIF((SELECT COUNT(*) FROM users), 0), 0) * 100, 1) AS activeWriterRate
    `);

    const averageRow = averageRows[0] || {};
    const periodStats = await fetchRangeStats(period);

    const payload = {
        summary,
        users,
        stories,
        publicStories,
        publicRequests,
        publicReviewHistory,
        messages,
        tableStats: tableStats.map((row) => ({
            tableName: row.tableName,
            estimatedRows: toNumber(row.estimatedRows),
            sizeMb: row.sizeMb === null || row.sizeMb === undefined ? null : toNumber(row.sizeMb, null),
        })),
        databaseStats: {
            ...periodStats,
            hourlyUsage: hourlyUsage.map((row) => ({
                bucket: row.bucket,
                userCount: toNumber(row.userCount),
                storyCount: toNumber(row.storyCount),
                messageCount: toNumber(row.messageCount),
                totalCount: toNumber(row.totalCount),
            })),
            dailyUsage: dailyUsage.map((row) => ({
                bucket: row.bucket,
                userCount: toNumber(row.userCount),
                storyCount: toNumber(row.storyCount),
                messageCount: toNumber(row.messageCount),
                totalCount: toNumber(row.totalCount),
            })),
            providerCounts: providerCounts.map((row) => ({
                label: row.label,
                value: toNumber(row.value),
            })),
            roleCounts: roleCounts.map((row) => ({
                label: row.label,
                value: toNumber(row.value),
            })),
            messageRoleCounts: messageRoleCounts.map((row) => ({
                label: row.label,
                value: toNumber(row.value),
            })),
            storyVisibilityCounts: storyVisibilityCounts.map((row) => ({
                label: row.label,
                value: toNumber(row.value),
            })),
            averages: {
                avgMessagesPerStory: toPercent(averageRow.avgMessagesPerStory),
                avgCharactersPerStory: toPercent(averageRow.avgCharactersPerStory),
                publicStoryRate: toPercent(averageRow.publicStoryRate),
                premiumRate: toPercent(averageRow.premiumRate),
                suspendedRate: toPercent(averageRow.suspendedRate),
                activeWriterRate: toPercent(averageRow.activeWriterRate),
            },
        },
        database: {
            name: process.env.DB_NAME || null,
            sizeMb: summary.databaseSizeMb,
        },
    };

    return res.json(payload);
}

router.get('/dashboard', auth, requireAdmin, async (_req, res) => {
    try {
        await refreshDashboard(res, _req.query || {});
    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        res.status(500).json({ error: '관리자 대시보드 로드 실패' });
    }
});

router.get('/stories/:id', auth, requireAdmin, async (req, res) => {
    try {
        const storyId = req.params.id;
        const [storyRows] = await pool.query(`
            SELECT
                s.id,
                s.user_id AS userId,
                s.title,
                s.background,
                s.environment,
                s.viewer_settings AS viewerSettings,
                s.cover_image_url AS coverImageUrl,
                s.is_public AS isPublic,
                s.public_status AS publicStatus,
                s.public_method AS publicMethod,
                s.public_requested_at AS publicRequestedAt,
                s.public_reviewed_at AS publicReviewedAt,
                s.public_reviewed_by AS publicReviewedBy,
                s.public_review_message AS publicReviewMessage,
                s.created_at AS createdAt,
                s.updated_at AS updatedAt,
                u.name AS authorName,
                u.email AS authorEmail,
                u.role AS authorRole
            FROM stories s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.id=?
            LIMIT 1
        `, [storyId]);

        if (!storyRows.length) {
            return res.status(404).json({ error: '이야기를 찾을 수 없습니다.' });
        }

        const story = storyRows[0];
        const [characterRows] = await pool.query('SELECT * FROM story_characters WHERE story_id=? ORDER BY id ASC', [storyId]);
        const [messageRows] = await pool.query(`
            SELECT m.id, m.role, m.content, m.created_at AS createdAt, u.name AS authorName
            FROM story_messages m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.story_id=?
            ORDER BY m.created_at ASC, m.id ASC
            LIMIT 200
        `, [storyId]);

        res.json({
            story: {
                ...story,
                viewerSettings: parseJsonField(story.viewerSettings, null),
            },
            characters: characterRows.map(hydrateCharacterRow),
            messages: messageRows,
        });
    } catch (err) {
        console.error('Error loading admin story detail:', err);
        res.status(500).json({ error: '이야기 상세 로드 실패' });
    }
});

router.patch('/stories/:id/visibility', auth, requireAdmin, async (req, res) => {
    try {
        const storyId = req.params.id;
        const isPublic = req.body?.isPublic ? 1 : 0;
        const [result] = await pool.query(`
            UPDATE stories
            SET
                is_public=?,
                public_status=?,
                public_method=?,
                public_requested_at=?,
                public_reviewed_at=NOW(),
                public_reviewed_by=?,
                public_review_message=NULL
            WHERE id=?
        `, [
            isPublic,
            isPublic ? 'approved' : 'private',
            isPublic ? 'approved' : 'private',
            isPublic ? null : null,
            req.user.id,
            storyId,
        ]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '이야기를 찾을 수 없습니다.' });
        }
        return res.json({ ok: true, isPublic: Boolean(isPublic) });
    } catch (err) {
        console.error('Error updating story visibility:', err);
        res.status(500).json({ error: '이야기 공개 설정 실패' });
    }
});

router.patch('/stories/:id/review', auth, requireAdmin, async (req, res) => {
    try {
        const storyId = req.params.id;
        const action = String(req.body?.action || '').toLowerCase();
        const reason = String(req.body?.reason || '').trim();

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: '잘못된 요청입니다.' });
        }

        if (action === 'reject' && !reason) {
            return res.status(400).json({ error: '반려 사유를 입력해주세요.' });
        }

        const [result] = await pool.query(
            action === 'approve'
                ? `
                    UPDATE stories
                    SET
                        is_public=1,
                        public_status='approved',
                        public_method='approved',
                        public_requested_at=COALESCE(public_requested_at, NOW()),
                        public_reviewed_at=NOW(),
                        public_reviewed_by=?,
                        public_review_message=NULL
                    WHERE id=?
                `
                : `
                    UPDATE stories
                    SET
                        is_public=0,
                        public_status='rejected',
                        public_method='request',
                        public_reviewed_at=NOW(),
                        public_reviewed_by=?,
                        public_review_message=?
                    WHERE id=?
                `,
            action === 'approve'
                ? [req.user.id, storyId]
                : [req.user.id, reason, storyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '이야기를 찾을 수 없습니다.' });
        }

        return res.json({ ok: true, action });
    } catch (err) {
        console.error('Error reviewing story via admin:', err);
        res.status(500).json({ error: '승인 처리 실패' });
    }
});

router.delete('/stories/:id', auth, requireAdmin, async (req, res) => {
    try {
        const storyId = req.params.id;
        const [result] = await pool.query('DELETE FROM stories WHERE id=?', [storyId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '이야기를 찾을 수 없습니다.' });
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting story via admin:', err);
        res.status(500).json({ error: '이야기 삭제 실패' });
    }
});

router.get('/points/dashboard', auth, requireAdmin, async (_req, res) => {
    try {
        const payload = await buildPointDashboard();
        res.json(payload);
    } catch (err) {
        console.error('Error loading admin point dashboard:', err);
        res.status(500).json({ error: '포인트 대시보드를 불러올 수 없습니다.' });
    }
});

router.put('/points/settings', auth, requireAdmin, async (req, res) => {
    const nextSettings = req.body?.pointSettings || req.body || {};
    const chatPointCost = Math.trunc(Number(nextSettings.chatPointCost ?? nextSettings.chat_point_cost));
    const premiumChatPointCost = Math.trunc(Number(nextSettings.premiumChatPointCost ?? nextSettings.premium_chat_point_cost));
    const bindingPointCostPerPage = Math.trunc(Number(nextSettings.bindingPointCostPerPage ?? nextSettings.binding_point_cost_per_page));

    if (![chatPointCost, premiumChatPointCost, bindingPointCostPerPage].every((value) => Number.isInteger(value) && value >= 0)) {
        return res.status(400).json({ error: '포인트 수치는 0 이상의 정수로 입력해주세요.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const saved = await savePointSettings(conn, {
            chatPointCost,
            premiumChatPointCost,
            bindingPointCostPerPage,
        });
        await conn.commit();
        return res.json({
            ok: true,
            pointSettings: saved,
        });
    } catch (err) {
        await conn.rollback();
        console.error('Error updating admin point settings:', err);
        return res.status(500).json({ error: '포인트 설정을 저장할 수 없습니다.' });
    } finally {
        conn.release();
    }
});

router.get('/users/:id/detail', auth, requireAdmin, async (req, res) => {
    try {
        const detail = await loadPointUserDetail(req.params.id);
        if (!detail) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }
        return res.json(detail);
    } catch (err) {
        console.error('Error loading admin user detail:', err);
        res.status(500).json({ error: '회원 정보를 불러올 수 없습니다.' });
    }
});

router.post('/users/:id/points', auth, requireAdmin, async (req, res) => {
    const amount = Math.trunc(Number(req.body?.amount));
    const note = String(req.body?.note || '').trim();

    if (!Number.isInteger(amount) || amount === 0) {
        return res.status(400).json({ error: '변경할 포인트를 정확히 입력해주세요.' });
    }
    if (!note) {
        return res.status(400).json({ error: '포인트 변경 사유를 입력해주세요.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [targetRows] = await conn.query(
            'SELECT id, role FROM users WHERE id=? LIMIT 1 FOR UPDATE',
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

        return res.json({
            ok: true,
            pointBalance: pointResult.afterBalance,
            transactionId: pointResult.transactionId,
        });
    } catch (err) {
        await conn.rollback();
        console.error('Error adjusting admin user points:', err);
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

router.patch('/users/:id', auth, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { isPremium, isSuspended, canPublishCommunity } = req.body || {};

        const [targetRows] = await pool.query('SELECT id, role FROM users WHERE id=? LIMIT 1', [userId]);
        if (!targetRows.length) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }

        if (targetRows[0].role === 'admin') {
            return res.status(403).json({ error: '관리자 계정은 변경할 수 없습니다.' });
        }

        await pool.query(
            'UPDATE users SET is_premium=?, is_suspended=?, can_publish_community=? WHERE id=?',
            [isPremium ? 1 : 0, isSuspended ? 1 : 0, canPublishCommunity ? 1 : 0, userId]
        );

        return res.json({ ok: true });
    } catch (err) {
        console.error('Error updating admin user:', err);
        res.status(500).json({ error: '회원 상태 변경 실패' });
    }
});

export default router;
