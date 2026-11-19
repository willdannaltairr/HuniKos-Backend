import multer from 'multer'
import { HttpError } from '../utils/HttpError.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// mimetype dari client bisa dipalsukan, jadi isi file diperiksa lewat magic bytes.
const SIGNATURES = [
  { type: 'image/jpeg', ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: 'image/webp',
    ext: 'webp',
    check: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
  },
]

export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null
  return SIGNATURES.find((signature) => signature.check(buffer)) ?? null
}

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new HttpError(415, 'Tipe file harus jpg, png, atau webp'))
    }
    return cb(null, true)
  },
})

// Membungkus multer agar error-nya memakai amplop dan kode HTTP kontrak.
export function uploadFields(fields) {
  const handler = uploader.fields(fields)
  return (req, res, next) => {
    handler(req, res, (error) => {
      if (!error) return next()

      if (error instanceof HttpError) return next(error)
      if (error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Ukuran file maksimal 2 MB'))
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new HttpError(400, 'Jumlah atau nama field file tidak sesuai'))
      }
      return next(new HttpError(400, 'Upload gagal, periksa kembali file yang dikirim'))
    })
  }
}

// Dipakai service setelah file lolos multer.
export function assertRealImage(file) {
  if (!file) return null
  const detected = detectImageType(file.buffer)
  if (!detected) throw new HttpError(415, 'Isi file bukan gambar jpg, png, atau webp yang valid')
  return detected
}
