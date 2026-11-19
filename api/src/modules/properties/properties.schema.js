import { z } from 'zod'

// Nilai query datang sebagai teks; angka dikonversi agar bisa dipakai sebagai parameter SQL.
const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : Number(value)))
  .refine((value) => value === undefined || Number.isFinite(value), 'Harus berupa angka')

export const propertyListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  type: z.enum(['putra', 'putri', 'campur']).optional(),
  min_price: optionalNumber,
  max_price: optionalNumber,
  facility_ids: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.split(',').map((id) => id.trim()).filter(Boolean) : [])),
  available_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

export const idParamSchema = z.object({
  id: z.string().uuid('Format ID tidak valid'),
})
