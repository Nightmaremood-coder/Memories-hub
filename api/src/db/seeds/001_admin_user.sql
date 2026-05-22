-- Run this once after the first docker compose up to create the admin account.
-- Replace the password hash below with the output of:
--   node -e "const bcrypt=require('bcrypt');bcrypt.hash('YOUR_PASSWORD',12).then(console.log)"
--
-- Or run inside the api container:
--   docker compose exec api node -e "..."

INSERT INTO users (username, email, password_hash, display_name, role, status)
VALUES (
    'admin',
    'admin@memories-hub.local',
    '$2b$12$REPLACE_WITH_REAL_BCRYPT_HASH',
    'Administrator',
    'admin',
    'active'
)
ON CONFLICT (email) DO NOTHING;
