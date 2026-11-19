import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import { checkConnection } from './config/db.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { UPLOAD_DIR } from './utils/storage.js'
import { ok } from './utils/response.js'

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

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
