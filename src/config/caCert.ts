import { existsSync, readFileSync } from 'node:fs'

/**
 * Menentukan sertifikat CA untuk koneksi TLS (dipakai Aiven).
 *
 * Dua cara pengisian, mana pun boleh dipakai:
 *   DB_CA_CERT       isi sertifikat langsung di .env (boleh satu baris dengan \n)
 *   DB_CA_CERT_PATH  path berkas .pem, lebih rapi karena .env tidak membengkak
 *
 * Mengembalikan null bila keduanya kosong, artinya koneksi tanpa TLS (PostgreSQL lokal).
 */
export function loadCaCert(): string | null {
  const inline = process.env.DB_CA_CERT?.trim()
  if (inline) return inline.replace(/\\n/g, '\n')

  const path = process.env.DB_CA_CERT_PATH?.trim()
  if (!path) return null

  if (!existsSync(path)) {
    console.error(`DB_CA_CERT_PATH menunjuk berkas yang tidak ada: ${path}`)
    process.exit(1)
  }

  return readFileSync(path, 'utf8')
}
