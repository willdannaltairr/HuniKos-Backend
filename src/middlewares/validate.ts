import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'
import { HttpError } from '../utils/HttpError.js'

// Sumber input Express yang boleh divalidasi.
type InputSource = 'body' | 'query' | 'params'

// Membungkus skema zod. Input salah diubah menjadi 422 berisi daftar field.
export function validate(schema: ZodTypeAny, source: InputSource = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const hasil = schema.safeParse(req[source] ?? {})

    if (!hasil.success) {
      const errors = hasil.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }))
      return next(new HttpError(422, 'Data tidak valid', errors))
    }

    // req.query tidak bisa diganti isinya di Express 5, jadi hasil parse disimpan terpisah.
    req.validated = { ...req.validated, [source]: hasil.data }
    if (source === 'body') req.body = hasil.data

    return next()
  }
}
