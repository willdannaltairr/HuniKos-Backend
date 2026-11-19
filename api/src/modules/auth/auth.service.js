import bcrypt from 'bcryptjs'
import { query } from '../../config/db.js'
import { conflict, unauthorized, forbidden } from '../../utils/HttpError.js'

// Bentuk User sesuai kontrak bagian 8; password_hash tidak pernah ikut.
export const USER_COLUMNS = 'id, full_name, email, phone_number, avatar_url, role, account_status, created_at'

export async function findUserByEmail(email) {
  const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email])
  return rows[0] ?? null
}

export async function registerUser({ full_name, email, password, phone_number, role }) {
  const existing = await findUserByEmail(email)
  if (existing) throw conflict('Email sudah digunakan')

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const { rows } = await query(
      `INSERT INTO users (full_name, email, password_hash, phone_number, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [full_name, email, passwordHash, phone_number ?? null, role],
    )
    return rows[0]
  } catch (error) {
    // Dua pendaftaran bersamaan dengan email sama tetap ditangkap di sini.
    if (error.code === '23505') throw conflict('Email sudah digunakan')
    throw error
  }
}

export async function loginUser({ email, password }) {
  const user = await findUserByEmail(email)

  // Pesan sama untuk email salah dan password salah, supaya akun tidak bisa ditebak.
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false
  if (!user || !passwordMatches) throw unauthorized('Email atau password salah')

  if (user.account_status !== 'active') throw forbidden('Akun Anda sedang dinonaktifkan')

  const { password_hash: _ignored, ...safeUser } = user
  return safeUser
}
