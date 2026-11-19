import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/requireRole.js'
import { uploadFields } from '../../middlewares/upload.js'
import { validate } from '../../middlewares/validate.js'
import { created, ok } from '../../utils/response.js'
import { createMaintenanceSchema } from './maintenance.service.js'
import { createMaintenance, listTenantMaintenance } from './maintenance.service.js'

const router = Router()

router.use(authenticate, requireRole('tenant'))

router.post('/', uploadFields([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  // Field teks ikut multipart, jadi divalidasi manual lewat skema yang sama.
  const parsed = createMaintenanceSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({
      success: false,
      message: 'Data tidak valid',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    })
  }

  const maintenance = await createMaintenance(req.user.id, parsed.data, req.files?.photo?.[0] ?? null)
  return created(res, maintenance, 'Laporan kerusakan berhasil dikirim')
})

router.get('/', async (req, res) => {
  const maintenance = await listTenantMaintenance(req.user.id)
  ok(res, maintenance, 'OK')
})

export default router
