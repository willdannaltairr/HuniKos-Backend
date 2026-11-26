import { z } from 'zod'

export const userListQuerySchema = z.object({
  role: z.enum(['tenant', 'owner', 'admin']).optional(),
  account_status: z.enum(['active', 'suspended']).optional(),
  q: z.string().trim().max(120, 'Pencarian maksimal 120 karakter').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export const accountStatusSchema = z.object({
  account_status: z.enum(['active', 'suspended'], {
    errorMap: () => ({ message: 'Status akun harus active atau suspended' }),
  }),
})

export const promoSchema = z.object({
  is_owner_promo: z.boolean(),
})

export const propertyReviewQuerySchema = z.object({
  verification_status: z
    .enum(['pending', 'approved', 'rejected'], {
      errorMap: () => ({ message: 'Status verifikasi harus pending, approved, atau rejected' }),
    })
    .default('pending'),
})

// Penolakan wajib beralasan supaya pemilik tahu apa yang harus diperbaiki.
export const verificationSchema = z
  .object({
    action: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'Aksi harus approve atau reject' }) }),
    note: z.string().trim().max(300, 'Catatan maksimal 300 karakter').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && (value.note ?? '').trim().length < 3) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Catatan wajib diisi minimal 3 karakter saat menolak' })
    }
  })
