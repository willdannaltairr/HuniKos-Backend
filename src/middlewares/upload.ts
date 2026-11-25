import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../utils/HttpError.js'

const TIPE_DIIZINKAN = ['image/jpeg', 'image/png', 'image/webp']

/** Hasil pemeriksaan isi file: tipe dan ekstensi yang dipakai saat menyimpan. */
export interface DetectedImage {
  type: string
  ext: string
}

// mimetype dari client bisa dipalsukan, jadi isi file diperiksa lewat magic bytes.
export function detectImageType(buffer: Buffer | undefined): DetectedImage | null {
  if (!buffer || buffer.length < 12) return null

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (isJpeg) return { type: 'image/jpeg', ext: 'jpg' }

  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  if (isPng) return { type: 'image/png', ext: 'png' }

  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (isWebp) return { type: 'image/webp', ext: 'webp' }

  return null
}

// Dipakai service setelah file lolos multer. Melempar 415 bila isi file bukan gambar.
export function assertRealImage(file: Express.Multer.File): DetectedImage {
  const detected = detectImageType(file.buffer)
  if (!detected) throw new HttpError(415, 'Isi file bukan gambar jpg, png, atau webp yang valid')
  return detected
}

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!TIPE_DIIZINKAN.includes(file.mimetype)) {
      return cb(new HttpError(415, 'Tipe file harus jpg, png, atau webp'))
    }
    return cb(null, true)
  },
})

// Multer memakai kode error sendiri, jadi diterjemahkan ke kode HTTP sesuai kontrak.
export function uploadFields(fields: multer.Field[]) {
  const handler = uploader.fields(fields)
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (error: unknown) => {
      if (!error) return next()
      if (error instanceof HttpError) return next(error)

      const code = (error as { code?: string }).code
      if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Ukuran file maksimal 2 MB'))
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new HttpError(400, 'Jumlah atau nama field file tidak sesuai'))
      }
      return next(new HttpError(400, 'Upload gagal, periksa kembali file yang dikirim'))
    })
  }
}

/** Ambil daftar berkas dari satu nama field multipart. */
export function uploadedFiles(req: Request, field: string): Express.Multer.File[] {
  const files = req.files
  if (!files || Array.isArray(files)) return []
  return files[field] ?? []
}
