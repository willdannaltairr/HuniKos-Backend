import { createApp } from './app.js'
import { env } from './config/env.js'
import { checkConnection, pool } from './config/db.js'

async function start() {
  // Gagal cepat lebih baik daripada server hidup tetapi semua request 500.
  try {
    await checkConnection()
    console.log('Koneksi database berhasil.')
  } catch (error) {
    console.error('Gagal terhubung ke database:', error.message)
    process.exit(1)
  }

  const app = createApp()
  const server = app.listen(env.port, () => {
    console.log(`HUNIKOS API berjalan di ${env.baseUrl} (${env.nodeEnv})`)
  })

  const shutdown = (signal) => {
    console.log(`${signal} diterima, mematikan server...`)
    server.close(() => {
      pool.end().finally(() => process.exit(0))
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start()
