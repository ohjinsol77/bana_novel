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

-- 이전 테이블 삭제 (초기화)
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS characters;

-- 이야기(Story) 테이블 생성
CREATE TABLE IF NOT EXISTS stories (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    title           VARCHAR(200) NOT NULL,
    background      TEXT,
    environment     TEXT,
    viewer_settings JSON,
    is_public       TINYINT(1) DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 이야기 內 등장인물 테이블 (최대 7명 권장)
CREATE TABLE IF NOT EXISTS story_characters (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    story_id        INT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    personality     TEXT,
    appearance      TEXT,
    habits          TEXT,
    avatar_url      VARCHAR(512),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 소설 집필(채팅/작성) 기록 테이블
CREATE TABLE IF NOT EXISTS story_messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    story_id       INT NOT NULL,
    user_id        INT NOT NULL,
    role           ENUM('user','assistant') NOT NULL,
    content        TEXT NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 관리자 계정 시드
INSERT IGNORE INTO users (oauth_id, provider, name, email, role)
VALUES ('admin_seed', 'local', '관리자', 'admin@novelai.com', 'admin');

SHOW TABLES;
SELECT id, name, email, role FROM users;
