import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'novelai_db',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
});

export const WELCOME_POINT_BONUS = 50;
export const NORMAL_STORY_LIMIT = 3;
export const PREMIUM_STORY_LIMIT = 30;
export const NORMAL_CHAT_POINT_COST = 15;
export const PREMIUM_CHAT_POINT_COST = 10;
export const POINT_TOP_UP_OPTIONS = [50, 100, 300, 500, 1000];

function createAppError(message, status = 400, code = 'APP_ERROR', extra = {}) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    Object.assign(error, extra);
    return error;
}

export function getStoryLimitForUser(user) {
    if (user?.role === 'admin') return PREMIUM_STORY_LIMIT;
    return user?.is_premium ? PREMIUM_STORY_LIMIT : NORMAL_STORY_LIMIT;
}

export function getChatPointCostForUser(user) {
    if (user?.role === 'admin') return 0;
    return user?.is_premium ? PREMIUM_CHAT_POINT_COST : NORMAL_CHAT_POINT_COST;
}

export async function adjustUserPointBalance(conn, {
    userId,
    amount,
    transactionType,
    note = null,
    referenceType = null,
    referenceId = null,
    createdBy = null,
    allowNegative = false,
}) {
    if (!Number.isInteger(amount) || amount === 0) {
        throw createAppError('포인트 조정 금액이 올바르지 않습니다.', 400, 'INVALID_POINT_AMOUNT');
    }

    const [rows] = await conn.query(
        'SELECT id, point_balance AS pointBalance FROM users WHERE id=? LIMIT 1 FOR UPDATE',
        [userId]
    );

    if (!rows.length) {
        throw createAppError('회원을 찾을 수 없습니다.', 404, 'USER_NOT_FOUND');
    }

    const currentBalance = Number(rows[0].pointBalance || 0);
    const nextBalance = currentBalance + amount;

    if (!allowNegative && nextBalance < 0) {
        throw createAppError('포인트가 부족합니다.', 402, 'INSUFFICIENT_POINTS', {
            pointBalance: currentBalance,
            requiredPoints: Math.abs(amount),
            shortage: Math.abs(nextBalance),
            topUpOptions: POINT_TOP_UP_OPTIONS,
        });
    }

    await conn.query(
        'UPDATE users SET point_balance=? WHERE id=?',
        [nextBalance, userId]
    );

    const [result] = await conn.query(
        `INSERT INTO point_transactions (
            user_id, amount, balance_after, transaction_type,
            note, reference_type, reference_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            amount,
            nextBalance,
            transactionType,
            note,
            referenceType,
            referenceId,
            createdBy,
        ]
    );

    return {
        transactionId: result.insertId,
        beforeBalance: currentBalance,
        afterBalance: nextBalance,
    };
}

export async function initDB() {
    const conn = await pool.getConnection();
    try {
        // 사용자 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                oauth_id    VARCHAR(255) NOT NULL,
                provider    ENUM('kakao','google','naver','local') NOT NULL,
                name        VARCHAR(100),
                email       VARCHAR(255),
                profile_img VARCHAR(512),
                role        ENUM('user','admin') DEFAULT 'user',
                is_adult    TINYINT(1) DEFAULT 0,
                is_premium  TINYINT(1) DEFAULT 0,
                is_suspended TINYINT(1) DEFAULT 0,
                can_publish_community TINYINT(1) DEFAULT 0,
                point_balance INT NOT NULL DEFAULT 0,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_oauth (oauth_id, provider)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 기존 테이블 삭제 (환경 초기화 시)
        await conn.query('DROP TABLE IF EXISTS chat_messages;');
        await conn.query('DROP TABLE IF EXISTS characters;');

        // 이야기(Story) 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS stories (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                user_id         INT NOT NULL,
                title           VARCHAR(200) NOT NULL,
                background      TEXT,
                environment     TEXT,
                viewer_settings LONGTEXT,
                cover_image_url LONGTEXT,
                is_public       TINYINT(1) DEFAULT 0,
                public_status   ENUM('private','pending','approved','rejected') DEFAULT 'private',
                public_method   ENUM('private','request','approved','direct') DEFAULT 'private',
                public_requested_at DATETIME NULL,
                public_reviewed_at DATETIME NULL,
                public_reviewed_by INT NULL,
                public_review_message TEXT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 이야기 內 등장인물 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS story_characters (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                story_id        INT NOT NULL,
                name            VARCHAR(100) NOT NULL,
                persona_json    LONGTEXT,
                personality     TEXT,
                appearance      TEXT,
                habits          TEXT,
                avatar_url      VARCHAR(512),
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        const [viewerSettingsColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'viewer_settings'
            LIMIT 1
        `);
        if (!viewerSettingsColumns.length) {
            await conn.query('ALTER TABLE stories ADD COLUMN viewer_settings LONGTEXT NULL AFTER environment;');
        }

        const [coverColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'cover_image_url'
            LIMIT 1
        `);
        if (!coverColumns.length) {
            await conn.query('ALTER TABLE stories ADD COLUMN cover_image_url LONGTEXT NULL AFTER viewer_settings;');
        }

        const [publicStatusColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'public_status'
            LIMIT 1
        `);
        if (!publicStatusColumns.length) {
            await conn.query("ALTER TABLE stories ADD COLUMN public_status ENUM('private','pending','approved','rejected') DEFAULT 'private' AFTER is_public;");
        }

        const [publicMethodColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'public_method'
            LIMIT 1
        `);
        if (!publicMethodColumns.length) {
            await conn.query("ALTER TABLE stories ADD COLUMN public_method ENUM('private','request','approved','direct') DEFAULT 'private' AFTER public_status;");
            await conn.query(`
                UPDATE stories
                SET public_method = CASE
                    WHEN is_public = 1 AND public_status = 'approved' THEN 'approved'
                    WHEN public_status = 'pending' THEN 'request'
                    ELSE 'private'
                END
                WHERE public_method IS NULL OR public_method = ''
            `);
        }

        const [publicRequestedColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'public_requested_at'
            LIMIT 1
        `);
        if (!publicRequestedColumns.length) {
            await conn.query('ALTER TABLE stories ADD COLUMN public_requested_at DATETIME NULL AFTER public_status;');
        }

        const [publicReviewedAtColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'public_reviewed_at'
            LIMIT 1
        `);
        if (!publicReviewedAtColumns.length) {
            await conn.query('ALTER TABLE stories ADD COLUMN public_reviewed_at DATETIME NULL AFTER public_requested_at;');
        }

        const [publicReviewedByColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'public_reviewed_by'
            LIMIT 1
        `);
        if (!publicReviewedByColumns.length) {
            await conn.query('ALTER TABLE stories ADD COLUMN public_reviewed_by INT NULL AFTER public_reviewed_at;');
        }

        const [publicReviewMessageColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'stories'
              AND column_name = 'public_review_message'
            LIMIT 1
        `);
        if (!publicReviewMessageColumns.length) {
            await conn.query('ALTER TABLE stories ADD COLUMN public_review_message TEXT NULL AFTER public_reviewed_by;');
        }

        const [personaJsonColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'story_characters'
              AND column_name = 'persona_json'
            LIMIT 1
        `);
        if (!personaJsonColumns.length) {
            await conn.query('ALTER TABLE story_characters ADD COLUMN persona_json LONGTEXT NULL AFTER name;');
        }

        const [suspendedColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'users'
              AND column_name = 'is_suspended'
            LIMIT 1
        `);
        if (!suspendedColumns.length) {
            await conn.query('ALTER TABLE users ADD COLUMN is_suspended TINYINT(1) DEFAULT 0 AFTER is_premium;');
        }

        const [communityPublishColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'users'
              AND column_name = 'can_publish_community'
            LIMIT 1
        `);
        if (!communityPublishColumns.length) {
            await conn.query('ALTER TABLE users ADD COLUMN can_publish_community TINYINT(1) DEFAULT 0 AFTER is_suspended;');
        }

        const [pointBalanceColumns] = await conn.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'users'
              AND column_name = 'point_balance'
            LIMIT 1
        `);
        if (!pointBalanceColumns.length) {
            await conn.query('ALTER TABLE users ADD COLUMN point_balance INT NOT NULL DEFAULT 0 AFTER can_publish_community;');
        } else {
            await conn.query('ALTER TABLE users MODIFY COLUMN point_balance INT NOT NULL DEFAULT 0;');
        }

        await conn.query(`
            UPDATE users
            SET point_balance = COALESCE(point_balance, 0)
            WHERE point_balance IS NULL
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS point_transactions (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                user_id         INT NOT NULL,
                amount          INT NOT NULL,
                balance_after   INT NOT NULL,
                transaction_type ENUM('welcome','topup','chat','admin_grant','admin_deduct','refund','adjustment') NOT NULL,
                note            VARCHAR(255) NULL,
                reference_type  VARCHAR(50) NULL,
                reference_id    INT NULL,
                created_by      INT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_point_transactions_user_created (user_id, created_at),
                INDEX idx_point_transactions_type_created (transaction_type, created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        const [pointUserCreatedIndex] = await conn.query(`
            SHOW INDEX FROM point_transactions
            WHERE Key_name = 'idx_point_transactions_user_created'
        `);
        if (!pointUserCreatedIndex.length) {
            await conn.query('CREATE INDEX idx_point_transactions_user_created ON point_transactions (user_id, created_at);');
        }

        const [pointTypeCreatedIndex] = await conn.query(`
            SHOW INDEX FROM point_transactions
            WHERE Key_name = 'idx_point_transactions_type_created'
        `);
        if (!pointTypeCreatedIndex.length) {
            await conn.query('CREATE INDEX idx_point_transactions_type_created ON point_transactions (transaction_type, created_at);');
        }

        const [legacyCharacters] = await conn.query(`
            SELECT id, name, personality, appearance, habits
            FROM story_characters
            WHERE persona_json IS NULL OR persona_json = ''
        `);

        for (const character of legacyCharacters) {
            const legacyBackground = [
                character.personality ? `이전 성격 메모: ${character.personality}` : '',
                character.appearance ? `이전 외관 메모: ${character.appearance}` : '',
                character.habits ? `이전 특징 메모: ${character.habits}` : '',
            ].filter(Boolean).join('\n').slice(0, 1500);

            const personaJson = JSON.stringify({
                name: character.name || '',
                age: null,
                gender: 'other',
                job: '',
                residence: '',
                personality: [],
                speechStyles: [],
                behaviorRules: [],
                customBehaviorRules: '',
                likes: [],
                dislikes: [],
                customDislikes: '',
                relationship: 'friend',
                goals: [],
                customGoals: '',
                background: legacyBackground,
            });

            await conn.query(
                'UPDATE story_characters SET persona_json=? WHERE id=?',
                [personaJson, character.id]
            );
        }

        // 소설 집필 목록 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS story_messages (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                story_id       INT NOT NULL,
                user_id        INT NOT NULL,
                role           ENUM('user','assistant') NOT NULL,
                content        TEXT NOT NULL,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 관리자 계정 시드 (없을 경우에만 생성)
        await conn.query(`
            INSERT IGNORE INTO users (oauth_id, provider, name, email, role)
            VALUES ('admin_seed', 'local', '관리자', 'admin@novelai.com', 'admin');
        `);

        console.log('✅ DB 테이블 초기화 완료');
    } finally {
        conn.release();
    }
}

export default pool;
