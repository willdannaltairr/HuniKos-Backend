import { withTransaction, query } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { assertRealImage } from '../../middlewares/upload.js'
import { saveFile } from '../../utils/storage.js'
import { expireStaleBookings } from '../../utils/bookingRules.js'

const PAYMENT_SELECT = `
  SELECT pay.id, pay.booking_id, pay.amount, pay.proof_url, pay.status, pay.note,
         pay.verified_at, pay.created_at,
         b.booking_code, r.room_number, p.name AS property_name, u.full_name AS tenant_name
  FROM payments pay
  JOIN bookings b ON b.id = pay.booking_id
  JOIN rooms r ON r.id = b.room_id
  JOIN properties p ON p.id = r.property_id
  JOIN users u ON u.id = b.tenant_id`

export async function listTenantPayments(tenantId) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)
    const { rows } = await client.query(
      `${PAYMENT_SELECT} WHERE b.tenant_id = $1 ORDER BY pay.created_at DESC`,
      [tenantId],
    )
    return rows
  })
}

export async function listOwnerPayments(ownerId, status) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)
    const values = [ownerId]
    let filter = 'p.owner_id = $1'
    if (status) {
      values.push(status)
      filter += ` AND pay.status = $${values.length}`
    }
    const { rows } = await client.query(
      `${PAYMENT_SELECT} WHERE ${filter} ORDER BY pay.created_at DESC`,
      values,
    )
    return rows
  })
}

export async function uploadPaymentProof(tenantId, bookingId, file) {
  const detected = assertRealImage(file)

  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [bookingId, tenantId],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking tidak ditemukan')
    if (booking.status !== 'AWAITING_PAYMENT') {
      throw conflict(`Booking berstatus ${booking.status} tidak menerima pembayaran`)
    }

    const pending = await client.query(
      `SELECT 1 FROM payments WHERE booking_id = $1 AND status = 'PENDING' LIMIT 1`,
      [bookingId],
    )
    if (pending.rowCount > 0) throw conflict('Masih ada bukti pembayaran yang menunggu verifikasi')

    const saved = await saveFile(file, 'proofs', detected.ext)

    // Nominal selalu diambil dari booking, bukan dari client.
    const inserted = await client.query(
      `INSERT INTO payments (booking_id, amount, proof_url, storage_key, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING id`,
      [bookingId, booking.total_amount, saved.url, saved.key],
    )

    const { rows: paymentRows } = await client.query(
      `${PAYMENT_SELECT} WHERE pay.id = $1`,
      [inserted.rows[0].id],
    )
    return paymentRows[0]
  })
}

export async function verifyPayment(ownerId, paymentId, { action, note }) {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query(
      `SELECT pay.*, b.status AS booking_status, b.room_id, b.expires_at, p.owner_id
       FROM payments pay
       JOIN bookings b ON b.id = pay.booking_id
       JOIN rooms r ON r.id = b.room_id
       JOIN properties p ON p.id = r.property_id
       WHERE pay.id = $1 AND p.owner_id = $2
       FOR UPDATE OF pay, b`,
      [paymentId, ownerId],
    )
    const payment = rows[0]
    if (!payment) throw notFound('Pembayaran tidak ditemukan')
    if (payment.status !== 'PENDING') {
      throw conflict(`Pembayaran berstatus ${payment.status} sudah diproses`)
    }

    if (action === 'reject') {
      await client.query(
        `UPDATE payments SET status = 'REJECTED', verified_by = $2, verified_at = now(), note = $3
         WHERE id = $1`,
        [paymentId, ownerId, note],
      )
    } else {
      // Booking harus masih menunggu pembayaran dan belum kedaluwarsa.
      if (payment.booking_status !== 'AWAITING_PAYMENT') {
        throw conflict(`Booking berstatus ${payment.booking_status} tidak bisa dikonfirmasi`)
      }
      const stillValid = await client.query(
        `SELECT ($1::timestamptz IS NULL OR $1::timestamptz > now()) AS valid`,
        [payment.expires_at],
      )
      if (!stillValid.rows[0].valid) throw conflict('Batas waktu pembayaran sudah lewat')

      await client.query(
        `UPDATE payments SET status = 'VERIFIED', verified_by = $2, verified_at = now(), note = $3
         WHERE id = $1`,
        [paymentId, ownerId, note ?? null],
      )
      await client.query(
        `UPDATE bookings SET status = 'CONFIRMED', updated_at = now(), expires_at = NULL
         WHERE id = $1`,
        [payment.booking_id],
      )
      await client.query(
        `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, 'AWAITING_PAYMENT', 'CONFIRMED', $2, $3)`,
        [payment.booking_id, ownerId, 'Pembayaran diverifikasi'],
      )
      await client.query(
        `UPDATE rooms SET status = 'OCCUPIED', updated_at = now() WHERE id = $1`,
        [payment.room_id],
      )
    }

    const { rows: updated } = await client.query(`${PAYMENT_SELECT} WHERE pay.id = $1`, [paymentId])
    return updated[0]
  })
}

// Dipakai dashboard: pendapatan bulan berjalan menurut zona Asia/Jakarta.
export async function sumRevenueThisMonth(ownerId) {
  const { rows } = await query(
    `SELECT coalesce(sum(pay.amount), 0)::numeric AS total
     FROM payments pay
     JOIN bookings b ON b.id = pay.booking_id
     JOIN rooms r ON r.id = b.room_id
     JOIN properties p ON p.id = r.property_id
     WHERE p.owner_id = $1 AND pay.status = 'VERIFIED'
       AND (pay.verified_at AT TIME ZONE 'Asia/Jakarta')::date
           >= date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta')::date)::date`,
    [ownerId],
  )
  return rows[0].total
}
