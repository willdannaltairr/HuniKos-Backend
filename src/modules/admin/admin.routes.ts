import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { validate } from '../../middlewares/validate.js'
import { ok, paginated } from '../../utils/response.js'
import { idParamSchema } from '../bookings/bookings.schema.js'
import {
  userListQuerySchema, accountStatusSchema, propertyReviewQuerySchema, verificationSchema,
  promoSchema,
} from './admin.schema.js'
import {
  getAdminDashboard, listUsers, changeUserStatus, listPropertiesForReview, verifyProperty,
  setPropertyPromo,
} from './admin.service.js'

const router = Router()

// Seluruh endpoint admin hanya untuk role admin; akun suspended sudah ditolak authenticate.
router.use(authenticate, requireRole('admin'))

router.get('/dashboard', async (req, res) => {
  ok(res, await getAdminDashboard(), 'OK')
})

router.get('/users', validate(userListQuerySchema, 'query'), async (req, res) => {
  const filters = req.validated.query
  const { users, total } = await listUsers(filters)
  paginated(res, users, { page: filters.page, limit: filters.limit, total })
})

router.patch(
  '/users/:id/status',
  validate(idParamSchema, 'params'),
  validate(accountStatusSchema),
  async (req, res) => {
    ok(res, await changeUserStatus(req.validated.params.id, req.body.account_status), 'Status akun diperbarui')
  },
)

router.get('/properties', validate(propertyReviewQuerySchema, 'query'), async (req, res) => {
  ok(res, await listPropertiesForReview(req.validated.query.verification_status), 'OK')
})

router.patch(
  '/properties/:id/verification',
  validate(idParamSchema, 'params'),
  validate(verificationSchema),
  async (req, res) => {
    ok(res, await verifyProperty(req.validated.params.id, req.body), 'Verifikasi properti disimpan')
  },
)

router.patch(
  '/properties/:id/promo',
  validate(idParamSchema, 'params'),
  validate(promoSchema),
  async (req, res) => {
    ok(
      res,
      await setPropertyPromo(req.validated.params.id, req.body.is_owner_promo),
      'Status promo properti diperbarui',
    )
  },
)

export default router
