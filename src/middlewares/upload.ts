import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../utils/HttpError.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Hasil deteksi magic bytes: tipe MIME dan ekstensi yang dipakai saat menyimpan. */
export interface DetectedImage {
  type: string
  ext: string
}

interface Signature extends DetectedImage {
  check: (buffer: Buffer) => boolean
}

// mimetype dari client bisa dipalsukan, jadi isi file diperiksa lewat magic bytes.
const SIGNATURES: Signature[] = [
  { type: 'image/jpeg', ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: 'image/webp',
    ext: 'webp',
    check: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
]

export function detectImageType(buffer: Buffer | undefined): DetectedImage | null {
  if (!buffer || buffer.length < 12) return null
  const found = SIGNATURES.find((signature) => signature.check(buffer))
  if (!found) return null
  return { type: found.type, ext: found.ext }
}

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new HttpError(415, 'Tipe file harus jpg, png, atau webp'))
    }
    return cb(null, true)
  },
})

/** Multer memakai kode error sendiri, bukan status HTTP. */
interface MulterError extends Error {
  code?: string
}

// Membungkus multer agar error-nya memakai amplop dan kode HTTP kontrak.
export function uploadFields(fields: multer.Field[]) {
  const handler = uploader.fields(fields)
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (error: unknown) => {
      if (!error) return next()

      if (error instanceof HttpError) return next(error)

      const code = (error as MulterError).code
      if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Ukuran file maksimal 2 MB'))
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new HttpError(400, 'Jumlah atau nama field file tidak sesuai'))
      }
      return next(new HttpError(400, 'Upload gagal, periksa kembali file yang dikirim'))
    })
  }
}

// Dipakai service setelah file lolos multer.
export function assertRealImage(file: Express.Multer.File | undefined): DetectedImage | null {
  if (!file) return null
  const detected = detectImageType(file.buffer)
  if (!detected) throw new HttpError(415, 'Isi file bukan gambar jpg, png, atau webp yang valid')
  return detected
}

/** Ambil daftar berkas dari satu nama field multipart tanpa peduli bentuk `req.files`. */
export function uploadedFiles(req: Request, field: string): Express.Multer.File[] {
  const files = req.files
  if (!files || Array.isArray(files)) return []
  return files[field] ?? []
}
