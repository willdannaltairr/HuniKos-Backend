import { createHash, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { env } from '../config/env.js'

// Jembatan ke REST API Midtrans. Sengaja memakai fetch bawaan Node 20 supaya
// tidak menambah dependency yang perlu dijelaskan ke penguji.

type SnapBody = {
  order_id: string
  status_code: string
  gross_amount: string
  signature_key: string
  transaction_status?: string
}

function baseUrl(): string {
  return env.midtrans.isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'
}

function authorization(): string {
  if (!env.midtrans.serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diisi')
  return `Basic ${Buffer.from(`${env.midtrans.serverKey}:`).toString('base64')}`
}

export type SnapResult = {
  token: string
  redirect_url: string
}

export type MidtransStatus = {
  transaction_status: string
  fraud_status?: string
  status_code?: string
  status_message?: string
  transaction_id?: string
  payment_type?: string
  settlement_time?: string
}

// Membuat transaksi Snap. order_id memakai kode booking supaya mudah ditelusur
// di dashboard Midtrans.
export async function createSnapTransaction(
  orderId: string,
  grossAmount: number,
  customerName: string,
): Promise<SnapResult> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: authorization(),
  }
  if (env.midtrans.notificationUrl) {
    headers['X-Override-Notification'] = env.midtrans.notificationUrl
  }

  const response = await fetch(`${baseUrl()}/snap/v1/transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: Math.round(grossAmount) },
      customer_details: { first_name: customerName },
      item_details: [
        {
          id: orderId,
          name: 'Sewa kamar HuniKos',
          price: Math.round(grossAmount),
          quantity: 1,
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Midtrans menolak transaksi (${response.status}): ${detail.slice(0, 300)}`)
  }
  const payload = (await response.json()) as SnapResult
  return payload
}

// Ambil status terbaru langsung dari Midtrans. Dipakai webhook dan sebagai
// cadangan saat notifikasi tidak sampai (localhost tidak bisa menerima webhook).
// Transaksi Snap yang belum dipilih metode bayarnya belum punya status di Core
// API dan menjawab 404 — itu wajar, dibaca sebagai "menunggu pembayaran".
export async function getTransactionStatus(orderId: string): Promise<MidtransStatus | null> {
  const response = await fetch(`${baseUrl()}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: 'application/json', Authorization: authorization() },
  })
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gagal cek status Midtrans (${response.status}): ${detail.slice(0, 300)}`)
  }
  return (await response.json()) as MidtransStatus
}

// Menolak notifikasi palsu. Rumus resmi Midtrans:
// SHA512(order_id + status_code + gross_amount + ServerKey).
export function signatureValid(body: SnapBody): boolean {
  const kunci = env.midtrans.signatureKey || env.midtrans.serverKey
  if (!kunci || !body?.signature_key) return false
  const expected = createHash('sha512')
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${kunci}`)
    .digest('hex')
  const diterima = String(body.signature_key)
  if (expected.length !== diterima.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(diterima))
}

// Midtrans mengirim notifikasi tanpa token aplikasi, jadi middleware auth
// sengaja dilewati pada rute ini.
export const terimaNotifikasi: RequestHandler = (req, res, next) => {
  if (!signatureValid(req.body as SnapBody)) {
    res.status(401).json({ success: false, message: 'Signature notifikasi tidak valid' })
    return
  }
  next()
}
