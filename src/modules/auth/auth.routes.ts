import { Router } from 'express'
import type { RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import type { Options as RateLimitOptions } from 'express-rate-limit'
import { validate } from '../../middlewares/validate.js'
import { authenticate, signToken } from '../../middlewares/auth.js'
import { created, ok } from '../../utils/response.js'
import { env } from '../../config/env.js'
import { registerSchema, loginSchema } from './auth.schema.js'
import { registerUser, loginUser } from './auth.service.js'

const router = Router()

// Dibatasi per IP supaya password tidak bisa ditebak berulang kali.
// Cast sama alasannya dengan helmet di app.ts: build Vercel me-resolve paket ini
// sebagai namespace, lokal tidak.
const batasi = rateLimit as unknown as (options?: Partial<RateLimitOptions>) => RequestHandler
const loginLimiter = batasi({
  windowMs: 15 * 60 * 1000,
  limit: env.loginRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login, coba lagi nanti' },
})

router.post('/register', validate(registerSchema), async (req, res) => {
  const user = await registerUser(req.body)
  created(res, { user, token: signToken(user) }, 'Registrasi berhasil')
})

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const user = await loginUser(req.body)
  ok(res, { user, token: signToken(user) }, 'Login berhasil')
})

router.get('/me', authenticate, async (req, res) => {
  ok(res, req.user, 'OK')
})

export default router
