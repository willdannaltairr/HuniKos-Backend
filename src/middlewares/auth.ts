import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { query } from '../config/db.js'
import { unauthorized } from '../utils/HttpError.js'
import type { UserRow } from '../types/domain.js'

// Ambil token dari header Authorization: Bearer <token>.
function readToken(req: Request): string | null {
  const header = req.headers.authorization ?? ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

// User selalu dibaca ulang dari database supaya akun yang di-suspend langsung ditolak.
async function loadUser(userId: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, full_name, email, phone_number, avatar_url, role, account_status, created_at
     FROM users WHERE id = $1`,
    [userId],
  )
  return rows[0] ?? null
}

// Payload JWT hanya berisi sub dan role sesuai kontrak bagian 6.
interface TokenPayload {
  sub: string
  role: string
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req)
  if (!token) return next(unauthorized('Token tidak ditemukan'))

  let payload: TokenPayload
  try {
    payload = jwt.verify(token, env.jwtSecret) as TokenPayload
  } catch {
    return next(unauthorized())
  }

  const user = await loadUser(payload.sub)
  if (!user) return next(unauthorized())
  if (user.account_status !== 'active') return next(unauthorized('Akun Anda sedang dinonaktifkan'))

  req.user = user
  return next()
}

// Tamu boleh lewat; token rusak tetap dianggap tamu, bukan error.
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req)
  if (!token) return next()

  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload
    const user = await loadUser(payload.sub)
    if (user && user.account_status === 'active') req.user = user
  } catch {
    // Token tidak valid diperlakukan seperti pengunjung biasa.
  }

  return next()
}

export function signToken(user: Pick<UserRow, 'id' | 'role'>): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions)
}
