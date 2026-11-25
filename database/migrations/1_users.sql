-- Up Migration
-- Tabel users: akun penyewa, pemilik, dan admin.

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  phone_number   VARCHAR(20),
  avatar_url     TEXT,
  role           VARCHAR(10) NOT NULL CHECK (role IN ('tenant', 'owner', 'admin')),
  account_status VARCHAR(10) NOT NULL DEFAULT 'active'
                 CHECK (account_status IN ('active', 'suspended')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS users;
