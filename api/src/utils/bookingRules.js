// Aturan booking yang dipakai lintas modul (tenant, owner, admin, dashboard).

export const ACTIVE_STATUSES = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED']

// Booking AWAITING_PAYMENT yang lewat expires_at menjadi EXPIRED. Dijalankan lazy
// sebelum query booking karena hosting gratis tidak boleh bergantung pada cron.
export async function expireStaleBookings(client) {
  const { rows } = await client.query(
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

// RESERVED/OCCUPIED hanya boleh dipertahankan bila masih ada booking aktif lain.
export async function syncRoomStatus(client, roomId) {
  const { rows } = await client.query(
    `SELECT status FROM rooms WHERE id = $1 FOR UPDATE`,
    [roomId],
  )
  if (rows.length === 0) return

  const room = rows[0]
  if (!['RESERVED', 'OCCUPIED'].includes(room.status)) return

  const active = await client.query(
    `SELECT 1 FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
     LIMIT 1`,
    [roomId],
  )
  if (active.rowCount > 0) return

  await client.query(
    `UPDATE rooms SET status = 'AVAILABLE', updated_at = now() WHERE id = $1`,
    [roomId],
  )
}

export async function countActiveBookings(client, roomId) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')`,
    [roomId],
  )
  return rows[0].total
}

// end_date dihitung di SQL agar benar pada akhir bulan (misal 31 Jan + 1 bulan).
export async function calculateEndDate(client, startDate, durationMonths) {
  const { rows } = await client.query(
    `SELECT ($1::date + make_interval(months => $2::int))::date AS end_date`,
    [startDate, durationMonths],
  )
  return rows[0].end_date
}

export function todayInJakarta() {
  // Dipakai hanya untuk perbandingan cepat di JS; sumber utama tetap SQL.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
