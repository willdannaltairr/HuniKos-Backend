import pg from 'pg'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { env } from './env.js'

const { Pool, types } = pg

// Tanpa pengaturan ini uang terbaca sebagai teks dan tanggal bisa bergeser.
types.setTypeParser(1700, (value) => (value === null ? null : Number(value))) // NUMERIC
types.setTypeParser(1082, (value) => value) // DATE tetap teks YYYY-MM-DD
types.setTypeParser(20, (value) => (value === null ? null : Number(value))) // COUNT / BIGINT

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  ssl: env.dbCaCert ? { ca: env.dbCaCert, rejectUnauthorized: true } : false,
})

pool.on('error', (error) => {
  console.error('Koneksi database bermasalah:', error.message)
})

// Query biasa. Semua nilai dikirim lewat parameter ($1, $2, ...), tidak pernah disambung ke SQL.
export function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params)
}

// Menjalankan beberapa query sebagai satu transaksi: berhasil semua, atau dibatalkan semua.
export async function withTransaction<T>(kerja: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const hasil = await kerja(client)
    await client.query('COMMIT')
    return hasil
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkConnection(): Promise<void> {
  await pool.query('SELECT 1')
}
