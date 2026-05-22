-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE user_role     AS ENUM ('admin', 'user');
CREATE TYPE user_status   AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE media_type    AS ENUM ('photo', 'video');
CREATE TYPE media_status  AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE perm_target   AS ENUM ('user', 'group');

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    display_name    VARCHAR(100),
    avatar_url      TEXT,
    role            user_role    NOT NULL DEFAULT 'user',
    status          user_status  NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role   ON users(role);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent  TEXT,
    ip_address  INET
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at)
    WHERE revoked = FALSE;

-- ============================================================
-- FRIEND GROUPS
-- ============================================================
CREATE TABLE groups (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(owner_id, name)
);

CREATE TABLE group_members (
    group_id    UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_members_user_id ON group_members(user_id);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(150) NOT NULL,
    description    TEXT,
    cover_media_id UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_owner_id ON categories(owner_id);

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE events (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id    UUID         NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    creator_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(255) NOT NULL,
    description    TEXT,
    event_date     DATE,
    location_name  VARCHAR(255),
    cover_media_id UUID,
    is_public      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_category_id ON events(category_id);
CREATE INDEX idx_events_creator_id  ON events(creator_id);
CREATE INDEX idx_events_event_date  ON events(event_date DESC);

-- ============================================================
-- EVENT PERMISSIONS
-- ============================================================
CREATE TABLE event_permissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    target_type perm_target NOT NULL,
    target_id   UUID        NOT NULL,
    granted_by  UUID        NOT NULL REFERENCES users(id),
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, target_type, target_id)
);

CREATE INDEX idx_event_permissions_event_id ON event_permissions(event_id);
CREATE INDEX idx_event_permissions_target   ON event_permissions(target_type, target_id);

-- ============================================================
-- MEDIA
-- ============================================================
CREATE TABLE media (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    uploader_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    media_type          media_type  NOT NULL,
    status              media_status NOT NULL DEFAULT 'queued',

    original_filename   VARCHAR(255) NOT NULL,
    original_path       TEXT         NOT NULL,
    original_size_bytes BIGINT,
    mime_type           VARCHAR(100),

    thumb_path          TEXT,
    preview_path        TEXT,
    video_path          TEXT,

    width               INT,
    height              INT,
    duration_secs       NUMERIC(10,3),
    taken_at            TIMESTAMPTZ,
    camera_make         VARCHAR(100),
    camera_model        VARCHAR(100),
    gps_lat             DOUBLE PRECISION,
    gps_lng             DOUBLE PRECISION,

    error_message       TEXT,
    retry_count         SMALLINT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_event_id    ON media(event_id);
CREATE INDEX idx_media_uploader_id ON media(uploader_id);
CREATE INDEX idx_media_status      ON media(status);
CREATE INDEX idx_media_taken_at    ON media(taken_at DESC);

-- ============================================================
-- DEFERRED FOREIGN KEYS (media table now exists)
-- ============================================================
ALTER TABLE categories ADD CONSTRAINT fk_categories_cover
    FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE events ADD CONSTRAINT fk_events_cover
    FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL;

-- ============================================================
-- ADMIN AUDIT LOG
-- ============================================================
CREATE TABLE admin_audit_log (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id     UUID         NOT NULL REFERENCES users(id),
    action       VARCHAR(100) NOT NULL,
    target_type  VARCHAR(50),
    target_id    UUID,
    metadata     JSONB,
    performed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_admin_id     ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_log_performed_at ON admin_audit_log(performed_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_media_updated_at
    BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION set_updated_at();
