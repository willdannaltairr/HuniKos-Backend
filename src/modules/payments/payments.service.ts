import type { PoolClient } from 'pg'
import { query, withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { assertRealImage } from '../../middlewares/upload.js'
import { saveFile } from '../../utils/storage.js'
import { expireStaleBookings } from '../../utils/bookingRules.js'
import type { PaymentStatus } from '../../types/domain.js'

const PAYMENT_SELECT = `
  SELECT pay.id, pay.booking_id, pay.amount, pay.proof_url, pay.status, pay.note,
         pay.verified_at, pay.created_at, pay.midtrans_order_id,
         pay.midtrans_transaction_status, pay.midtrans_payment_type,
         b.booking_code, r.room_number, p.name AS property_name, u.full_name AS tenant_name
  FROM payments pay
  JOIN bookings b ON b.id = pay.booking_id
  JOIN rooms r ON r.id = b.room_id
  JOIN properties p ON p.id = r.property_id
  JOIN users u ON u.id = b.tenant_id`

export interface Payment {
  id: string
  booking_id: string
  amount: number
  proof_url: string
  status: PaymentStatus
  note: string | null
  verified_at: Date | null
  created_at: Date
  booking_code: string
  room_number: string
  property_name: string
  tenant_name: string
  midtrans_order_id: string | null
  midtrans_transaction_status: string | null
  midtrans_payment_type: string | null
}

export async function listTenantPayments(tenantId: string): Promise<Payment[]> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)
    const { rows } = await client.query<Payment>(
      `${PAYMENT_SELECT} WHERE b.tenant_id = $1 ORDER BY pay.created_at DESC`,
      [tenantId],
    )
    return rows
  })
}

export async function listOwnerPayments(
  ownerId: string,
  status?: PaymentStatus,
): Promise<Payment[]> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const values: unknown[] = [ownerId]
    let where = 'p.owner_id = $1'
    if (status) {
      values.push(status)
      where += ` AND pay.status = $${values.length}`
    }

    const { rows } = await client.query<Payment>(
      `${PAYMENT_SELECT} WHERE ${where} ORDER BY pay.created_at DESC`,
      values,
    )
    return rows
  })
}

export async function uploadPaymentProof(
  tenantId: string,
  bookingId: string,
  file: Express.Multer.File,
): Promise<Payment> {
  const detected = assertRealImage(file)

  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query<{ status: string; total_amount: number }>(
      `SELECT status, total_amount FROM bookings
       WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
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
    if ((pending.rowCount ?? 0) > 0) {
      throw conflict('Masih ada bukti pembayaran yang menunggu verifikasi')
    }

    const saved = await saveFile(file.buffer, 'proofs', detected.ext)

    // Nominal selalu diambil dari booking, bukan dari client.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO payments (booking_id, amount, proof_url, storage_key, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING id`,
      [bookingId, booking.total_amount, saved.url, saved.key],
    )

    const { rows: paymentRows } = await client.query<Payment>(
      `${PAYMENT_SELECT} WHERE pay.id = $1`,
      [inserted.rows[0]?.id],
    )
    return paymentRows[0] as Payment
  })
}

export interface VerifyPaymentInput {
  action: 'approve' | 'reject'
  note?: string
}

export async function verifyPayment(
  ownerId: string,
  paymentId: string,
  input: VerifyPaymentInput,
): Promise<Payment> {
  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query<{
      id: string
      status: PaymentStatus
      booking_id: string
      booking_status: string
      room_id: string
      expires_at: Date | null
      midtrans_order_id: string | null
    }>(
      `SELECT pay.id, pay.status, pay.booking_id, b.status AS booking_status,
              b.room_id, b.expires_at, pay.midtrans_order_id
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
    // Pembayaran Midtrans hanya boleh berubah lewat webhook bersignature atau
    // sinkronisasi status. Pemilik tidak boleh menyetujuinya secara manual.
    if (payment.midtrans_order_id) {
      throw conflict(
        'Pembayaran Midtrans diverifikasi otomatis, tidak bisa diverifikasi manual',
      )
    }

    if (input.action === 'reject') {
      await client.query(
        `UPDATE payments SET status = 'REJECTED', verified_by = $2, verified_at = now(), note = $3
         WHERE id = $1`,
        [paymentId, ownerId, input.note ?? null],
      )
    } else {
      await approvePayment(client, ownerId, payment)
    }

    const { rows: updated } = await client.query<Payment>(
      `${PAYMENT_SELECT} WHERE pay.id = $1`,
      [paymentId],
    )
    return updated[0] as Payment
  })
}

// Approve: payment VERIFIED, booking CONFIRMED, kamar OCCUPIED.
async function approvePayment(
  client: PoolClient,
  ownerId: string,
  payment: { id: string; booking_id: string; booking_status: string; room_id: string; expires_at: Date | null },
): Promise<void> {
  if (payment.booking_status !== 'AWAITING_PAYMENT') {
    throw conflict(`Booking berstatus ${payment.booking_status} tidak bisa dikonfirmasi`)
  }
  // Batas waktu pembayaran sudah lewat? Tolak.
  if (payment.expires_at !== null && payment.expires_at.getTime() <= Date.now()) {
    throw conflict('Batas waktu pembayaran sudah lewat')
  }

  await client.query(
    `UPDATE payments SET status = 'VERIFIED', verified_by = $2, verified_at = now()
     WHERE id = $1`,
    [payment.id, ownerId],
  )
  await client.query(
    `UPDATE bookings SET status = 'CONFIRMED', expires_at = NULL, updated_at = now()
     WHERE id = $1`,
    [payment.booking_id],
  )
  await client.query(
    `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
     VALUES ($1, 'AWAITING_PAYMENT', 'CONFIRMED', $2, 'Pembayaran diverifikasi')`,
    [payment.booking_id, ownerId],
  )
  await client.query('UPDATE rooms SET status = $2, updated_at = now() WHERE id = $1', [
    payment.room_id,
    'OCCUPIED',
  ])
}

// Pendapatan bulan berjalan menurut zona Asia/Jakarta.
export async function sumRevenueThisMonth(ownerId: string): Promise<number> {
  const { rows } = await query<{ total: number }>(
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
  return rows[0]?.total ?? 0
}
