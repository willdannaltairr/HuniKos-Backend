import pg from 'pg'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { env } from './env.js'

const { Pool, types } = pg

// Tanpa parser ini uang menjadi string dan tanggal bergeser satu hari karena zona waktu.
types.setTypeParser(1700, (value: string | null) => (value === null ? null : Number(value)))
types.setTypeParser(1082, (value: string) => value)
types.setTypeParser(20, (value: string | null) => (value === null ? null : Number(value)))

const ssl = env.dbCaCert
  ? { ca: env.dbCaCert.replace(/\\n/g, '\n'), rejectUnauthorized: true }
  : false

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  ssl,
})

pool.on('error', (error: Error) => {
  console.error('Koneksi database bermasalah:', error.message)
})

/** Query biasa; bentuk baris ditentukan pemanggil lewat parameter generik. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params)
}

// Seluruh langkah di dalam work() dijalankan dalam satu transaksi.
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
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

export async function checkConnection(): Promise<void> {
  await pool.query('SELECT 1')
}
