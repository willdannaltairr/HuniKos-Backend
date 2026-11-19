import { randomBytes } from 'node:crypto'
import { withTransaction, query } from '../../config/db.js'
import { conflict, forbidden, notFound, unprocessable } from '../../utils/HttpError.js'
import {
  expireStaleBookings, syncRoomStatus, calculateEndDate, ACTIVE_STATUSES,
} from '../../utils/bookingRules.js'

// Satu bentuk Booking dipakai bersama oleh modul penyewa, pemilik, dan admin.
export const BOOKING_SELECT = `
  SELECT b.id, b.booking_code, b.status, b.start_date, b.end_date, b.duration_months,
         b.rental_price_snapshot, b.total_amount, b.note, b.owner_note, b.expires_at,
         b.created_at, b.tenant_id, b.room_id,
         json_build_object('id', r.id, 'room_number', r.room_number, 'room_type', r.room_type) AS room,
         json_build_object('id', p.id, 'name', p.name, 'city', p.city) AS property,
         json_build_object('id', u.id, 'full_name', u.full_name, 'phone_number', u.phone_number) AS tenant,
         (SELECT pay.status FROM payments pay WHERE pay.booking_id = b.id
          ORDER BY pay.created_at DESC LIMIT 1) AS latest_payment_status,
         p.owner_id
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  JOIN properties p ON p.id = r.property_id
  JOIN users u ON u.id = b.tenant_id`

function toBooking(row) {
  const { owner_id: _ignored, tenant_id: _tid, room_id: _rid, ...booking } = row
  return booking
}

export async function listBookings({ tenantId, ownerId, status }) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const filters = []
    const values = []
    if (tenantId) {
      values.push(tenantId)
      filters.push(`b.tenant_id = $${values.length}`)
    }
    if (ownerId) {
      values.push(ownerId)
      filters.push(`p.owner_id = $${values.length}`)
    }
    if (status) {
      values.push(status)
      filters.push(`b.status = $${values.length}`)
    }

    const { rows } = await client.query(
      `${BOOKING_SELECT} WHERE ${filters.join(' AND ')} ORDER BY b.created_at DESC`,
      values,
    )
    return rows.map(toBooking)
  })
}

async function findBookingForViewer(client, bookingId) {
  const { rows } = await client.query(`${BOOKING_SELECT} WHERE b.id = $1`, [bookingId])
  return rows[0] ?? null
}

export async function getBookingDetail(bookingId, viewer) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const booking = await findBookingForViewer(client, bookingId)
    if (!booking) throw notFound('Booking tidak ditemukan')

    const allowed = viewer.role === 'admin' || viewer.id === booking.tenant_id || viewer.id === booking.owner_id
    if (!allowed) throw notFound('Booking tidak ditemukan')

    const payments = await client.query(
      `SELECT id, booking_id, amount, proof_url, status, note, verified_at, created_at
       FROM payments WHERE booking_id = $1 ORDER BY created_at DESC`,
      [bookingId],
    )

    const history = await client.query(
      `SELECT from_status, to_status, note, created_at
       FROM booking_status_histories WHERE booking_id = $1 ORDER BY created_at ASC`,
      [bookingId],
    )

    return { ...toBooking(booking), payments: payments.rows, history: history.rows }
  })
}

// Kode booking diulang bila kebetulan bentrok dengan kode yang sudah ada.
function makeBookingCode() {
  return `BK-${randomBytes(4).toString('hex').toUpperCase()}`
}

export async function createBooking(tenantId, input) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    // Kunci baris kamar agar dua penyewa tidak lolos bersamaan.
    const roomResult = await client.query(
      `SELECT r.id, r.status, r.monthly_price, p.owner_id, p.verification_status, u.account_status
       FROM rooms r
       JOIN properties p ON p.id = r.property_id
       JOIN users u ON u.id = p.owner_id
       WHERE r.id = $1
       FOR UPDATE OF r`,
      [input.room_id],
    )
    const room = roomResult.rows[0]
    if (!room) throw notFound('Kamar tidak ditemukan')
    if (room.verification_status !== 'approved' || room.account_status !== 'active') {
      throw notFound('Kamar tidak ditemukan')
    }
    if (['MAINTENANCE', 'INACTIVE'].includes(room.status)) {
      throw conflict(`Kamar sedang ${room.status.toLowerCase()} dan belum bisa dipesan`)
    }

    const today = await client.query(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    )
    if (input.start_date < today.rows[0].today) {
      throw unprocessable('Data tidak valid', [
        { field: 'start_date', message: 'Tanggal mulai tidak boleh sebelum hari ini (WIB)' },
      ])
    }

    const endDate = await calculateEndDate(client, input.start_date, input.duration_months)

    const overlap = await client.query(
      `SELECT 1 FROM bookings
       WHERE room_id = $1
         AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
         AND start_date < $3::date AND end_date > $2::date
       LIMIT 1`,
      [room.id, input.start_date, endDate],
    )
    if (overlap.rowCount > 0) throw conflict('Kamar sudah dipesan pada periode tersebut')

    const totalAmount = Number(room.monthly_price) * input.duration_months

    let booking = null
    for (let attempt = 0; attempt < 3 && !booking; attempt += 1) {
      try {
        const inserted = await client.query(
          `INSERT INTO bookings
             (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
              rental_price_snapshot, total_amount, status, note)
           VALUES ($1, $2, $3, $4::date, $5::int, $6::date, $7::numeric, $8::numeric, 'PENDING', $9)
           RETURNING id`,
          [
            makeBookingCode(), tenantId, room.id, input.start_date, input.duration_months,
            endDate, room.monthly_price, totalAmount, input.note ?? null,
          ],
        )
        booking = inserted.rows[0]
      } catch (error) {
        if (error.code !== '23505') throw error
      }
    }
    if (!booking) throw conflict('Gagal membuat kode booking, coba lagi')

    await client.query(
      `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
       VALUES ($1, NULL, 'PENDING', $2, 'Booking dibuat penyewa')`,
      [booking.id, tenantId],
    )

    const detail = await findBookingForViewer(client, booking.id)
    return toBooking(detail)
  })
}

export async function cancelBooking(bookingId, tenantId) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query(
      `SELECT id, status, room_id FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [bookingId, tenantId],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking tidak ditemukan')
    if (!['PENDING', 'AWAITING_PAYMENT'].includes(booking.status)) {
      throw conflict(`Booking berstatus ${booking.status} tidak bisa dibatalkan`)
    }

    await client.query(
      `UPDATE bookings SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
      [bookingId],
    )
    await client.query(
      `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, 'CANCELLED', $3, 'Dibatalkan oleh penyewa')`,
      [bookingId, booking.status, tenantId],
    )
    await syncRoomStatus(client, booking.room_id)

    const detail = await findBookingForViewer(client, bookingId)
    return toBooking(detail)
  })
}

// Dipakai modul pembayaran dan laporan kerusakan.
export async function assertTenantBooking(client, bookingId, tenantId) {
  const { rows } = await client.query(
    `SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2`,
    [bookingId, tenantId],
  )
  if (!rows[0]) throw notFound('Booking tidak ditemukan')
  return rows[0]
}
