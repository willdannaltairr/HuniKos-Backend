import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import { checkConnection } from './config/db.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { UPLOAD_DIR } from './utils/storage.js'
import { ok } from './utils/response.js'
import authRoutes from './modules/auth/auth.routes.js'
import userRoutes from './modules/users/users.routes.js'
import facilityRoutes from './modules/facilities/facilities.routes.js'
import propertyRoutes from './modules/properties/properties.routes.js'
import roomRoutes from './modules/rooms/rooms.routes.js'
import bookingRoutes from './modules/bookings/bookings.routes.js'
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js'
import { tenantPaymentRouter, tenantPaymentListRouter } from './modules/payments/payments.routes.js'
import ownerRoutes from './modules/owner/owner.routes.js'
import adminRoutes from './modules/admin/admin.routes.js'

export function createApp() {
  const app = express()

  app.use(helmet({
    // Gambar disajikan dari domain backend dan dimuat oleh website/mobile lain.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }))

  app.use(cors({
    origin(origin, callback) {
      // Permintaan tanpa origin (cURL, aplikasi mobile) tetap dilayani.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true)
      return callback(null, false)
    },
  }))

  if (!env.isProduction) app.use(morgan('dev'))

  app.use(express.json({ limit: '100kb' }))

  if (env.storageDriver === 'local') {
    app.use('/uploads', express.static(UPLOAD_DIR))
  }

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
  app.use('/api/payments', tenantPaymentListRouter)
  app.use('/api/maintenance', maintenanceRoutes)
  app.use('/api/owner', ownerRoutes)
  app.use('/api/admin', adminRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
