USE novelai_db;

CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    oauth_id    VARCHAR(255) NOT NULL,
    provider    ENUM('kakao','google','naver','local') NOT NULL,
    name        VARCHAR(100),
    email       VARCHAR(255),
    profile_img VARCHAR(512),
    password_hash VARCHAR(255) NULL,
    phone_number VARCHAR(30) NULL,
    phone_verified_at DATETIME NULL,
    pass_verified_at DATETIME NULL,
    adult_verified_at DATETIME NULL,
    birth_date DATE NULL,
    role        ENUM('user','admin') DEFAULT 'user',
    is_adult    TINYINT(1) DEFAULT 0,
    is_premium  TINYINT(1) DEFAULT 0,
    is_suspended TINYINT(1) DEFAULT 0,
    can_publish_community TINYINT(1) DEFAULT 0,
    point_balance INT NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_oauth (oauth_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_oauth_identities (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL,
    provider            ENUM('kakao','google','naver') NOT NULL,
    provider_user_id    VARCHAR(255) NOT NULL,
    provider_email      VARCHAR(255) NULL,
    provider_name       VARCHAR(100) NULL,
    profile_img         VARCHAR(512) NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_provider_identity (provider, provider_user_id),
    UNIQUE KEY uniq_user_provider (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 이야기 內 등장인물 테이블 (최대 7명 권장)
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

CREATE TABLE IF NOT EXISTS point_transactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    amount          INT NOT NULL,
    balance_after   INT NOT NULL,
    transaction_type ENUM('welcome','topup','chat','binding','admin_grant','admin_deduct','refund','adjustment') NOT NULL,
    note            VARCHAR(255) NULL,
    reference_type  VARCHAR(50) NULL,
    reference_id    INT NULL,
    created_by      INT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_point_transactions_user_created (user_id, created_at),
    INDEX idx_point_transactions_type_created (transaction_type, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS phone_verifications (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    phone_number    VARCHAR(30) NOT NULL,
    provider        ENUM('sms','pass') NOT NULL DEFAULT 'sms',
    purpose         ENUM('signup','identity','adult','topup') NOT NULL,
    code_hash       VARCHAR(255) NOT NULL,
    attempt_count   INT NOT NULL DEFAULT 0,
    expires_at      DATETIME NOT NULL,
    verified_at     DATETIME NULL,
    used_at         DATETIME NULL,
    created_for_user_id INT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone_verifications_phone_purpose_created (phone_number, purpose, created_at),
    INDEX idx_phone_verifications_expires (expires_at),
    FOREIGN KEY (created_for_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 관리자 계정 시드
INSERT IGNORE INTO users (oauth_id, provider, name, email, role)
VALUES ('admin_seed', 'local', '관리자', 'admin@novelai.com', 'admin');

SHOW TABLES;
SELECT id, name, email, role FROM users;
