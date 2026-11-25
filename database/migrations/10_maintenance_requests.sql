-- Up Migration
-- Tabel maintenance_requests: laporan kerusakan dari penyewa.

CREATE TABLE maintenance_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  room_id     UUID NOT NULL REFERENCES rooms (id) ON DELETE RESTRICT,
  tenant_id   UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title       VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  photo_url   TEXT,
  storage_key TEXT,
  status      VARCHAR(12) NOT NULL DEFAULT 'OPEN'
              CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE')),
  owner_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_requests_room_id ON maintenance_requests (room_id);

-- Down Migration
DROP TABLE IF EXISTS maintenance_requests;
