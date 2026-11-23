import type { PoolClient } from 'pg'
import { withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { expireStaleBookings, syncRoomStatus } from '../../utils/bookingRules.js'
import { BOOKING_SELECT } from '../bookings/bookings.service.js'
import type { Booking, BookingRow } from '../bookings/bookings.service.js'

function toBooking(row: BookingRow): Booking {
  const { owner_id: _owner, tenant_id: _tenant, room_id: _room, ...booking } = row
  return booking
}

async function loadOwnedBooking(
  client: PoolClient,
  bookingId: string,
  ownerId: string,
): Promise<BookingRow> {
  const { rows } = await client.query<BookingRow>(
    `${BOOKING_SELECT} WHERE b.id = $1 AND p.owner_id = $2 FOR UPDATE OF b`,
    [bookingId, ownerId],
  )
  if (!rows[0]) throw notFound('Booking tidak ditemukan')
  return rows[0]
}

export interface DecisionInput {
  action: 'approve' | 'reject'
  owner_note?: string
}

export async function decideBooking(
  ownerId: string,
  bookingId: string,
  input: DecisionInput,
): Promise<Booking> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)
    const booking = await loadOwnedBooking(client, bookingId, ownerId)

    if (booking.status !== 'PENDING') {
      throw conflict(`Booking berstatus ${booking.status}, hanya PENDING yang bisa diputuskan`)
    }

    if (input.action === 'approve') {
      await client.query(
        `UPDATE bookings
         SET status = 'AWAITING_PAYMENT', expires_at = now() + interval '24 hours',
             owner_note = $2, updated_at = now()
         WHERE id = $1`,
        [bookingId, input.owner_note ?? null],
      )
      await client.query(
        `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, 'PENDING', 'AWAITING_PAYMENT', $2, $3)`,
        [bookingId, ownerId, input.owner_note ?? 'Booking disetujui pemilik'],
      )
      await client.query(
        `UPDATE rooms SET status = 'RESERVED', updated_at = now() WHERE id = $1`,
        [booking.room_id],
      )
    } else {
      await client.query(
        `UPDATE bookings SET status = 'REJECTED', owner_note = $2, updated_at = now() WHERE id = $1`,
        [bookingId, input.owner_note],
      )
      await client.query(
        `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, 'PENDING', 'REJECTED', $2, $3)`,
        [bookingId, ownerId, input.owner_note],
      )
      await syncRoomStatus(client, booking.room_id)
    }

    const { rows } = await client.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [bookingId])
    return toBooking(rows[0] as BookingRow)
  })
}

export async function completeBooking(ownerId: string, bookingId: string): Promise<Booking> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)
    const booking = await loadOwnedBooking(client, bookingId, ownerId)

    if (booking.status !== 'CONFIRMED') {
      throw conflict(`Booking berstatus ${booking.status}, hanya CONFIRMED yang bisa diselesaikan`)
    }

    await client.query(
      `UPDATE bookings SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
      [bookingId],
    )
    await client.query(
      `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
       VALUES ($1, 'CONFIRMED', 'COMPLETED', $2, 'Masa sewa selesai')`,
      [bookingId, ownerId],
    )
    await syncRoomStatus(client, booking.room_id)

    const { rows } = await client.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [bookingId])
    return toBooking(rows[0] as BookingRow)
  })
}
