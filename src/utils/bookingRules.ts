import type { PoolClient } from 'pg'
import type { BookingStatus, RoomStatus } from '../types/domain.js'

// Aturan booking yang dipakai di beberapa modul sekaligus.

export const STATUS_AKTIF: BookingStatus[] = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED']

// Booking AWAITING_PAYMENT yang lewat batas waktu diubah menjadi EXPIRED.
// Dijalankan sebelum query booking karena hosting gratis tidak punya cron.
export async function expireStaleBookings(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ id: string; room_id: string }>(
    `UPDATE bookings
     SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'AWAITING_PAYMENT' AND expires_at IS NOT NULL AND expires_at < now()
     RETURNING id, room_id`,
  )

  for (const booking of rows) {
    await client.query(
      `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
       VALUES ($1, 'AWAITING_PAYMENT', 'EXPIRED', NULL, 'Kedaluwarsa otomatis')`,
      [booking.id],
    )
    await syncRoomStatus(client, booking.room_id)
  }
}

// Kamar yang berstatus RESERVED/OCCUPIED dikembalikan ke AVAILABLE bila tidak ada
// booking aktif lain di kamar itu.
export async function syncRoomStatus(client: PoolClient, roomId: string): Promise<void> {
  const { rows } = await client.query<{ status: RoomStatus }>(
    'SELECT status FROM rooms WHERE id = $1 FOR UPDATE',
    [roomId],
  )
  const kamar = rows[0]
  if (!kamar) return
  if (kamar.status !== 'RESERVED' && kamar.status !== 'OCCUPIED') return

  const aktif = await client.query(
    `SELECT 1 FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
     LIMIT 1`,
    [roomId],
  )
  if ((aktif.rowCount ?? 0) > 0) return

  await client.query('UPDATE rooms SET status = $2, updated_at = now() WHERE id = $1', [
    roomId,
    'AVAILABLE',
  ])
}

// Jumlah booking aktif pada satu kamar.
export async function countActiveBookings(client: PoolClient, roomId: string): Promise<number> {
  const { rows } = await client.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')`,
    [roomId],
  )
  return rows[0]?.total ?? 0
}

// end_date dihitung oleh PostgreSQL agar benar pada akhir bulan (31 Jan + 1 bulan).
export async function calculateEndDate(
  client: PoolClient,
  startDate: string,
  durationMonths: number,
): Promise<string> {
  const { rows } = await client.query<{ end_date: string }>(
    `SELECT ($1::date + make_interval(months => $2::int))::date AS end_date`,
    [startDate, durationMonths],
  )
  return rows[0]?.end_date as string
}
