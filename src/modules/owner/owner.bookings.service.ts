import type { PoolClient } from 'pg'
import { withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { expireStaleBookings, syncRoomStatus } from '../../utils/bookingRules.js'
import { deactivateBookingMember } from '../../utils/chatHooks.js'
import { BOOKING_SELECT, toBooking } from '../bookings/bookings.service.js'
import type { Booking, BookingRow } from '../bookings/bookings.service.js'

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

async function recordHistory(
  client: PoolClient,
  bookingId: string,
  from: string,
  to: string,
  ownerId: string,
  note: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [bookingId, from, to, ownerId, note],
  )
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
      // Booking disetujui: penyewa punya waktu 24 jam untuk membayar.
      await client.query(
        `UPDATE bookings
         SET status = 'AWAITING_PAYMENT', expires_at = now() + interval '24 hours',
             owner_note = $2, updated_at = now()
         WHERE id = $1`,
        [bookingId, input.owner_note ?? null],
      )
      await recordHistory(client, bookingId, 'PENDING', 'AWAITING_PAYMENT', ownerId,
        input.owner_note ?? 'Booking disetujui pemilik')
      await client.query('UPDATE rooms SET status = $2, updated_at = now() WHERE id = $1', [
        booking.room_id,
        'RESERVED',
      ])
    } else {
      await client.query(
        `UPDATE bookings SET status = 'REJECTED', owner_note = $2, updated_at = now() WHERE id = $1`,
        [bookingId, input.owner_note ?? null],
      )
      await recordHistory(client, bookingId, 'PENDING', 'REJECTED', ownerId, input.owner_note ?? null)
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
    await recordHistory(client, bookingId, 'CONFIRMED', 'COMPLETED', ownerId, 'Masa sewa selesai')
    await syncRoomStatus(client, booking.room_id)
    // Sewa selesai: anggota tidak lagi perlu mengakses grup obrolan booking.
    await deactivateBookingMember(client, bookingId)

    const { rows } = await client.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [bookingId])
    return toBooking(rows[0] as BookingRow)
  })
}
