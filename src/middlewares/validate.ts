import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'
import { HttpError } from '../utils/HttpError.js'
import type { FieldError } from '../types/domain.js'

/** Sumber input Express yang boleh divalidasi. */
type InputSource = 'body' | 'query' | 'params'

// Membungkus skema zod: input valid diteruskan, input salah menjadi 422 berisi daftar field.
export function validate(schema: ZodTypeAny, source: InputSource = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const input = (req[source] as unknown) ?? {}
    const result = schema.safeParse(input)

    if (!result.success) {
      const errors: FieldError[] = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }))
      return next(new HttpError(422, 'Data tidak valid', errors))
    }

    // req.query bersifat read-only pada Express 5, jadi hasil parse disimpan terpisah.
    req.validated = { ...(req.validated ?? {}), [source]: result.data }
    if (source === 'body') req.body = result.data

    return next()
  }
}
