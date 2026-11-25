import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../utils/HttpError.js'
import { env } from '../config/env.js'
import type { FieldError } from '../types/domain.js'

// Kode error PostgreSQL diterjemahkan ke kode HTTP sesuai kontrak.
function translateDatabaseError(error: { code?: string }): HttpError | null {
  if (error.code === '23505') return new HttpError(409, 'Data sudah ada, gunakan nilai lain')
  if (error.code === '23001' || error.code === '23503') {
    return new HttpError(409, 'Data masih dipakai oleh data lain')
  }
  if (error.code === '22P02') return new HttpError(400, 'Format ID tidak valid')
  if (error.code === '23514') return new HttpError(422, 'Nilai tidak memenuhi aturan database')
  return null
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
  })
}

// Express mengenali error handler dari jumlah argumennya (4), jadi next wajib ada.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let finalError = error instanceof HttpError ? error : null

  if (!finalError && error instanceof SyntaxError && (error as { status?: number }).status === 400) {
    finalError = new HttpError(400, 'Format JSON tidak valid')
  } else if (!finalError) {
    finalError = translateDatabaseError(error as { code?: string })
  }

  if (!finalError) {
    // Detail hanya masuk log; client menerima pesan generik.
    if (!env.isProduction) console.error(error)
    else console.error(`${req.method} ${req.originalUrl} -> ${(error as Error).message}`)
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' })
    return
  }

  const payload: { success: boolean; message: string; errors?: FieldError[] } = {
    success: false,
    message: finalError.message,
  }
  // Kode 422 selalu menyertakan daftar errors, walau kosong.
  if (finalError.statusCode === 422) payload.errors = finalError.errors ?? []

  res.status(finalError.statusCode).json(payload)
}
