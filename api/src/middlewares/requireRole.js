import { forbidden } from '../utils/HttpError.js'

// Dipasang setelah authenticate: menolak role yang tidak termasuk daftar.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(forbidden('Anda harus login terlebih dahulu'))
    if (!roles.includes(req.user.role)) {
      return next(forbidden('Role Anda tidak diizinkan mengakses endpoint ini'))
    }
    return next()
  }
}
