import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { validate } from '../../middlewares/validate.js'
import { badRequest } from '../../utils/HttpError.js'
import { created, ok } from '../../utils/response.js'
import { idParamSchema } from '../bookings/bookings.schema.js'
import {
  createMidtransPayment,
  orderIdForBooking,
  syncMidtransPayment,
} from './midtrans.service.js'
import { terimaNotifikasi } from '../../utils/midtrans.js'

// Rute penyewa: membuat transaksi Snap dan mengecek status setelah kembali
// dari halaman pembayaran Midtrans.
export const midtransRouter = Router()

midtransRouter.post(
  '/:id/payments/midtrans',
  authenticate,
  requireRole('tenant'),
  validate(idParamSchema, 'params'),
  async (req, res) => {
    const result = await createMidtransPayment(req.user.id, req.validated.params.id)
    created(res, result, 'Transaksi Midtrans dibuat')
  },
)

midtransRouter.get(
  '/:id/payments/midtrans/status',
  authenticate,
  requireRole('tenant'),
  validate(idParamSchema, 'params'),
  async (req, res) => {
    const orderId = await orderIdForBooking(req.validated.params.id)
    if (!orderId) throw badRequest('Booking ini belum punya transaksi Midtrans')
    await syncMidtransPayment(orderId)
    ok(res, { order_id: orderId }, 'Status pembayaran disinkronkan')
  },
)

// Dipanggil Midtrans: tidak memakai auth aplikasi, tapi signature diperiksa.
export const midtransNotificationRouter = Router()

midtransNotificationRouter.post('/notification', terimaNotifikasi, async (req, res) => {
  const orderId = String(req.body?.order_id ?? '')
  if (!orderId) throw badRequest('order_id wajib ada')
  await syncMidtransPayment(orderId)
  res.status(200).json({ success: true, message: 'Notifikasi diterima' })
})
