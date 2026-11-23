import { z } from 'zod'

export const BOOKING_STATUSES = [
  'PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED',
] as const

const dateOnly = z
  .string({ required_error: 'Tanggal mulai wajib diisi' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')

export const createBookingSchema = z.object({
  room_id: z.string({ required_error: 'Kamar wajib dipilih' }).uuid('Format ID kamar tidak valid'),
  start_date: dateOnly,
  duration_months: z.coerce
    .number({ required_error: 'Durasi wajib diisi' })
    .int('Durasi harus bilangan bulat')
    .min(1, 'Durasi minimal 1 bulan')
    .max(24, 'Durasi maksimal 24 bulan'),
  note: z.string().trim().max(300, 'Catatan maksimal 300 karakter').optional(),
})

export const bookingListQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('Format ID tidak valid'),
})
