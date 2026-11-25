import { query } from '../../config/db.js'
import { notFound } from '../../utils/HttpError.js'
import { listRoomsByProperty } from '../rooms/rooms.service.js'
import type { Role, VerificationStatus } from '../../types/domain.js'

// Kolom urutan yang diizinkan; nama kolom tidak boleh berasal dari input pengguna.
const SORT_SQL = {
  newest: 'p.created_at DESC',
  price_asc: 'min_price ASC NULLS LAST',
  price_desc: 'min_price DESC NULLS LAST',
} as const

export type PropertySort = keyof typeof SORT_SQL

export interface PropertyFilters {
  q?: string
  city?: string
  type?: string
  min_price?: number
  max_price?: number
  facility_ids: string[]
  available_only?: boolean
  sort: PropertySort
  page: number
  limit: number
}

export interface PropertyItem {
  id: string
  name: string
  city: string
  address: string
  property_type: string
  created_at: Date
  min_price: number | null
  available_rooms: number
  total_rooms: number
  cover_image_url: string | null
}

export type Viewer = { id: string; role: Role } | null

// Menyusun WHERE dan HAVING sekaligus agar dipakai bersama oleh query data dan query total.
function buildFilter(filters: PropertyFilters) {
  const values: unknown[] = []
  const where = ["p.verification_status = 'approved'"]
  const having: string[] = []

  if (filters.q) {
    values.push(`%${filters.q}%`)
    const n = values.length
    where.push(`(p.name ILIKE $${n} OR p.address ILIKE $${n} OR p.city ILIKE $${n})`)
  }
  if (filters.city) {
    values.push(`%${filters.city}%`)
    where.push(`p.city ILIKE $${values.length}`)
  }
  if (filters.type) {
    values.push(filters.type)
    where.push(`p.property_type = $${values.length}`)
  }
  if (filters.facility_ids.length > 0) {
    // Properti lolos bila ada satu kamar yang memiliki SEMUA fasilitas yang diminta.
    values.push(filters.facility_ids)
    values.push(filters.facility_ids.length)
    where.push(`p.id IN (
      SELECT r2.property_id FROM rooms r2
      JOIN room_facilities rf ON rf.room_id = r2.id
      WHERE rf.facility_id = ANY($${values.length - 1}::uuid[])
      GROUP BY r2.property_id, r2.id
      HAVING count(DISTINCT rf.facility_id) = $${values.length}
    )`)
  }

  if (filters.min_price !== undefined) {
    values.push(filters.min_price)
    having.push(`MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') >= $${values.length}`)
  }
  if (filters.max_price !== undefined) {
    values.push(filters.max_price)
    having.push(`MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') <= $${values.length}`)
  }
  if (filters.available_only) {
    having.push(`COUNT(*) FILTER (WHERE r.status = 'AVAILABLE') > 0`)
  }

  return { where, having, values }
}

export async function searchProperties(
  filters: PropertyFilters,
): Promise<{ items: PropertyItem[]; total: number }> {
  const { where, having, values } = buildFilter(filters)
  const whereSql = where.join(' AND ')
  const havingSql = having.length ? `HAVING ${having.join(' AND ')}` : ''

  // Query 1: jumlah seluruh hasil (sebelum LIMIT) untuk meta paginasi.
  const totalResult = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM (
       SELECT p.id FROM properties p
       LEFT JOIN rooms r ON r.property_id = p.id
       WHERE ${whereSql}
       GROUP BY p.id
       ${havingSql}
     ) hasil`,
    values,
  )

  // Query 2: satu halaman data.
  values.push(filters.limit, (filters.page - 1) * filters.limit)
  const { rows } = await query<PropertyItem>(
    `SELECT p.id, p.name, p.city, p.address, p.property_type, p.created_at,
            MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS min_price,
            COUNT(*) FILTER (WHERE r.status = 'AVAILABLE')::int AS available_rooms,
            COUNT(*) FILTER (WHERE r.status <> 'INACTIVE')::int AS total_rooms
     FROM properties p
     LEFT JOIN rooms r ON r.property_id = p.id
     WHERE ${whereSql}
     GROUP BY p.id
     ${havingSql}
     ORDER BY ${SORT_SQL[filters.sort]}
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  await attachCoverImages(rows, true)
  return { items: rows, total: totalResult.rows[0]?.total ?? 0 }
}

// Isi cover untuk banyak item sekaligus (satu query, bukan per baris).
// Cover = gambar is_cover, kalau tidak ada pakai gambar pertama.
export async function attachCoverImages<T extends { id: string; cover_image_url: string | null }>(
  items: T[],
  propertiSaja = false,
): Promise<T[]> {
  if (items.length === 0) return items

  const { rows } = await query<{ property_id: string; image_url: string; room_id: string | null }>(
    `SELECT property_id, image_url, room_id
     FROM property_images
     WHERE property_id = ANY($1::uuid[])
     ORDER BY property_id, is_cover DESC, created_at ASC`,
    [items.map((item) => item.id)],
  )

  const coverMap = new Map<string, string>()
  for (const gambar of rows) {
    if (propertiSaja && gambar.room_id !== null) continue
    if (!coverMap.has(gambar.property_id)) coverMap.set(gambar.property_id, gambar.image_url)
  }

  for (const item of items) item.cover_image_url = coverMap.get(item.id) ?? null
  return items
}

interface PropertyRow {
  id: string
  name: string
  description: string | null
  address: string
  city: string
  latitude: number | null
  longitude: number | null
  property_type: string
  rules: string | null
  verification_status: VerificationStatus
  rejection_note: string | null
  owner_id: string
  created_at: Date
  owner_name: string
  owner_phone: string | null
}

export async function findPropertyDetail(propertyId: string, viewer: Viewer = null) {
  const { rows } = await query<PropertyRow>(
    `SELECT p.id, p.name, p.description, p.address, p.city, p.latitude, p.longitude,
            p.property_type, p.rules, p.verification_status, p.rejection_note, p.owner_id,
            p.created_at, u.full_name AS owner_name, u.phone_number AS owner_phone
     FROM properties p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = $1`,
    [propertyId],
  )

  const properti = rows[0]
  if (!properti) throw notFound('Properti tidak ditemukan')

  const isOwner = viewer !== null && viewer.id === properti.owner_id
  const isAdmin = viewer?.role === 'admin'
  // Properti yang belum approved hanya terlihat oleh pemilik dan admin.
  if (properti.verification_status !== 'approved' && !isOwner && !isAdmin) {
    throw notFound('Properti tidak ditemukan')
  }

  const images = await query<{ id: string; image_url: string; room_id: string | null; is_cover: boolean }>(
    `SELECT id, image_url, room_id, is_cover
     FROM property_images WHERE property_id = $1
     ORDER BY is_cover DESC, created_at ASC`,
    [propertyId],
  )

  const rooms = await listRoomsByProperty(propertyId, isOwner || isAdmin)

  return {
    id: properti.id,
    name: properti.name,
    description: properti.description,
    address: properti.address,
    city: properti.city,
    latitude: properti.latitude,
    longitude: properti.longitude,
    property_type: properti.property_type,
    rules: properti.rules,
    verification_status: properti.verification_status,
    rejection_note: isOwner || isAdmin ? properti.rejection_note : null,
    owner: {
      id: properti.owner_id,
      full_name: properti.owner_name,
      phone_number: properti.owner_phone,
    },
    images: images.rows,
    rooms,
    created_at: properti.created_at,
  }
}
