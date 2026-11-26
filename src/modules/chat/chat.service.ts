import type { PoolClient } from 'pg'
import { query, withTransaction } from '../../config/db.js'
import { forbidden, notFound } from '../../utils/HttpError.js'

// Akses selalu lewat chat_members.is_active. Koneksi database memakai satu peran,
// sehingga RLS tidak bisa membedakan pengguna — penjagaannya ada di sini.

export interface ChatRoom {
  id: string
  type: 'direct' | 'group'
  name: string | null
  property_id: string
  property_name: string
  room_badge: string | null
  last_message: string | null
  last_message_at: Date | null
  unread_count: number
}

export interface ChatMessage {
  id: string
  sender_id: string | null
  sender_name: string | null
  room_badge: string | null
  content: string
  is_system_message: boolean
  created_at: Date
}

type RoomRow = ChatRoom

// Subquery di bawah diulang untuk daftar dan untuk satu ruangan supaya bentuk
// response-nya persis sama.
function roomSelect(userIdParam: string) {
  return `
    SELECT cr.id, cr.type, cr.name, cr.property_id, p.name AS property_name,
           cm.room_badge,
           (SELECT m.content FROM chat_messages m
            WHERE m.room_id = cr.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
           (SELECT m.created_at FROM chat_messages m
            WHERE m.room_id = cr.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at,
           (SELECT count(*)::int FROM chat_messages m
            WHERE m.room_id = cr.id AND m.created_at > cm.last_read_at
              AND m.sender_id IS NOT NULL AND m.sender_id <> ${userIdParam}
              AND m.is_system_message = false) AS unread_count
    FROM chat_rooms cr
    JOIN properties p ON p.id = cr.property_id
    JOIN chat_members cm ON cm.room_id = cr.id`
}

export async function listRooms(userId: string): Promise<ChatRoom[]> {
  const { rows } = await query<ChatRoom>(
    `${roomSelect('$1')}
     WHERE cm.user_id = $1 AND cm.is_active = true
     ORDER BY last_message_at DESC NULLS LAST, cr.created_at DESC`,
    [userId],
  )
  return rows
}

// Mengambil satu ruangan dengan syarat keanggotaan aktif tetap berlaku.
export async function findRoom(roomId: string, userId: string): Promise<ChatRoom> {
  const { rows } = await query<ChatRoom>(
    `${roomSelect('$2')}
     WHERE cr.id = $1 AND cm.user_id = $2 AND cm.is_active = true`,
    [roomId, userId],
  )
  const room = rows[0]
  // Ruangan yang tidak ditemukan dan ruangan orang lain sengaja dibedakan:
  // keduanya 404 supaya keberadaan ruangan itu tidak bocor.
  if (!room) throw notFound('Ruangan chat tidak ditemukan')
  return room
}

export async function createDirectRoom(
  propertyId: string,
  tenantId: string,
): Promise<ChatRoom> {
  return withTransaction(async (client) => {
    const { rows: properties } = await client.query<{
      id: string
      owner_id: string
      name: string
      verification_status: string
    }>(
      `SELECT id, owner_id, name, verification_status FROM properties WHERE id = $1`,
      [propertyId],
    )
    const property = properties[0]
    // Properti yang belum disetujui belum boleh dibuka untuk calon penyewa.
    if (!property || property.verification_status !== 'approved') {
      throw notFound('Properti tidak ditemukan')
    }

    // Kunci partial pada (property_id, tenant_id) mencegah ruangan ganda bila
    // pengguna menekan tombol "chat" dua kali.
    const { rows: rooms } = await client.query<{ id: string }>(
      `INSERT INTO chat_rooms (property_id, tenant_id, type, name)
       VALUES ($1, $2, 'direct', $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [propertyId, tenantId, property.name],
    )
    let roomId = rooms[0]?.id

    if (!roomId) {
      // Ruangan sudah ada dari permintaan sebelumnya; ambil id-nya untuk
      // mengaktifkan kembali anggota yang mungkin pernah keluar.
      const { rows: existing } = await client.query<{ id: string }>(
        `SELECT id FROM chat_rooms
         WHERE property_id = $1 AND tenant_id = $2 AND type = 'direct'`,
        [propertyId, tenantId],
      )
      roomId = existing[0]?.id
      if (!roomId) throw notFound('Ruangan chat tidak ditemukan')
    }

    const members = [
      [roomId, property.owner_id, 'owner', 'Owner'],
      [roomId, tenantId, 'tenant', 'Calon Penyewa'],
    ]
    for (const member of members) {
      await client.query(
        `INSERT INTO chat_members (room_id, user_id, role, room_badge, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (room_id, user_id) DO UPDATE
           SET room_badge = EXCLUDED.room_badge, is_active = true`,
        member,
      )
    }

    return await findRoomWithClient(client, roomId, tenantId)
  })
}

async function findRoomWithClient(
  client: PoolClient,
  roomId: string,
  userId: string,
): Promise<ChatRoom> {
  const { rows } = await client.query<ChatRoom>(
    `${roomSelect('$2')}
     WHERE cr.id = $1 AND cm.user_id = $2 AND cm.is_active = true`,
    [roomId, userId],
  )
  const room = rows[0]
  if (!room) throw notFound('Ruangan chat tidak ditemukan')
  return room
}

export async function assertActiveMember(roomId: string, userId: string): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT cm.id FROM chat_members cm
     WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.is_active = true`,
    [roomId, userId],
  )
  if (rows.length === 0) throw notFound('Ruangan chat tidak ditemukan')
}

export async function listMessages(
  roomId: string,
  userId: string,
  before: Date | undefined,
  limit: number,
): Promise<ChatMessage[]> {
  // Urutan diambil terbalik dulu supaya LIMIT mengambil pesan terbaru, lalu
  // dibalik lagi di aplikasi agar klien menerima oldest-to-newest.
  const params: unknown[] = [roomId, userId, limit]
  let beforeSql = ''
  if (before) {
    params.push(before)
    beforeSql = ` AND m.created_at < $${params.length}`
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query<ChatMessage>(
      `SELECT m.id, m.sender_id, u.full_name AS sender_name, cm.room_badge,
              m.content, m.is_system_message, m.created_at
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN chat_members cm
         ON cm.room_id = m.room_id AND cm.user_id = m.sender_id
       WHERE m.room_id = $1 AND EXISTS (
         SELECT 1 FROM chat_members mine
         WHERE mine.room_id = $1 AND mine.user_id = $2 AND mine.is_active = true
       )${beforeSql}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $3`,
      params,
    )

    // Penanda dibaca setelah daftar diambil, supaya pesan yang baru saja
    // dikirim tidak ikut terhitung sebagai pesan lama.
    await client.query(
      `UPDATE chat_members SET last_read_at = now()
       WHERE room_id = $1 AND user_id = $2 AND is_active = true`,
      [roomId, userId],
    )
    return rows.reverse()
  })
}

export async function sendMessage(
  roomId: string,
  userId: string,
  content: string,
): Promise<ChatMessage> {
  return withTransaction(async (client) => {
    const access = await client.query<{ badge: string | null }>(
      `SELECT cm.room_badge AS badge FROM chat_members cm
       WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.is_active = true`,
      [roomId, userId],
    )
    const member = access.rows[0]
    if (!member) throw notFound('Ruangan chat tidak ditemukan')

    const inserted = await client.query<{
      id: string
      sender_id: string | null
      content: string
      is_system_message: boolean
      created_at: Date
    }>(
      `INSERT INTO chat_messages (room_id, sender_id, content, is_system_message)
       VALUES ($1, $2, $3, false)
       RETURNING id, sender_id, content, is_system_message, created_at`,
      [roomId, userId, content],
    )
    const message = inserted.rows[0]
    const { rows: senders } = await client.query<{ full_name: string }>(
      `SELECT full_name FROM users WHERE id = $1`,
      [userId],
    )
    return {
      ...message,
      sender_name: senders[0]?.full_name ?? null,
      room_badge: member.badge,
    }
  })
}

export async function deleteMessage(
  roomId: string,
  messageId: string,
  userId: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT cm.id FROM chat_members cm
       JOIN chat_rooms cr ON cr.id = cm.room_id
       WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.is_active = true
         AND (
           -- Obrolan langsung hanya dibuka penyewa, jadi anggota owner adalah pemilik properti.
           (cr.type = 'direct' AND cm.role = 'owner')
           -- Pada grup, role owner harus cocok dengan pemilik properti saat ini.
           OR (cr.type = 'group' AND cm.role = 'owner'
               AND cr.property_id IN (
                 SELECT p.id FROM properties p WHERE p.owner_id = $2
               ))
         )`,
      [roomId, userId],
    )
    // Hanya pemilik ruangan aktif yang boleh menghapus; pada grup juga harus
    // benar-benar pemilik properti, bukan sekadar anggota dengan role owner.
    if (rows.length === 0) {
      throw forbidden('Hanya pemilik kos yang bisa menghapus pesan')
    }

    await client.query(
      `DELETE FROM chat_messages WHERE id = $1 AND room_id = $2`,
      [messageId, roomId],
    )
  })
}
