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
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_oauth (oauth_id, provider)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 캐릭터 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS characters (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                user_id         INT NOT NULL,
                name            VARCHAR(100) NOT NULL,
                persona         TEXT,
                greeting        TEXT,
                background      TEXT,
                environment     TEXT,
                avatar_url      VARCHAR(512),
                is_public       TINYINT(1) DEFAULT 0,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 대화 기록 테이블
        await conn.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                character_id   INT NOT NULL,
                user_id        INT NOT NULL,
                role           ENUM('user','assistant') NOT NULL,
                content        TEXT NOT NULL,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
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
