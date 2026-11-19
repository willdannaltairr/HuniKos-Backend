import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { validate } from '../../middlewares/validate.js'
import { created, ok } from '../../utils/response.js'
import { createBookingSchema, bookingListQuerySchema, idParamSchema } from './bookings.schema.js'
import { createBooking, listBookings, getBookingDetail, cancelBooking } from './bookings.service.js'

const router = Router()

router.use(authenticate, requireRole('tenant'))

router.post('/', validate(createBookingSchema), async (req, res) => {
  const booking = await createBooking(req.user.id, req.body)
  created(res, booking, 'Booking berhasil dibuat')
})

router.get('/', validate(bookingListQuerySchema, 'query'), async (req, res) => {
  ok(res, await listBookings({ tenantId: req.user.id, status: req.validated.query.status }), 'OK')
})

router.get('/:id', validate(idParamSchema, 'params'), async (req, res) => {
  ok(res, await getBookingDetail(req.validated.params.id, req.user), 'OK')
})

router.patch('/:id/cancel', validate(idParamSchema, 'params'), async (req, res) => {
  ok(res, await cancelBooking(req.validated.params.id, req.user.id), 'Booking dibatalkan')
})

export default router
