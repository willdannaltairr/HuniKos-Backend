-- Up Migration
-- Tabel bookings: pengajuan sewa kamar oleh penyewa.

CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code          VARCHAR(20) NOT NULL UNIQUE,
  tenant_id             UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  room_id               UUID NOT NULL REFERENCES rooms (id) ON DELETE RESTRICT,
  start_date            DATE NOT NULL,
  duration_months       SMALLINT NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
  end_date              DATE NOT NULL,  -- eksklusif: tanggal kamar bebas lagi
  rental_price_snapshot NUMERIC(14, 2) NOT NULL,
  total_amount          NUMERIC(14, 2) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED',
                                          'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED')),
  note                  TEXT,
  owner_note            TEXT,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

CREATE INDEX idx_bookings_room_status ON bookings (room_id, status);
CREATE INDEX idx_bookings_tenant_id ON bookings (tenant_id);

-- Down Migration
DROP TABLE IF EXISTS bookings;
