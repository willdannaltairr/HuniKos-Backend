-- Up Migration
-- Tabel property_images: foto properti, atau foto kamar bila room_id diisi.

CREATE TABLE property_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  room_id     UUID REFERENCES rooms (id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  is_cover    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_images_property_id ON property_images (property_id);

-- Down Migration
DROP TABLE IF EXISTS property_images;
