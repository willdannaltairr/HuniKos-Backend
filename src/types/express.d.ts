import type { UserRow } from './domain.js'

// Menambahkan field yang dipasang middleware ke objek Request Express.
declare global {
  namespace Express {
    interface Request {
      /**
       * Diisi `authenticate`/`optionalAuth`. Ditandai wajib karena seluruh route
       * yang membacanya sudah berada di belakang middleware tersebut; route
       * publik memakai `req.user ?? null`.
       */
      user: UserRow
      /**
       * Hasil parse zod per sumber input. Tipe detailnya ditentukan skema zod
       * masing-masing route, jadi di sini disimpan sebagai `any` agar pemakaian
       * `req.validated.params.id` tetap ringkas.
       */
      validated: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params?: any
      }
    }
  }
}

export {}
