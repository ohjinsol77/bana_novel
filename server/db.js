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
                is_public       TINYINT(1) DEFAULT 0,
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
