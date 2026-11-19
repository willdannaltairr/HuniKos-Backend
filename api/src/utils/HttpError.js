// Error yang sengaja dilempar aplikasi beserta kode HTTP yang diinginkan.
export class HttpError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.errors = errors
  }
}

export const badRequest = (message) => new HttpError(400, message)
export const unauthorized = (message = 'Token tidak valid atau sudah kedaluwarsa') => new HttpError(401, message)
export const forbidden = (message = 'Anda tidak punya akses ke resource ini') => new HttpError(403, message)
export const notFound = (message = 'Data tidak ditemukan') => new HttpError(404, message)
export const conflict = (message) => new HttpError(409, message)
export const unprocessable = (message, errors) => new HttpError(422, message, errors)
