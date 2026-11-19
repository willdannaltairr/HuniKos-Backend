import { Router } from 'express'
import { optionalAuth } from '../../middlewares/auth.js'
import { validate } from '../../middlewares/validate.js'
import { ok } from '../../utils/response.js'
import { idParamSchema } from '../properties/properties.schema.js'
import { findRoomDetail } from './rooms.service.js'

const router = Router()

router.get('/:id', optionalAuth, validate(idParamSchema, 'params'), async (req, res) => {
  const room = await findRoomDetail(req.validated.params.id, req.user ?? null)
  ok(res, room, 'OK')
})

export default router
