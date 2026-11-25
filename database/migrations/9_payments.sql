-- Up Migration
-- Tabel payments: bukti transfer yang diunggah penyewa lalu diverifikasi pemilik.

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  proof_url   TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  verified_by UUID REFERENCES users (id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_booking_id ON payments (booking_id);

-- Down Migration
DROP TABLE IF EXISTS payments;
