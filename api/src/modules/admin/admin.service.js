import { query, withTransaction } from '../../config/db.js'
import { conflict, forbidden, notFound } from '../../utils/HttpError.js'
import { buildMeta } from '../../utils/response.js'
import { attachCoverImages } from '../properties/properties.service.js'

export async function getAdminDashboard() {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM users) AS total_users,
       (SELECT count(*)::int FROM users WHERE role = 'tenant') AS total_tenants,
       (SELECT count(*)::int FROM users WHERE role = 'owner') AS total_owners,
       (SELECT count(*)::int FROM properties) AS total_properties,
       (SELECT count(*)::int FROM properties WHERE verification_status = 'pending') AS pending_properties,
       (SELECT count(*)::int FROM bookings WHERE status = 'CONFIRMED') AS active_bookings`,
  )
  return rows[0]
}

export async function listUsers(filters) {
  const values = []
  const conditions = []

  if (filters.role) {
    values.push(filters.role)
    conditions.push(`role = $${values.length}`)
  }
  if (filters.account_status) {
    values.push(filters.account_status)
    conditions.push(`account_status = $${values.length}`)
  }
  if (filters.q) {
    values.push(`%${filters.q}%`)
    conditions.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = await query(`SELECT count(*)::int AS total FROM users ${where}`, values)

  values.push(filters.limit, (filters.page - 1) * filters.limit)
  const { rows } = await query(
    `SELECT id, full_name, email, phone_number, avatar_url, role, account_status, created_at
     FROM users ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  return { users: rows, meta: buildMeta(filters.page, filters.limit, total.rows[0].total) }
}

export async function changeUserStatus(userId, accountStatus) {
  const { rows } = await query('SELECT id, role FROM users WHERE id = $1', [userId])
  const target = rows[0]
  if (!target) throw notFound('Pengguna tidak ditemukan')
  if (target.role === 'admin') throw forbidden('Akun admin tidak boleh diubah, termasuk akun sendiri')

  const updated = await query(
    `UPDATE users SET account_status = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, full_name, email, phone_number, avatar_url, role, account_status, created_at`,
    [userId, accountStatus],
  )
  return updated.rows[0]
}

export async function listPropertiesForReview(status) {
  const { rows } = await query(
    `SELECT p.id, p.name, p.city, p.address, p.property_type, p.verification_status,
            p.rejection_note,
            json_build_object('id', u.id, 'full_name', u.full_name) AS owner,
            MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS min_price,
            COUNT(*) FILTER (WHERE r.status = 'AVAILABLE')::int AS available_rooms,
            COUNT(*) FILTER (WHERE r.status <> 'INACTIVE')::int AS total_rooms
     FROM properties p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN rooms r ON r.property_id = p.id
     WHERE p.verification_status = $1
     GROUP BY p.id, u.id
     ORDER BY p.created_at ASC`,
    [status],
  )
  return attachCoverImages(rows)
}

export async function verifyProperty(propertyId, input) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, verification_status FROM properties WHERE id = $1 FOR UPDATE',
      [propertyId],
    )
    if (!rows[0]) throw notFound('Properti tidak ditemukan')
    if (rows[0].verification_status === 'approved' && input.action === 'approve') {
      throw conflict('Properti sudah berstatus approved')
    }

    const target = input.action === 'approve' ? 'approved' : 'rejected'
    const updated = await client.query(
      `UPDATE properties
       SET verification_status = $2, rejection_note = $3, updated_at = now()
       WHERE id = $1
       RETURNING id, name, city, verification_status, rejection_note`,
      [propertyId, target, input.action === 'reject' ? input.note : null],
    )
    return updated.rows[0]
  })
}
