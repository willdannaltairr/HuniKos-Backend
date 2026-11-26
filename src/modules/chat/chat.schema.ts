import { z } from 'zod'

// ID ruangan dipakai pada tiga rute, jadi satu skema agar aturannya seragam.
export const chatRoomIdSchema = z.object({
  id: z.string().uuid('Format ID ruangan tidak valid'),
})

export const chatMessageIdSchema = z.object({
  id: z.string().uuid('Format ID ruangan tidak valid'),
  messageId: z.string().uuid('Format ID pesan tidak valid'),
})

export const createDirectRoomSchema = z.object({
  property_id: z.string().uuid('Format ID properti tidak valid'),
})

// Pesan dipangkas dulu supaya spasi di ujung tidak ikut tersimpan.
export const sendMessageSchema = z.object({
  content: z
    .string({ required_error: 'Isi pesan wajib diisi' })
    .trim()
    .min(1, 'Isi pesan wajib diisi')
    .max(2000, 'Pesan maksimal 2000 karakter'),
})

// `before` dikirim klien sebagai ISO timestamp untuk mengambil pesan lebih lama.
// Harus benar-benar ISO: z.coerce.date() menerima angka sewenang-wenang, tetapi
// klien dan SQL memakai teks tanggal sebagai parameter.
const isoDate = z
  .string()
  .datetime({ offset: true, message: 'Format before harus ISO 8601' })
  .transform((value) => new Date(value))

export const listMessagesQuerySchema = z.object({
  before: isoDate.optional(),
  // Query datang sebagai teks; bilangan diubah agar LIMIT aman sebagai parameter.
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
})
