import 'dotenv/config'
import { readFileSync } from 'node:fs'

// Ambil variabel wajib; hentikan aplikasi kalau belum diisi.
function wajib(nama: string): string {
  const nilai = process.env[nama]
  if (!nilai) {
    console.error(`Environment ${nama} belum diisi. Salin .env.example menjadi .env lalu lengkapi.`)
    process.exit(1)
  }
  return nilai
}

// Sertifikat CA Aiven. Boleh berupa isi langsung (DB_CA_CERT) atau path berkas (DB_CA_CERT_PATH).
function bacaSertifikat(): string | null {
  if (process.env.DB_CA_CERT) return process.env.DB_CA_CERT.replace(/\\n/g, '\n')
  if (process.env.DB_CA_CERT_PATH) return readFileSync(process.env.DB_CA_CERT_PATH, 'utf8')
  return null
}

const databaseUrl = wajib('DATABASE_URL')
const jwtSecret = wajib('JWT_SECRET')
const nodeEnv = process.env.NODE_ENV ?? 'development'
const dbCaCert = bacaSertifikat()

if (jwtSecret.length < 32) {
  console.error('JWT_SECRET minimal 32 karakter.')
  process.exit(1)
}

// Produksi wajib memakai SSL; tanpa CA, koneksi ke Aiven akan ditolak.
const databaseLokal = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl)
if (nodeEnv === 'production' && !dbCaCert && !databaseLokal) {
  console.error('Sertifikat CA wajib diisi di produksi (DB_CA_CERT atau DB_CA_CERT_PATH).')
  process.exit(1)
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl,
  dbCaCert,
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? 5),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // Daftar origin yang boleh mengakses API, dipisah koma.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Batas percobaan login per IP per 15 menit.
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT ?? 10),
  cloudinary: {
    cloudName: wajib('CLOUDINARY_CLOUD_NAME'),
    apiKey: wajib('CLOUDINARY_API_KEY'),
    apiSecret: wajib('CLOUDINARY_API_SECRET'),
  },
} as const
