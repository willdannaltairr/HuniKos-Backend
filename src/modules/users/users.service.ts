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

export async function replaceAvatar(
  userId: string,
  file: Express.Multer.File,
): Promise<UserRow> {
  // Deteksi magic bytes; null berarti isinya bukan gambar yang diizinkan.
  const detected = assertRealImage(file)
  if (!detected) throw new Error('File avatar kosong')

  const current = await query<{ avatar_url: string | null }>(
    'SELECT avatar_url FROM users WHERE id = $1',
    [userId],
  )
  const saved = await saveFile(file, 'avatars', detected.ext)

  const { rows } = await query<UserRow>(
    `UPDATE users SET avatar_url = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, saved.url],
  )

  // Avatar lama dihapus setelah baris berhasil diperbarui.
  const oldUrl = current.rows[0]?.avatar_url
  if (oldUrl) {
    const oldKey = oldUrl.split('/uploads/')[1]
    if (oldKey) await deleteFile(oldKey)
  }

  return rows[0] as UserRow
}
