import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { validate } from '../../middlewares/validate.js'
import { uploadFields, uploadedFiles } from '../../middlewares/upload.js'
import { ok } from '../../utils/response.js'
import { badRequest } from '../../utils/HttpError.js'
import { updateProfileSchema } from '../auth/auth.schema.js'
import { updateProfile, replaceAvatar } from './users.service.js'

const router = Router()

router.use(authenticate)

router.put('/me', validate(updateProfileSchema), async (req, res) => {
  const user = await updateProfile(req.user.id, req.body)
  ok(res, user, 'Profil berhasil diperbarui')
})

router.post('/me/avatar', uploadFields([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  const file = uploadedFiles(req, 'avatar')[0]
  if (!file) throw badRequest('File avatar wajib diunggah pada field "avatar"')

  const user = await replaceAvatar(req.user.id, file)
  ok(res, user, 'Avatar berhasil diperbarui')
})

export default router
