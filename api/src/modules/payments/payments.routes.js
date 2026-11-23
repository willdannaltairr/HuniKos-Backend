import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { uploadFields } from '../../middlewares/upload.js'
import { validate } from '../../middlewares/validate.js'
import { badRequest } from '../../utils/HttpError.js'
import { ok, created } from '../../utils/response.js'
import { idParamSchema } from '../bookings/bookings.schema.js'
import { uploadPaymentProof, listTenantPayments } from './payments.service.js'

// Route penyewa: upload bukti untuk booking miliknya, lalu lihat riwayat pembayaran.
export const tenantPaymentRouter = Router()

tenantPaymentRouter.post(
  '/:id/payments',
  authenticate,
  requireRole('tenant'),
  validate(idParamSchema, 'params'),
  uploadFields([{ name: 'proof', maxCount: 1 }]),
  async (req, res) => {
    const file = req.files?.proof?.[0]
    if (!file) throw badRequest('Bukti pembayaran wajib diunggah pada field "proof"')

    const payment = await uploadPaymentProof(req.user.id, req.validated.params.id, file)
    created(res, payment, 'Bukti pembayaran berhasil diunggah')
  },
)

export const tenantPaymentListRouter = Router()

tenantPaymentListRouter.get('/', authenticate, requireRole('tenant'), async (req, res) => {
  const payments = await listTenantPayments(req.user.id)
  ok(res, payments, 'OK')
})
