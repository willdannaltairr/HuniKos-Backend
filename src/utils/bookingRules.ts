import type { PoolClient, QueryResultRow } from 'pg'
import type { BookingStatus, RoomStatus } from '../types/domain.js'

// Aturan booking yang dipakai lintas modul (tenant, owner, admin, dashboard).

export const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED']

interface ExpiredRow extends QueryResultRow {
  id: string
  room_id: string
}

// Booking AWAITING_PAYMENT yang lewat expires_at menjadi EXPIRED. Dijalankan lazy
// sebelum query booking karena hosting gratis tidak boleh bergantung pada cron.
export async function expireStaleBookings(client: PoolClient): Promise<number> {
  const { rows } = await client.query<ExpiredRow>(
    `UPDATE bookings
     SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'AWAITING_PAYMENT'
       AND expires_at IS NOT NULL
       AND expires_at < now()
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

  return rows.length
}

interface RoomStatusRow extends QueryResultRow {
  status: RoomStatus
}

// RESERVED/OCCUPIED hanya boleh dipertahankan bila masih ada booking aktif lain.
export async function syncRoomStatus(client: PoolClient, roomId: string): Promise<void> {
  const { rows } = await client.query<RoomStatusRow>(
    'SELECT status FROM rooms WHERE id = $1 FOR UPDATE',
    [roomId],
  )
  if (rows.length === 0) return

  const room = rows[0] as RoomStatusRow
  if (!['RESERVED', 'OCCUPIED'].includes(room.status)) return

  const active = await client.query(
    `SELECT 1 FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
     LIMIT 1`,
    [roomId],
  )
  if ((active.rowCount ?? 0) > 0) return

  await client.query(
    `UPDATE rooms SET status = 'AVAILABLE', updated_at = now() WHERE id = $1`,
    [roomId],
  )
}

interface CountRow extends QueryResultRow {
  total: number
}

export async function countActiveBookings(client: PoolClient, roomId: string): Promise<number> {
  const { rows } = await client.query<CountRow>(
    `SELECT count(*)::int AS total FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')`,
    [roomId],
  )
  return rows[0]?.total ?? 0
}

interface EndDateRow extends QueryResultRow {
  end_date: string
}

// end_date dihitung di SQL agar benar pada akhir bulan (misal 31 Jan + 1 bulan).
export async function calculateEndDate(
  client: PoolClient,
  startDate: string,
  durationMonths: number,
): Promise<string> {
  const { rows } = await client.query<EndDateRow>(
    `SELECT ($1::date + make_interval(months => $2::int))::date AS end_date`,
    [startDate, durationMonths],
  )
  return rows[0]?.end_date as string
}

export function todayInJakarta(): string {
  // Dipakai hanya untuk perbandingan cepat di JS; sumber utama tetap SQL.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
