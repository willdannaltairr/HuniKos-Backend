import { randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { withTransaction } from '../../config/db.js'
import { conflict, notFound, unprocessable } from '../../utils/HttpError.js'
import { expireStaleBookings, syncRoomStatus, calculateEndDate } from '../../utils/bookingRules.js'
import type { BookingStatus, Role } from '../../types/domain.js'

// Satu bentuk Booking dipakai oleh modul penyewa, pemilik, dan admin.
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

export interface BookingRow {
  id: string
  booking_code: string
  status: BookingStatus
  start_date: string
  end_date: string
  duration_months: number
  rental_price_snapshot: number
  total_amount: number
  note: string | null
  owner_note: string | null
  expires_at: Date | null
  created_at: Date
  tenant_id: string
  room_id: string
  room: { id: string; room_number: string; room_type: string }
  property: { id: string; name: string; city: string }
  tenant: { id: string; full_name: string; phone_number: string | null }
  latest_payment_status: string | null
  owner_id: string
}

/** Bentuk Booking pada kontrak (tanpa kolom internal). */
export type Booking = Omit<BookingRow, 'owner_id' | 'tenant_id' | 'room_id'>

export function toBooking(row: BookingRow): Booking {
  const { owner_id: _a, tenant_id: _b, room_id: _c, ...booking } = row
  return booking
}

export interface BookingListFilter {
  tenantId?: string
  ownerId?: string
  status?: BookingStatus
}

export async function listBookings(filter: BookingListFilter): Promise<Booking[]> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const conditions: string[] = []
    const values: unknown[] = []
    if (filter.tenantId) {
      values.push(filter.tenantId)
      conditions.push(`b.tenant_id = $${values.length}`)
    }
    if (filter.ownerId) {
      values.push(filter.ownerId)
      conditions.push(`p.owner_id = $${values.length}`)
    }
    if (filter.status) {
      values.push(filter.status)
      conditions.push(`b.status = $${values.length}`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await client.query<BookingRow>(
      `${BOOKING_SELECT} ${where} ORDER BY b.created_at DESC`,
      values,
    )
    return rows.map(toBooking)
  })
}

async function loadBooking(client: PoolClient, bookingId: string): Promise<BookingRow | null> {
  const { rows } = await client.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [bookingId])
  return rows[0] ?? null
}

export interface BookingViewer {
  id: string
  role: Role
}

export interface BookingDetail extends Booking {
  payments: unknown[]
  history: { from_status: string | null; to_status: string; note: string | null; created_at: Date }[]
}

export async function getBookingDetail(
  bookingId: string,
  viewer: BookingViewer,
): Promise<BookingDetail> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const booking = await loadBooking(client, bookingId)
    if (!booking) throw notFound('Booking tidak ditemukan')

    const boleh =
      viewer.role === 'admin' || viewer.id === booking.tenant_id || viewer.id === booking.owner_id
    if (!boleh) throw notFound('Booking tidak ditemukan')

    const payments = await client.query(
      `SELECT pay.id, pay.booking_id, pay.amount, pay.proof_url, pay.status, pay.note,
              pay.verified_at, pay.created_at,
              b.booking_code, r.room_number, p.name AS property_name, u.full_name AS tenant_name
       FROM payments pay
       JOIN bookings b ON b.id = pay.booking_id
       JOIN rooms r ON r.id = b.room_id
       JOIN properties p ON p.id = r.property_id
       JOIN users u ON u.id = b.tenant_id
       WHERE pay.booking_id = $1
       ORDER BY pay.created_at DESC`,
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

// Kode booking: 'BK-' + 8 hex huruf besar.
function makeBookingCode(): string {
  return `BK-${randomBytes(4).toString('hex').toUpperCase()}`
}

export interface CreateBookingInput {
  room_id: string
  start_date: string
  duration_months: number
  note?: string
}

export async function createBooking(tenantId: string, input: CreateBookingInput): Promise<Booking> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    // Kunci baris kamar agar dua penyewa tidak lolos bersamaan.
    const roomResult = await client.query<{
      id: string
      status: string
      monthly_price: number
      verification_status: string
      account_status: string
    }>(
      `SELECT r.id, r.status, r.monthly_price, p.verification_status, u.account_status
       FROM rooms r
       JOIN properties p ON p.id = r.property_id
       JOIN users u ON u.id = p.owner_id
       WHERE r.id = $1
       FOR UPDATE OF r`,
      [input.room_id],
    )
    const kamar = roomResult.rows[0]
    if (!kamar) throw notFound('Kamar tidak ditemukan')
    if (kamar.verification_status !== 'approved' || kamar.account_status !== 'active') {
      throw notFound('Kamar tidak ditemukan')
    }
    if (kamar.status === 'MAINTENANCE' || kamar.status === 'INACTIVE') {
      throw conflict(`Kamar sedang ${kamar.status.toLowerCase()} dan belum bisa dipesan`)
    }

    const hariIni = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    )
    if (input.start_date < (hariIni.rows[0]?.today as string)) {
      throw unprocessable('Data tidak valid', [
        { field: 'start_date', message: 'Tanggal mulai tidak boleh sebelum hari ini (WIB)' },
      ])
    }

    const endDate = await calculateEndDate(client, input.start_date, input.duration_months)

    const bentrok = await client.query(
      `SELECT 1 FROM bookings
       WHERE room_id = $1
         AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
         AND start_date < $3::date AND end_date > $2::date
       LIMIT 1`,
      [kamar.id, input.start_date, endDate],
    )
    if ((bentrok.rowCount ?? 0) > 0) throw conflict('Kamar sudah dipesan pada periode tersebut')

    const totalAmount = Number(kamar.monthly_price) * input.duration_months

    let bookingId: string | null = null
    for (let attempt = 0; attempt < 3 && !bookingId; attempt += 1) {
      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO bookings
             (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
              rental_price_snapshot, total_amount, status, note)
           VALUES ($1, $2, $3, $4::date, $5::int, $6::date, $7::numeric, $8::numeric, 'PENDING', $9)
           RETURNING id`,
          [
            makeBookingCode(), tenantId, kamar.id, input.start_date, input.duration_months,
            endDate, kamar.monthly_price, totalAmount, input.note ?? null,
          ],
        )
        bookingId = inserted.rows[0]?.id ?? null
      } catch (error) {
        // Kode booking kebetulan kembar: ulangi dengan kode baru.
        if ((error as { code?: string }).code !== '23505') throw error
      }
    }
    if (!bookingId) throw conflict('Gagal membuat kode booking, coba lagi')

    await client.query(
      `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
       VALUES ($1, NULL, 'PENDING', $2, 'Booking dibuat penyewa')`,
      [bookingId, tenantId],
    )

    const detail = await loadBooking(client, bookingId)
    return toBooking(detail as BookingRow)
  })
}

export async function cancelBooking(bookingId: string, tenantId: string): Promise<Booking> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query<{ status: BookingStatus; room_id: string }>(
      `SELECT status, room_id FROM bookings
       WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [bookingId, tenantId],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking tidak ditemukan')
    if (booking.status !== 'PENDING' && booking.status !== 'AWAITING_PAYMENT') {
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

    const detail = await loadBooking(client, bookingId)
    return toBooking(detail as BookingRow)
  })
}
