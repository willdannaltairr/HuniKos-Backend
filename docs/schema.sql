-- ============================================================================
-- HUNIKOS — Skema database PostgreSQL
-- ============================================================================
-- Berkas ini adalah skema lengkap yang dipakai aplikasi: 10 tabel, 10 index,
-- dan 12 fasilitas data master.
--
-- Cara pakai di pgAdmin:
--   1. Klik kanan database tujuan -> Query Tool.
--   2. Buka berkas ini (ikon folder), lalu tekan F5 (Execute).
--   3. Muat ulang daftar tabel (klik kanan Tables -> Refresh) untuk melihat hasil.
--
-- Butuh PostgreSQL 13+ karena memakai gen_random_uuid() bawaan.
-- Tidak perlu ekstensi apa pun.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. users — akun penyewa, pemilik, dan admin
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,          -- selalu disimpan lowercase oleh aplikasi
  password_hash  VARCHAR(255) NOT NULL,
  phone_number   VARCHAR(20),
  avatar_url     TEXT,
  role           VARCHAR(10) NOT NULL CHECK (role IN ('tenant','owner','admin')),
  account_status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. properties — data kos milik pemilik
-- ----------------------------------------------------------------------------
CREATE TABLE properties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                VARCHAR(120) NOT NULL,
  description         TEXT,
  address             TEXT NOT NULL,
  city                VARCHAR(80) NOT NULL,
  latitude            NUMERIC(9,6),
  longitude           NUMERIC(9,6),
  property_type       VARCHAR(10) NOT NULL CHECK (property_type IN ('putra','putri','campur')),
  rules               TEXT,
  verification_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  rejection_note      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. rooms — kamar di dalam properti
-- ----------------------------------------------------------------------------
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_number   VARCHAR(20) NOT NULL,
  room_type     VARCHAR(50) NOT NULL DEFAULT 'standard',
  dimensions    VARCHAR(20),                              -- contoh: '3x4 m'
  monthly_price NUMERIC(14,2) NOT NULL CHECK (monthly_price > 0),
  max_occupants SMALLINT NOT NULL DEFAULT 1 CHECK (max_occupants BETWEEN 1 AND 10),
  bathroom_type VARCHAR(10) NOT NULL CHECK (bathroom_type IN ('dalam','luar')),
  floor_number  SMALLINT NOT NULL DEFAULT 1 CHECK (floor_number BETWEEN 1 AND 50),
  status        VARCHAR(12) NOT NULL DEFAULT 'AVAILABLE'
                CHECK (status IN ('AVAILABLE','RESERVED','OCCUPIED','MAINTENANCE','INACTIVE')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, room_number)
);

-- ----------------------------------------------------------------------------
-- 4. facilities — data master fasilitas
-- ----------------------------------------------------------------------------
CREATE TABLE facilities (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL UNIQUE
);

-- ----------------------------------------------------------------------------
-- 5. room_facilities — relasi banyak-ke-banyak kamar dan fasilitas
-- ----------------------------------------------------------------------------
CREATE TABLE room_facilities (
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  PRIMARY KEY (room_id, facility_id)
);

-- ----------------------------------------------------------------------------
-- 6. property_images — foto properti; kalau room_id terisi berarti foto kamar
-- ----------------------------------------------------------------------------
CREATE TABLE property_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  storage_key TEXT NOT NULL,                              -- path lokal atau public_id Cloudinary
  is_cover    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. bookings — pengajuan sewa kamar
-- ----------------------------------------------------------------------------
CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code          VARCHAR(20) NOT NULL UNIQUE,      -- 'BK-' + 8 hex huruf besar
  tenant_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  room_id               UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  start_date            DATE NOT NULL,
  duration_months       SMALLINT NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
  end_date              DATE NOT NULL,                    -- start_date + duration_months bulan (end eksklusif)
  rental_price_snapshot NUMERIC(14,2) NOT NULL,           -- harga per bulan saat booking dibuat
  total_amount          NUMERIC(14,2) NOT NULL,           -- rental_price_snapshot * duration_months
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED','REJECTED','CANCELLED','EXPIRED','COMPLETED')),
  note                  TEXT,
  owner_note            TEXT,
  expires_at            TIMESTAMPTZ,                      -- diisi saat status AWAITING_PAYMENT (sekarang + 24 jam)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

-- ----------------------------------------------------------------------------
-- 8. booking_status_histories — jejak perpindahan status booking
-- ----------------------------------------------------------------------------
CREATE TABLE booking_status_histories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status   VARCHAR(20) NOT NULL,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL berarti sistem (misal EXPIRED otomatis)
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 9. payments — bukti transfer yang diunggah penyewa
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  proof_url   TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. maintenance_requests — laporan kerusakan dari penyewa
-- ----------------------------------------------------------------------------
CREATE TABLE maintenance_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  tenant_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title       VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  photo_url   TEXT,
  storage_key TEXT,
  status      VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE')),
  owner_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Index minimal. Tanpa ini daftar properti dan pencarian kamar akan memindai
-- seluruh tabel begitu data bertambah.
-- ----------------------------------------------------------------------------
CREATE INDEX idx_properties_owner_id ON properties (owner_id);
CREATE INDEX idx_properties_verification_city ON properties (verification_status, city);
CREATE INDEX idx_rooms_property_id ON rooms (property_id);
CREATE INDEX idx_rooms_status ON rooms (status);
CREATE INDEX idx_rooms_monthly_price ON rooms (monthly_price);
CREATE INDEX idx_bookings_room_status ON bookings (room_id, status);
CREATE INDEX idx_bookings_tenant_id ON bookings (tenant_id);
CREATE INDEX idx_payments_booking_id ON payments (booking_id);
CREATE INDEX idx_maintenance_requests_room_id ON maintenance_requests (room_id);
CREATE INDEX idx_property_images_property_id ON property_images (property_id);

-- ----------------------------------------------------------------------------
-- Data master fasilitas. ON CONFLICT membuat skrip ini aman dijalankan ulang.
-- ----------------------------------------------------------------------------
INSERT INTO facilities (name) VALUES
  ('Kasur'),
  ('Lemari'),
  ('Meja Belajar'),
  ('Kursi'),
  ('AC'),
  ('Kipas Angin'),
  ('Wi-Fi'),
  ('Kamar Mandi Dalam'),
  ('Water Heater'),
  ('Dapur Bersama'),
  ('Parkir Motor'),
  ('Laundry')
ON CONFLICT (name) DO NOTHING;

COMMIT;
