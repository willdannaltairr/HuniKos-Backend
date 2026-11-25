import { query } from '../../config/db.js'
import { assertRealImage } from '../../middlewares/upload.js'
import { deleteFile, saveFile } from '../../utils/storage.js'
import { USER_COLUMNS } from '../auth/auth.service.js'
import type { UserRow } from '../../types/domain.js'

export interface ProfileInput {
  full_name: string
  phone_number?: string
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `UPDATE users
     SET full_name = $2, phone_number = $3, updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, input.full_name, input.phone_number ?? null],
  )
  return rows[0] as UserRow
}

// Ambil public_id Cloudinary dari URL-nya, supaya avatar lama bisa dihapus.
// Contoh: https://res.cloudinary.com/x/image/upload/v123/hunikos/avatars/a.png -> hunikos/avatars/a
function publicIdFromUrl(url: string): string | null {
  const bagian = url.split('/upload/')[1]
  if (!bagian) return null
  const tanpaVersi = bagian.replace(/^v\d+\//, '')
  return tanpaVersi.replace(/\.[a-z0-9]+$/i, '')
}

export async function replaceAvatar(
  userId: string,
  file: Express.Multer.File,
): Promise<UserRow> {
  const detected = assertRealImage(file)

  const lama = await query<{ avatar_url: string | null }>(
    'SELECT avatar_url FROM users WHERE id = $1',
    [userId],
  )
  const saved = await saveFile(file.buffer, 'avatars', detected.ext)

  const { rows } = await query<UserRow>(
    `UPDATE users SET avatar_url = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, saved.url],
  )

  // Avatar lama baru dihapus setelah baris berhasil diperbarui.
  const oldUrl = lama.rows[0]?.avatar_url
  const oldKey = oldUrl ? publicIdFromUrl(oldUrl) : null
  if (oldKey) await deleteFile(oldKey)

  return rows[0] as UserRow
}
