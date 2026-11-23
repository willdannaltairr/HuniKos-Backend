// Pembungkus node-pg-migrate agar tetap membaca .env dari lokasi lama (api/.env)
// selama berkas itu belum dipindahkan ke root repo.
import 'dotenv/config'
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { spawnSync } from 'node:child_process'

if (!process.env.DATABASE_URL && existsSync('api/.env')) {
  loadEnv({ path: 'api/.env' })
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env lalu lengkapi.')
  process.exit(1)
}

const direction = process.argv[2] === 'down' ? 'down' : 'up'
const result = spawnSync(
  process.execPath,
  ['node_modules/node-pg-migrate/bin/node-pg-migrate.js', direction],
  { stdio: 'inherit', env: process.env },
)

process.exit(result.status ?? 1)
