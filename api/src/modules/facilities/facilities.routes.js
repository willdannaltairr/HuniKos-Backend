import { Router } from 'express'
import { ok } from '../../utils/response.js'
import { listFacilities } from './facilities.service.js'

const router = Router()

router.get('/', async (req, res) => {
  const facilities = await listFacilities()
  ok(res, facilities, 'OK')
})

export default router
