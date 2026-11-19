import { HttpError } from '../utils/HttpError.js'

// Membungkus skema zod: input valid diteruskan, input salah menjadi 422 berisi daftar field.
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {})

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
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
