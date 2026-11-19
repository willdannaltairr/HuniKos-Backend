import pg from 'pg'
import { env } from './env.js'

const { Pool, types } = pg

// Tanpa parser ini uang menjadi string dan tanggal bergeser satu hari karena zona waktu.
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)))
types.setTypeParser(1082, (value) => value)
types.setTypeParser(20, (value) => (value === null ? null : Number(value)))

const ssl = env.dbCaCert
  ? { ca: env.dbCaCert.replace(/\\n/g, '\n'), rejectUnauthorized: true }
  : false

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  ssl,
})

pool.on('error', (error) => {
  console.error('Koneksi database bermasalah:', error.message)
})

export function query(text, params) {
  return pool.query(text, params)
}

// Seluruh langkah di dalam work() dijalankan dalam satu transaksi.
export async function withTransaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkConnection() {
  await pool.query('SELECT 1')
}
