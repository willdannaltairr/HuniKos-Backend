import { randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { query, withTransaction } from '../../config/db.js'
import { env } from '../../config/env.js'
import { conflict, HttpError, notFound } from '../../utils/HttpError.js'
import { expireStaleBookings } from '../../utils/bookingRules.js'
import { createSnapTransaction, getTransactionStatus } from '../../utils/midtrans.js'

// Satu transaksi Midtrans = satu baris payments. Status akhir ditulis oleh
// webhook atau oleh cek status ketika pengguna kembali dari halaman Snap.

export type SnapPaymentResponse = {
  payment_id: string
  order_id: string
  snap_token: string
  redirect_url: string
  amount: number
  booking_code: string
}

type Draft = {
  paymentId: string
  orderId: string
  bookingCode: string
  amount: number
  customerName: string
  snapToken: string | null
  redirectUrl: string | null
}

export async function createMidtransPayment(
  tenantId: string,
  bookingId: string,
): Promise<SnapPaymentResponse> {
  // Tanpa kunci, Midtrans tidak bisa membuat transaksi apa pun. Dijawab 503
  // dengan alasan yang bisa dibaca pengguna, bukan 500 generik yang membuat
  // orang mengira aplikasinya rusak.
  if (!env.midtrans.serverKey) {
    throw new HttpError(
      503,
      'Pembayaran Midtrans belum aktif di server ini. Gunakan unggah bukti transfer, atau hubungi pemilik kos.',
    )
  }

  const draft = await withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query<{
      booking_code: string
      total_amount: number
      status: string
      expires_at: Date | null
      full_name: string
    }>(
      `SELECT b.booking_code, b.total_amount, b.status, b.expires_at, u.full_name
       FROM bookings b JOIN users u ON u.id = b.tenant_id
       WHERE b.id = $1 AND b.tenant_id = $2 FOR UPDATE OF b`,
      [bookingId, tenantId],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking tidak ditemukan')
    if (booking.status !== 'AWAITING_PAYMENT') {
      throw conflict(`Booking berstatus ${booking.status} tidak menerima pembayaran`)
    }
    if (booking.expires_at && booking.expires_at.getTime() <= Date.now()) {
      throw conflict('Batas waktu pembayaran sudah lewat')
    }

    // Klik dua kali memakai token yang sama, bukan membuat order baru.
    const sudah = await client.query<{
      id: string
      midtrans_order_id: string
      midtrans_snap_token: string | null
      midtrans_redirect_url: string | null
    }>(
      `SELECT id, midtrans_order_id, midtrans_snap_token, midtrans_redirect_url
       FROM payments
       WHERE booking_id = $1 AND status = 'PENDING' AND midtrans_order_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId],
    )
    const lama = sudah.rows[0]
    if (lama?.midtrans_snap_token && lama.midtrans_redirect_url) {
      return {
        paymentId: lama.id,
        orderId: lama.midtrans_order_id,
        bookingCode: booking.booking_code,
        amount: booking.total_amount,
        customerName: booking.full_name,
        snapToken: lama.midtrans_snap_token,
        redirectUrl: lama.midtrans_redirect_url,
      }
    }

    const orderId = `${booking.booking_code}-${randomBytes(3).toString('hex').toUpperCase()}`
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO payments (booking_id, amount, status, midtrans_order_id, note)
       VALUES ($1, $2, 'PENDING', $3, 'Menunggu pembayaran Midtrans')
       RETURNING id`,
      [bookingId, booking.total_amount, orderId],
    )
    return {
      paymentId: inserted.rows[0].id,
      orderId,
      bookingCode: booking.booking_code,
      amount: booking.total_amount,
      customerName: booking.full_name,
      snapToken: null,
      redirectUrl: null,
    }
  })

  if (draft.snapToken && draft.redirectUrl) {
    return {
      payment_id: draft.paymentId,
      order_id: draft.orderId,
      snap_token: draft.snapToken,
      redirect_url: draft.redirectUrl,
      amount: draft.amount,
      booking_code: draft.bookingCode,
    }
  }

  let snap
  try {
    snap = await createSnapTransaction(draft.orderId, draft.amount, draft.customerName)
  } catch (error) {
    await query(
      `UPDATE payments SET status = 'REJECTED', note = 'Gagal membuat transaksi Midtrans'
       WHERE id = $1`,
      [draft.paymentId],
    )
    throw error
  }

  await query(
    `UPDATE payments
     SET midtrans_snap_token = $1, midtrans_redirect_url = $2,
         midtrans_transaction_status = 'pending'
     WHERE id = $3`,
    [snap.token, snap.redirect_url, draft.paymentId],
  )

  return {
    payment_id: draft.paymentId,
    order_id: draft.orderId,
    snap_token: snap.token,
    redirect_url: snap.redirect_url,
    amount: draft.amount,
    booking_code: draft.bookingCode,
  }
}

// Menyamakan status Midtrans ke database. Aman dipanggil berulang: baris yang
// sudah VERIFIED tidak diubah lagi.
export async function syncMidtransPayment(orderId: string): Promise<void> {
  const status = await getTransactionStatus(orderId)

  await withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string
      status: string
      booking_id: string
      booking_status: string
      room_id: string
      expires_at: Date | null
    }>(
      `SELECT pay.id, pay.status, b.id AS booking_id, b.status AS booking_status,
              b.room_id, b.expires_at
       FROM payments pay JOIN bookings b ON b.id = pay.booking_id
       WHERE pay.midtrans_order_id = $1 FOR UPDATE OF pay, b`,
      [orderId],
    )
    const payment = rows[0]
    if (!payment) throw notFound('Pembayaran Midtrans tidak ditemukan')

    // Snap yang belum dipilih metode bayarnya belum punya status di Core API
    // (Midtrans menjawab 404). Tidak ada yang disinkronkan selain penanda.
    if (!status) {
      if (payment.status === 'PENDING') {
        await client.query(
          `UPDATE payments SET midtrans_transaction_status = 'pending' WHERE id = $1`,
          [payment.id],
        )
      }
      return
    }

    await client.query(
      `UPDATE payments
       SET midtrans_transaction_status = $2, midtrans_transaction_id = $3,
           midtrans_payment_type = $4, midtrans_fraud_status = $5
       WHERE id = $1`,
      [
        payment.id,
        status.transaction_status,
        status.transaction_id ?? null,
        status.payment_type ?? null,
        status.fraud_status ?? null,
      ],
    )

    if (payment.status === 'VERIFIED') return

    const berhasil =
      (status.transaction_status === 'settlement' || status.transaction_status === 'capture') &&
      (!status.fraud_status || status.fraud_status === 'accept')
    const gagal = ['deny', 'cancel', 'expire', 'failure'].includes(status.transaction_status)

    if (berhasil) {
      if (payment.booking_status !== 'AWAITING_PAYMENT') return
      if (payment.expires_at && payment.expires_at.getTime() <= Date.now()) return
      await setLunas(client, payment.id, payment.booking_id, payment.room_id)
    } else if (gagal) {
      await client.query(
        `UPDATE payments SET status = 'REJECTED', note = $2 WHERE id = $1`,
        [payment.id, status.status_message ?? `Pembayaran ${status.transaction_status}`],
      )
    }
  })
}

async function setLunas(
  client: PoolClient,
  paymentId: string,
  bookingId: string,
  roomId: string,
): Promise<void> {
  await client.query(
    `UPDATE payments SET status = 'VERIFIED', verified_at = now(), note = NULL
     WHERE id = $1`,
    [paymentId],
  )
  await client.query(
    `UPDATE bookings SET status = 'CONFIRMED', expires_at = NULL, updated_at = now()
     WHERE id = $1`,
    [bookingId],
  )
  await client.query(
    `INSERT INTO booking_status_histories
       (booking_id, from_status, to_status, changed_by, note)
     VALUES ($1, 'AWAITING_PAYMENT', 'CONFIRMED', NULL, 'Pembayaran Midtrans terverifikasi')`,
    [bookingId],
  )
  await client.query(`UPDATE rooms SET status = 'OCCUPIED', updated_at = now() WHERE id = $1`, [
    roomId,
  ])
}

export async function orderIdForBooking(bookingId: string): Promise<string | null> {
  const { rows } = await query<{ midtrans_order_id: string }>(
    `SELECT midtrans_order_id FROM payments
     WHERE booking_id = $1 AND midtrans_order_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [bookingId],
  )
  return rows[0]?.midtrans_order_id ?? null
}
