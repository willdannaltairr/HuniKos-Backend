import { HttpError } from '../utils/HttpError.js'
import { env } from '../config/env.js'

// Diterjemahkan dari SQLSTATE PostgreSQL ke kode HTTP kontrak bagian 6.
function translateDatabaseError(error) {
  if (error.code === '23505') return new HttpError(409, 'Data sudah ada, gunakan nilai lain')
  if (error.code === '23001' || error.code === '23503') {
    return new HttpError(409, 'Data masih dipakai oleh data lain')
  }
  if (error.code === '22P02') return new HttpError(400, 'Format ID tidak valid')
  if (error.code === '23514') return new HttpError(422, 'Nilai tidak memenuhi aturan database')
  return null
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
  })
}

// eslint-disable-next-line no-unused-vars -- Express mengenali error handler dari 4 argumen
export function errorHandler(error, req, res, next) {
  let finalError = error

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    finalError = new HttpError(400, 'Format JSON tidak valid')
  } else if (!(error instanceof HttpError)) {
    finalError = translateDatabaseError(error) ?? null
  }

  if (!finalError) {
    // Detail hanya masuk log; client cukup menerima pesan generik.
    if (!env.isProduction) console.error(error)
    else console.error(`${req.method} ${req.originalUrl} -> ${error.message}`)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' })
  }

  const payload = { success: false, message: finalError.message }
  if (finalError.statusCode === 422 && finalError.errors) payload.errors = finalError.errors

  // Kode 422 selalu menyertakan daftar errors, walau kosong, sesuai kontrak.
  if (finalError.statusCode === 422 && !payload.errors) payload.errors = []

  return res.status(finalError.statusCode).json(payload)
}
