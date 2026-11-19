import { z } from 'zod'

const email = z
  .string({ required_error: 'Email wajib diisi' })
  .trim()
  .toLowerCase()
  .max(150, 'Email maksimal 150 karakter')
  .email('Format email tidak valid')

const password = z
  .string({ required_error: 'Password wajib diisi' })
  .min(8, 'Password minimal 8 karakter')
  .max(72, 'Password maksimal 72 karakter')
  .regex(/[A-Za-z]/, 'Password minimal mengandung 1 huruf')
  .regex(/[0-9]/, 'Password minimal mengandung 1 angka')

const phoneNumber = z
  .string()
  .trim()
  .regex(/^[0-9+]{8,20}$/, 'Nomor telepon hanya boleh angka dan tanda plus, 8-20 karakter')
  .optional()

export const registerSchema = z.object({
  full_name: z
    .string({ required_error: 'Nama lengkap wajib diisi' })
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(100, 'Nama lengkap maksimal 100 karakter'),
  email,
  password,
  phone_number: phoneNumber,
  role: z.enum(['tenant', 'owner'], {
    errorMap: () => ({ message: 'Role hanya boleh tenant atau owner' }),
  }),
})

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
})

export const updateProfileSchema = z.object({
  full_name: z
    .string({ required_error: 'Nama lengkap wajib diisi' })
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(100, 'Nama lengkap maksimal 100 karakter'),
  phone_number: z
    .union([phoneNumber, z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' || value === null ? undefined : value)),
})
