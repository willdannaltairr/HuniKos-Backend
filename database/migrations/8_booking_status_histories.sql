-- Up Migration
-- Tabel booking_status_histories: catatan setiap perubahan status booking.

CREATE TABLE booking_status_histories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status   VARCHAR(20) NOT NULL,
  changed_by  UUID REFERENCES users (id) ON DELETE SET NULL,  -- NULL berarti sistem
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS booking_status_histories;
