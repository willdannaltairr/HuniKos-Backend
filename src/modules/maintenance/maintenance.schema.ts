import { z } from 'zod'

export const createMaintenanceSchema = z.object({
  booking_id: z
    .string({ required_error: 'Booking wajib dipilih' })
    .uuid('Format ID booking tidak valid'),
  title: z
    .string({ required_error: 'Judul wajib diisi' })
    .trim()
    .min(3, 'Judul minimal 3 karakter')
    .max(120, 'Judul maksimal 120 karakter'),
  description: z
    .string({ required_error: 'Deskripsi wajib diisi' })
    .trim()
    .min(5, 'Deskripsi minimal 5 karakter')
    .max(1000, 'Deskripsi maksimal 1000 karakter'),
})

export const maintenanceStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE'], {
    errorMap: () => ({ message: 'Status harus OPEN, IN_PROGRESS, atau DONE' }),
  }),
  owner_note: z.string().trim().max(300, 'Catatan maksimal 300 karakter').optional(),
})
