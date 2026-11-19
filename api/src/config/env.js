import 'dotenv/config'

const required = ['DATABASE_URL', 'JWT_SECRET']

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Environment ${name} belum diisi. Salin .env.example menjadi .env lalu lengkapi.`)
    process.exit(1)
  }
}

if (process.env.JWT_SECRET.length < 32) {
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

const isLocalDatabase = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)

// Produksi wajib SSL; tanpa sertifikat CA koneksi Aiven akan ditolak.
if (nodeEnv === 'production' && !process.env.DB_CA_CERT && !isLocalDatabase) {
  console.error('DB_CA_CERT wajib diisi di produksi (isi file ca.pem dari Aiven).')
  process.exit(1)
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL,
  dbCaCert: process.env.DB_CA_CERT || null,
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? 5),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  baseUrl: (process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
  storageDriver,
}
