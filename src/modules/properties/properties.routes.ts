import { Router } from 'express'
import { optionalAuth } from '../../middlewares/auth.js'
import { validate } from '../../middlewares/validate.js'
import { ok, paginated } from '../../utils/response.js'
import { propertyListQuerySchema, idParamSchema } from './properties.schema.js'
import { searchProperties, findPropertyDetail } from './properties.service.js'

const router = Router()

router.get('/', validate(propertyListQuerySchema, 'query'), async (req, res) => {
  const filters = req.validated.query
  const { items, total } = await searchProperties(filters)
  paginated(res, items, { page: filters.page, limit: filters.limit, total })
})

router.get('/:id', optionalAuth, validate(idParamSchema, 'params'), async (req, res) => {
  const property = await findPropertyDetail(req.validated.params.id, req.user ?? null)
  ok(res, property, 'OK')
})

export default router
