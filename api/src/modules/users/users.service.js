import { query } from '../../config/db.js'
import { assertRealImage } from '../../middlewares/upload.js'
import { deleteFile, saveFile } from '../../utils/storage.js'
import { USER_COLUMNS } from '../auth/auth.service.js'

export async function updateProfile(userId, { full_name, phone_number }) {
  const { rows } = await query(
    `UPDATE users
     SET full_name = $2, phone_number = $3, updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, full_name, phone_number ?? null],
  )
  return rows[0]
}

export async function replaceAvatar(userId, file) {
  const detected = assertRealImage(file)

  const current = await query('SELECT avatar_url FROM users WHERE id = $1', [userId])
  const saved = await saveFile(file, 'avatars', detected.ext)

  const { rows } = await query(
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

  return rows[0]
}
