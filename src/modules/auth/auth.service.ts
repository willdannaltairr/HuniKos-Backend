import bcrypt from 'bcryptjs'
import { query } from '../../config/db.js'
import { conflict, forbidden, unauthorized } from '../../utils/HttpError.js'
import type { Role, UserRow } from '../../types/domain.js'

// Kolom yang boleh dikirim ke client; password_hash tidak pernah ikut.
export const USER_COLUMNS =
  'id, full_name, email, phone_number, avatar_url, role, account_status, created_at'

interface UserWithPassword extends UserRow {
  password_hash: string
}

export interface RegisterInput {
  full_name: string
  email: string
  password: string
  phone_number?: string
  role: Role
}

export interface LoginInput {
  email: string
  password: string
}

export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const { rows } = await query<UserWithPassword>('SELECT * FROM users WHERE email = $1', [email])
  return rows[0] ?? null
}

export async function registerUser(input: RegisterInput): Promise<UserRow> {
  const sudahAda = await findUserByEmail(input.email)
  if (sudahAda) throw conflict('Email sudah digunakan')

  const passwordHash = await bcrypt.hash(input.password, 10)

  try {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (full_name, email, password_hash, phone_number, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [input.full_name, input.email, passwordHash, input.phone_number ?? null, input.role],
    )
    return rows[0] as UserRow
  } catch (error) {
    // Dua pendaftaran bersamaan dengan email sama tetap tertangkap di sini.
    if ((error as { code?: string }).code === '23505') throw conflict('Email sudah digunakan')
    throw error
  }
}

export async function loginUser(input: LoginInput): Promise<UserRow> {
  const user = await findUserByEmail(input.email)

  // Pesan sama untuk email salah dan password salah agar akun tidak bisa ditebak.
  const cocok = user ? await bcrypt.compare(input.password, user.password_hash) : false
  if (!user || !cocok) throw unauthorized('Email atau password salah')

  if (user.account_status !== 'active') throw forbidden('Akun Anda sedang dinonaktifkan')

  const { password_hash: _abaikan, ...aman } = user
  return aman
}
