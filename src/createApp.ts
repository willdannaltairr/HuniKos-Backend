import express from 'express'
import type { RequestHandler } from 'express'
import helmet from 'helmet'
import type { HelmetOptions } from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import { checkConnection } from './config/db.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { ok } from './utils/response.js'
import authRoutes from './modules/auth/auth.routes.js'
import userRoutes from './modules/users/users.routes.js'
import facilityRoutes from './modules/facilities/facilities.routes.js'
import propertyRoutes from './modules/properties/properties.routes.js'
import roomRoutes from './modules/rooms/rooms.routes.js'
import bookingRoutes from './modules/bookings/bookings.routes.js'
import chatRoutes from './modules/chat/chat.routes.js'
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js'
import { tenantPaymentRouter, tenantPaymentListRouter } from './modules/payments/payments.routes.js'
import { midtransNotificationRouter, midtransRouter } from './modules/payments/midtrans.routes.js'
import ownerRoutes from './modules/owner/owner.routes.js'
import adminRoutes from './modules/admin/admin.routes.js'

export function createApp() {
  const app = express()

  // Di Vercel, request tiba lewat proxy sehingga IP pengguna hanya ada di
  // X-Forwarded-For. Tanpa ini express-rate-limit menghitung per IP proxy,
  // artinya 10 percobaan login dari siapa pun mengunci semua orang.
  // Satu hop dipercaya karena hanya proxy platform yang ada di depannya.
  if (env.isProduction) app.set('trust proxy', 1)

  // Gambar dimuat oleh website dan aplikasi mobile dari domain lain.
  // Cast dipakai karena build Vercel me-resolve 'helmet' sebagai namespace, bukan fungsi
  // default; tanpa cast tsc gagal dengan TS2349 walau di lokal lolos.
  const pasangHelmet = helmet as unknown as (options?: HelmetOptions) => RequestHandler
  app.use(pasangHelmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

  app.use(
    cors({
      origin(origin, callback) {
        // Tanpa origin (cURL, aplikasi mobile) permintaan tetap dilayani.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true)
        // flutter run -d chrome memilih port acak tiap dijalankan, jadi origin
        // loopback diterima berapa pun portnya — juga saat backend di Vercel.
        // Ini aman: hanya halaman di komputer pengembang yang bisa memakainya,
        // sedangkan domain lain tetap harus terdaftar di CORS_ORIGINS.
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true)
        }
        return callback(null, false)
      },
    }),
  )

  if (!env.isProduction) app.use(morgan('dev'))

  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', async (req, res) => {
    await checkConnection()
    ok(res, { status: 'ok' }, 'Server dan database sehat')
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/facilities', facilityRoutes)
  app.use('/api/properties', propertyRoutes)
  app.use('/api/rooms', roomRoutes)
  app.use('/api/bookings', bookingRoutes)
  app.use('/api/bookings', tenantPaymentRouter)
  // Midtrans Dipasang setelah rute lama agar rute bayar Snap tidak tertutup.
  app.use('/api/bookings', midtransRouter)
  app.use('/api/midtrans', midtransNotificationRouter)
  app.use('/api/payments', tenantPaymentListRouter)
  app.use('/api/chat', chatRoutes)
  app.use('/api/maintenance', maintenanceRoutes)
  app.use('/api/owner', ownerRoutes)
  app.use('/api/admin', adminRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
