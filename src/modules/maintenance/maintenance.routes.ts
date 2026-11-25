import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { uploadFields, uploadedFiles } from '../../middlewares/upload.js'
import { validate } from '../../middlewares/validate.js'
import { created, ok } from '../../utils/response.js'
import { createMaintenanceSchema } from './maintenance.schema.js'
import { createMaintenance, listTenantMaintenance } from './maintenance.service.js'

const router = Router()

router.use(authenticate, requireRole('tenant'))

router.post(
  '/',
  uploadFields([{ name: 'photo', maxCount: 1 }]),
  validate(createMaintenanceSchema),
  async (req, res) => {
    const maintenance = await createMaintenance(
      req.user.id,
      req.body,
      uploadedFiles(req, 'photo')[0],
    )
    created(res, maintenance, 'Laporan kerusakan berhasil dikirim')
  },
)

router.get('/', async (req, res) => {
  ok(res, await listTenantMaintenance(req.user.id), 'OK')
})

export default router
