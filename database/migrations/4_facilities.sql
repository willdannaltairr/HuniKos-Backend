-- Up Migration
-- Tabel facilities: daftar fasilitas (data master), diisi dari seed.

CREATE TABLE facilities (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL UNIQUE
);

-- Down Migration
DROP TABLE IF EXISTS facilities;
