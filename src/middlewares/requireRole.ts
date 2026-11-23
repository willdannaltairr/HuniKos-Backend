import type { NextFunction, Request, Response } from 'express'
import { forbidden } from '../utils/HttpError.js'
import type { Role } from '../types/domain.js'

// Dipasang setelah authenticate: menolak role yang tidak termasuk daftar.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) return next(forbidden('Anda harus login terlebih dahulu'))
    if (!roles.includes(req.user.role)) {
      return next(forbidden('Role Anda tidak diizinkan mengakses endpoint ini'))
    }
    return next()
  }
}
