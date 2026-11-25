// Menjalankan migration dengan SSL yang sama seperti aplikasi.
// CLI node-pg-migrate tidak membaca sertifikat CA, padahal Aiven mewajibkan TLS.
import { runner } from 'node-pg-migrate'
import { env } from '../src/config/env.js'

const arah = process.argv[2] === 'down' ? 'down' : 'up'

try {
  const migrations = await runner({
    databaseUrl: {
      connectionString: env.databaseUrl,
      ssl: env.dbCaCert ? { ca: env.dbCaCert, rejectUnauthorized: true } : false,
    },
    dir: 'migrations',
    direction: arah,
    migrationsTable: 'pgmigrations',
  })
  console.log(`Migration selesai: ${migrations.length} berkas diproses (${arah}).`)
} catch (error) {
  console.error('Migration gagal:', (error as Error).message)
  process.exitCode = 1
}
