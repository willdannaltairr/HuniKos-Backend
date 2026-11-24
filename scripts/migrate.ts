// Menjalankan migration node-pg-migrate dengan konfigurasi SSL yang sama seperti aplikasi.
// CLI node-pg-migrate tidak membaca sertifikat CA sendiri, padahal Aiven mewajibkan TLS.
import 'dotenv/config'
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { runner } from 'node-pg-migrate'
import { loadCaCert } from '../src/config/caCert.js'

// Struktur lama menyimpan .env di dalam folder api/. Kalau .env di root belum ada,
// nilai dibaca dari sana supaya `npm run migrate:up` tetap jalan tanpa memindahkan berkas.
if (!process.env.DATABASE_URL && existsSync('api/.env')) {
  loadEnv({ path: 'api/.env' })
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env lalu lengkapi.')
  process.exit(1)
}

const ca = loadCaCert()
const ssl = ca ? { ca, rejectUnauthorized: true } : false
const direction = process.argv[2] === 'down' ? 'down' : 'up'

try {
  const migrations = await runner({
    databaseUrl: { connectionString: databaseUrl, ssl },
    dir: 'migrations',
    direction,
    migrationsTable: 'pgmigrations',
  })
  console.log(`Migration selesai: ${migrations.length} berkas diproses (${direction}).`)
} catch (error) {
  console.error('Migration gagal:', (error as Error).message)
  process.exitCode = 1
}
