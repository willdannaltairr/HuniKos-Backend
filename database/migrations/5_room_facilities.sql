-- Up Migration
-- Tabel room_facilities: fasilitas apa saja yang dimiliki tiap kamar.

CREATE TABLE room_facilities (
  room_id     UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities (id) ON DELETE RESTRICT,
  PRIMARY KEY (room_id, facility_id)
);

-- Down Migration
DROP TABLE IF EXISTS room_facilities;
