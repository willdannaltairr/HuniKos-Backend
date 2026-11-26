import type { PoolClient } from 'pg'

// Hooks ini dipanggil di dalam transaksi yang sama dengan pembayaran/properti.
// Query memakai ON CONFLICT dan pengecekan status lama supaya webhook yang
// dikirim ulang tidak membuat member ganda atau pesan sambutan ganda.

type RoomRow = { id: string }

export async function joinGroupOnPayment(client: PoolClient, bookingId: string): Promise<void> {
  // Booking -> kamar -> properti -> grup. Grup memang belum tentu ada kalau
  // properti dibuat sebelum fitur chat dipasang, jadi dibuat di sini juga.
  const { rows } = await client.query<{
    room_id: string
    property_id: string
    owner_id: string
    tenant_id: string
    full_name: string
    room_number: string
  }>(
    `SELECT r.id AS room_id, r.property_id, p.owner_id, b.tenant_id,
            u.full_name, r.room_number
     FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = b.tenant_id
     WHERE b.id = $1`,
    [bookingId],
  )
  const booking = rows[0]
  // Booking yang sudah dihapus tidak perlu dimasukkan ke grup mana pun.
  if (!booking) return

  await ensureGroupForProperty(client, booking.property_id, booking.owner_id)

  const { rows: groupRows } = await client.query<RoomRow>(
    `SELECT id FROM chat_rooms WHERE property_id = $1 AND type = 'group'`,
    [booking.property_id],
  )
  const group = groupRows[0]
  if (!group) return

  // Kunci (room_id, user_id) menjamin satu baris per penyewa per grup.
  const badge = `Kamar ${booking.room_number}`
  const memberValues = [group.id, booking.tenant_id, badge, bookingId]

  // DO NOTHING memberi tahu apakah ini keanggotaan baru. Kalau baris sudah ada,
  // status lamanya dibaca dengan FOR UPDATE supaya dua webhook bersamaan tidak
  // dua-duanya mengirim pesan sambutan.
  const inserted = await client.query(
    `INSERT INTO chat_members
       (room_id, user_id, role, room_badge, booking_id, is_active, last_read_at)
     VALUES ($1, $2, 'tenant', $3, $4, true, now())
     ON CONFLICT (room_id, user_id) DO NOTHING
     RETURNING id`,
    memberValues,
  )
  let wasActive = false
  if ((inserted.rowCount ?? 0) === 0) {
    const { rows: existing } = await client.query<{ is_active: boolean }>(
      `SELECT is_active FROM chat_members
       WHERE room_id = $1 AND user_id = $2 FOR UPDATE`,
      [group.id, booking.tenant_id],
    )
    wasActive = existing[0]?.is_active ?? false
  }

  await client.query(
    `UPDATE chat_members
     SET role = 'tenant', room_badge = $3, booking_id = $4, is_active = true
     WHERE room_id = $1 AND user_id = $2`,
    memberValues,
  )

  // Pesan sambutan hanya untuk anggota yang sebelumnya belum aktif, sehingga
  // sinkronisasi pembayaran ulang tidak mengirim Salam dua kali.
  if (wasActive) return
  const content = `Selamat datang ${booking.full_name} (${badge}) di grup penghuni kos!`
  await client.query(
    `INSERT INTO chat_messages (room_id, sender_id, content, is_system_message)
     VALUES ($1, NULL, $2, true)`,
    [group.id, content],
  )
}

export async function deactivateBookingMember(client: PoolClient, bookingId: string): Promise<void> {
  // Booking selesai/dibatalkan: penyewa keluar dari grup, tetapi riwayat pesan
  // tetap ada. booking_id dipertahankan supaya bisa diaktifkan lagi nanti.
  await client.query(
    `UPDATE chat_members SET is_active = false WHERE booking_id = $1`,
    [bookingId],
  )
}

export async function ensureGroupForProperty(
  client: PoolClient,
  propertyId: string,
  ownerId: string,
): Promise<void> {
  // Satu grup per properti dijaga oleh index unik partial; ON CONFLICT membuat
  // pemanggilan dari webhook dan dari endpoint properti saling aman.
  const { rows } = await client.query<RoomRow>(
    `INSERT INTO chat_rooms (property_id, type, name)
     VALUES ($1, 'group', (SELECT name FROM properties WHERE id = $1))
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [propertyId],
  )
  const roomId = rows[0]?.id
  // Kalau grup sudah ada, pemilik juga sudah terdaftar dari pembuatan pertama.
  if (!roomId) return

  await client.query(
    `INSERT INTO chat_members (room_id, user_id, role, room_badge, is_active)
     VALUES ($1, $2, 'owner', 'Owner', true)
     ON CONFLICT (room_id, user_id) DO UPDATE
       SET role = 'owner', room_badge = 'Owner', is_active = true`,
    [roomId, ownerId],
  )
}
