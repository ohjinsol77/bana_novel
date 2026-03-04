USE novelai_db;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    character_id   INT NOT NULL,
    user_id        INT NOT NULL,
    role           ENUM('user','assistant') NOT NULL,
    content        TEXT NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 관리자 계정 시드
INSERT IGNORE INTO users (oauth_id, provider, name, email, role)
VALUES ('admin_seed', 'local', '관리자', 'admin@novelai.com', 'admin');

SHOW TABLES;
SELECT id, name, email, role FROM users;
