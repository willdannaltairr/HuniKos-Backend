import 'dotenv/config'
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { loadCaCert } from './caCert.js'

// Struktur lama menyimpan .env di dalam folder api/. Kalau .env di root belum ada,
// nilai dibaca dari sana supaya `npm run dev` tetap jalan tanpa memindahkan berkas.
if (!process.env.DATABASE_URL && existsSync('api/.env')) {
  loadEnv({ path: 'api/.env' })
}

const required = ['DATABASE_URL', 'JWT_SECRET'] as const

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Environment ${name} belum diisi. Salin .env.example menjadi .env lalu lengkapi.`)
    process.exit(1)
  }
}

const jwtSecret = process.env.JWT_SECRET as string

if (jwtSecret.length < 32) {
  console.error('JWT_SECRET minimal 32 karakter.')
  process.exit(1)
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
const storageDriver = process.env.STORAGE_DRIVER ?? 'local'

if (storageDriver === 'cloudinary') {
  for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    if (!process.env[name]) {
      console.error(`Environment ${name} wajib diisi bila STORAGE_DRIVER=cloudinary.`)
      process.exit(1)
    }
  }
}

const databaseUrl = process.env.DATABASE_URL as string
const isLocalDatabase = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl)
const caCert = loadCaCert()

// Produksi wajib SSL; tanpa sertifikat CA koneksi Aiven akan ditolak.
if (nodeEnv === 'production' && !caCert && !isLocalDatabase) {
  console.error(
    'Sertifikat CA wajib diisi di produksi: set DB_CA_CERT_PATH ke file ca.pem dari Aiven, atau DB_CA_CERT dengan isinya.',
  )
  process.exit(1)
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl,
  dbCaCert: caCert,
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? 5),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  baseUrl: (process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
  storageDriver,
  // Batas percobaan login per IP per 15 menit. Bisa dinaikkan saat menjalankan uji otomatis,
  // yang butuh banyak login dari satu alamat.
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT ?? 10),
} as const
