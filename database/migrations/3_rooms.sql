-- Up Migration
-- Tabel rooms: kamar di dalam sebuah properti.

CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  room_number   VARCHAR(20) NOT NULL,
  room_type     VARCHAR(50) NOT NULL DEFAULT 'standard',
  dimensions    VARCHAR(20),
  monthly_price NUMERIC(14, 2) NOT NULL CHECK (monthly_price > 0),
  max_occupants SMALLINT NOT NULL DEFAULT 1 CHECK (max_occupants BETWEEN 1 AND 10),
  bathroom_type VARCHAR(10) NOT NULL CHECK (bathroom_type IN ('dalam', 'luar')),
  floor_number  SMALLINT NOT NULL DEFAULT 1 CHECK (floor_number BETWEEN 1 AND 50),
  status        VARCHAR(12) NOT NULL DEFAULT 'AVAILABLE'
                CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, room_number)
);

CREATE INDEX idx_rooms_property_id ON rooms (property_id);
CREATE INDEX idx_rooms_status ON rooms (status);
CREATE INDEX idx_rooms_monthly_price ON rooms (monthly_price);

-- Down Migration
DROP TABLE IF EXISTS rooms;
