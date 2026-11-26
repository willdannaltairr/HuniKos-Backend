-- Up Migration
-- Dua jenis ruang: grup otomatis per properti dan obrolan pribadi tenant-owner.
-- Akses dijaga di aplikasi lewat chat_members.is_active (lihat chat.service.ts),
-- bukan RLS: koneksi database memakai satu peran, sehingga RLS tidak membedakan pengguna.
CREATE TABLE chat_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
  name        VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu properti hanya punya satu grup penghuni.
CREATE UNIQUE INDEX idx_chat_group_property
  ON chat_rooms (property_id) WHERE type = 'group';

-- Satu pasangan tenant-properti hanya punya satu obrolan pribadi.
CREATE UNIQUE INDEX idx_chat_direct_property_tenant
  ON chat_rooms (property_id, tenant_id) WHERE type = 'direct';

CREATE TABLE chat_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('owner', 'tenant')),
  room_badge  VARCHAR(40),
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_chat_member_unique ON chat_members (room_id, user_id);
CREATE INDEX idx_chat_member_user ON chat_members (user_id, is_active);
CREATE INDEX idx_chat_member_booking ON chat_members (booking_id);

CREATE TABLE chat_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  content           TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  is_system_message BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_message_room ON chat_messages (room_id, created_at);

-- Down Migration
DROP INDEX IF EXISTS idx_chat_message_room;
DROP TABLE IF EXISTS chat_messages;
DROP INDEX IF EXISTS idx_chat_member_booking;
DROP INDEX IF EXISTS idx_chat_member_user;
DROP INDEX IF EXISTS idx_chat_member_unique;
DROP TABLE IF EXISTS chat_members;
DROP INDEX IF EXISTS idx_chat_group_property;
DROP TABLE IF EXISTS chat_rooms;
