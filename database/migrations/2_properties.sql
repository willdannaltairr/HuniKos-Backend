-- Up Migration
-- Tabel properties: rumah kos milik seorang owner.

CREATE TABLE properties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name                VARCHAR(120) NOT NULL,
  description         TEXT,
  address             TEXT NOT NULL,
  city                VARCHAR(80) NOT NULL,
  latitude            NUMERIC(9, 6),
  longitude           NUMERIC(9, 6),
  property_type       VARCHAR(10) NOT NULL
                      CHECK (property_type IN ('putra', 'putri', 'campur')),
  rules               TEXT,
  verification_status VARCHAR(10) NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  rejection_note      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_properties_owner_id ON properties (owner_id);
CREATE INDEX idx_properties_verification_city ON properties (verification_status, city);

-- Down Migration
DROP TABLE IF EXISTS properties;
