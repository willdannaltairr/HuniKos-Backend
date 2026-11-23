import type { FieldError } from '../types/domain.js'

// Error yang sengaja dilempar aplikasi beserta kode HTTP yang diinginkan.
export class HttpError extends Error {
  readonly statusCode: number
  readonly errors: FieldError[] | null

  constructor(statusCode: number, message: string, errors: FieldError[] | null = null) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.errors = errors
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, message)
export const unauthorized = (message = 'Token tidak valid atau sudah kedaluwarsa'): HttpError =>
  new HttpError(401, message)
export const forbidden = (message = 'Anda tidak punya akses ke resource ini'): HttpError =>
  new HttpError(403, message)
export const notFound = (message = 'Data tidak ditemukan'): HttpError => new HttpError(404, message)
export const conflict = (message: string): HttpError => new HttpError(409, message)
export const unprocessable = (message: string, errors: FieldError[]): HttpError =>
  new HttpError(422, message, errors)
