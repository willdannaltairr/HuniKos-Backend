import { query, withTransaction } from '../../config/db.js'
import { conflict, forbidden, notFound } from '../../utils/HttpError.js'
import { USER_COLUMNS } from '../auth/auth.service.js'
import { attachCoverImages } from '../properties/properties.service.js'
import { sumPlatformRevenueThisMonth } from '../payments/payments.service.js'
import type { AccountStatus, Role, UserRow, VerificationStatus } from '../../types/domain.js'

export interface AdminDashboard {
  total_users: number
  total_tenants: number
  total_owners: number
  total_properties: number
  pending_properties: number
  active_bookings: number
  platform_gross_revenue: number
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const { rows } = await query<Omit<AdminDashboard, 'platform_gross_revenue'>>(
    `SELECT
       (SELECT count(*)::int FROM users) AS total_users,
       (SELECT count(*)::int FROM users WHERE role = 'tenant') AS total_tenants,
       (SELECT count(*)::int FROM users WHERE role = 'owner') AS total_owners,
       (SELECT count(*)::int FROM properties) AS total_properties,
       (SELECT count(*)::int FROM properties WHERE verification_status = 'pending') AS pending_properties,
       (SELECT count(*)::int FROM bookings WHERE status = 'CONFIRMED') AS active_bookings`,
  )
  const revenue = await sumPlatformRevenueThisMonth()
  return { ...rows[0], platform_gross_revenue: Number(revenue.platform_gross_revenue) }
}

// Promo pemilik menjadikan fee pemilik 0; statusnya diubah admin per properti.
export async function setPropertyPromo(propertyId: string, isOwnerPromo: boolean) {
  const { rows } = await query<{ id: string; name: string; is_owner_promo: boolean }>(
    `UPDATE properties SET is_owner_promo = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, name, is_owner_promo`,
    [propertyId, isOwnerPromo],
  )
  const properti = rows[0]
  if (!properti) throw notFound('Properti tidak ditemukan')
  return properti
}

export interface UserListFilter {
  role?: Role
  account_status?: AccountStatus
  q?: string
  page: number
  limit: number
}

export async function listUsers(filters: UserListFilter): Promise<{ users: UserRow[]; total: number }> {
  const values: unknown[] = []
  const conditions: string[] = []

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

  const total = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM users ${where}`,
    values,
  )

  values.push(filters.limit, (filters.page - 1) * filters.limit)
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  return { users: rows, total: total.rows[0]?.total ?? 0 }
}

export async function changeUserStatus(userId: string, accountStatus: AccountStatus): Promise<UserRow> {
  const { rows } = await query<{ role: Role }>('SELECT role FROM users WHERE id = $1', [userId])
  const target = rows[0]
  if (!target) throw notFound('Pengguna tidak ditemukan')
  if (target.role === 'admin') throw forbidden('Akun admin tidak boleh diubah, termasuk akun sendiri')

  const updated = await query<UserRow>(
    `UPDATE users SET account_status = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, accountStatus],
  )
  return updated.rows[0] as UserRow
}

/** Baris daftar verifikasi: PropertyItem + info pemilik untuk admin. */
export interface ReviewPropertyItem {
  id: string
  name: string
  city: string
  address: string
  property_type: string
  verification_status: VerificationStatus
  rejection_note: string | null
  owner: { id: string; full_name: string }
  min_price: number | null
  available_rooms: number
  total_rooms: number
  cover_image_url: string | null
}

export async function listPropertiesForReview(status: VerificationStatus): Promise<ReviewPropertyItem[]> {
  const { rows } = await query<ReviewPropertyItem>(
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

export interface VerifyPropertyInput {
  action: 'approve' | 'reject'
  note?: string
}

export async function verifyProperty(propertyId: string, input: VerifyPropertyInput) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ verification_status: VerificationStatus }>(
      'SELECT verification_status FROM properties WHERE id = $1 FOR UPDATE',
      [propertyId],
    )
    const properti = rows[0]
    if (!properti) throw notFound('Properti tidak ditemukan')
    if (properti.verification_status === 'approved' && input.action === 'approve') {
      throw conflict('Properti sudah berstatus approved')
    }

    const target: VerificationStatus = input.action === 'approve' ? 'approved' : 'rejected'
    const updated = await client.query(
      `UPDATE properties
       SET verification_status = $2, rejection_note = $3, updated_at = now()
       WHERE id = $1
       RETURNING id, name, city, verification_status, rejection_note`,
      [propertyId, target, input.action === 'reject' ? input.note ?? null : null],
    )
    return updated.rows[0]
  })
}
