import { z } from 'zod'

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).optional()

export const propertySchema = z
  .object({
    name: z.string({ required_error: 'Nama properti wajib diisi' }).trim().min(3, 'Nama minimal 3 karakter').max(120, 'Nama maksimal 120 karakter'),
    address: z.string({ required_error: 'Alamat wajib diisi' }).trim().min(5, 'Alamat minimal 5 karakter').max(500, 'Alamat maksimal 500 karakter'),
    city: z.string({ required_error: 'Kota wajib diisi' }).trim().min(2, 'Kota minimal 2 karakter').max(80, 'Kota maksimal 80 karakter'),
    property_type: z.enum(['putra', 'putri', 'campur'], {
      errorMap: () => ({ message: 'Tipe properti harus putra, putri, atau campur' }),
    }),
    description: optionalText(2000, 'Deskripsi'),
    rules: optionalText(2000, 'Aturan'),
    latitude: z.coerce.number().min(-90, 'Latitude minimal -90').max(90, 'Latitude maksimal 90').optional(),
    longitude: z.coerce.number().min(-180, 'Longitude minimal -180').max(180, 'Longitude maksimal 180').optional(),
  })
  .refine(
    (value) => (value.latitude === undefined) === (value.longitude === undefined),
    { message: 'Latitude dan longitude harus diisi bersamaan', path: ['latitude'] },
  )

export const roomSchema = z.object({
  room_number: z.string({ required_error: 'Nomor kamar wajib diisi' }).trim().min(1, 'Nomor kamar wajib diisi').max(20, 'Nomor kamar maksimal 20 karakter'),
  room_type: z.string().trim().min(1, 'Tipe kamar wajib diisi').max(50, 'Tipe kamar maksimal 50 karakter').optional().default('standard'),
  dimensions: z.string().trim().max(20, 'Ukuran maksimal 20 karakter').optional(),
  monthly_price: z.coerce.number({ required_error: 'Harga wajib diisi' }).gt(0, 'Harga harus lebih dari 0').max(100000000, 'Harga maksimal 100.000.000'),
  max_occupants: z.coerce.number().int().min(1, 'Maksimal penghuni minimal 1').max(10, 'Maksimal penghuni maksimal 10').optional().default(1),
  bathroom_type: z.enum(['dalam', 'luar'], {
    errorMap: () => ({ message: 'Tipe kamar mandi harus dalam atau luar' }),
  }),
  floor_number: z.coerce.number().int().min(1, 'Lantai minimal 1').max(50, 'Lantai maksimal 50').optional().default(1),
  facility_ids: z.array(z.string().uuid('Format ID fasilitas tidak valid')).optional(),
})

export const roomUpdateSchema = roomSchema.extend({
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'INACTIVE'], {
    errorMap: () => ({ message: 'Status hanya boleh AVAILABLE, MAINTENANCE, atau INACTIVE' }),
  }).optional(),
})

export const decisionSchema = z
  .object({
    action: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'Aksi harus approve atau reject' }) }),
    owner_note: optionalText(300, 'Catatan'),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && (value.owner_note ?? '').trim().length < 3) {
      ctx.addIssue({ code: 'custom', path: ['owner_note'], message: 'Catatan wajib diisi minimal 3 karakter saat menolak' })
    }
  })

export const verifyPaymentSchema = z
  .object({
    action: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'Aksi harus approve atau reject' }) }),
    note: optionalText(300, 'Catatan'),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && (value.note ?? '').trim().length < 3) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Catatan wajib diisi minimal 3 karakter saat menolak' })
    }
  })

export const imageRoomSchema = z.object({
  room_id: z.string().uuid('Format ID kamar tidak valid').optional(),
})

// Rute gambar memakai nama parameter `imageId`, bukan `id`, jadi butuh skema sendiri.
export const imageIdParamSchema = z.object({
  imageId: z.string().uuid('Format ID gambar tidak valid'),
})

export { z }
