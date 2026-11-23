import { query } from '../../config/db.js'
import { notFound } from '../../utils/HttpError.js'
import { listRoomsByProperty } from '../rooms/rooms.service.js'
import type { Role, VerificationStatus } from '../../types/domain.js'

const SORT_SQL = {
  newest: 'f.created_at DESC',
  price_asc: 'f.min_price ASC NULLS LAST',
  price_desc: 'f.min_price DESC NULLS LAST',
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

/** Bentuk PropertyItem pada kontrak bagian 8. */
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

/** Penonton detail: null berarti tamu. */
export type Viewer = { id: string; role: Role } | null

function buildFilters(filters: PropertyFilters): { conditions: string[]; values: unknown[] } {
  const values: unknown[] = []
  const conditions = ["p.verification_status = 'approved'"]

  if (filters.q) {
    values.push(`%${filters.q}%`)
    conditions.push(
      `(p.name ILIKE $${values.length} OR p.address ILIKE $${values.length} OR p.city ILIKE $${values.length})`,
    )
  }
  if (filters.city) {
    values.push(`%${filters.city}%`)
    conditions.push(`p.city ILIKE $${values.length}`)
  }
  if (filters.type) {
    values.push(filters.type)
    conditions.push(`p.property_type = $${values.length}`)
  }
  if (filters.facility_ids.length > 0) {
    values.push(filters.facility_ids)
    const index = values.length
    // Properti lolos bila minimal satu kamarnya memiliki SEMUA fasilitas yang diminta.
    conditions.push(`EXISTS (
      SELECT 1 FROM rooms er
      WHERE er.property_id = p.id
        AND (SELECT count(DISTINCT rf.facility_id) FROM room_facilities rf
             WHERE rf.room_id = er.id AND rf.facility_id = ANY($${index}::uuid[]))
            = cardinality($${index}::uuid[])
    )`)
  }

  return { conditions, values }
}

export async function searchProperties(
  filters: PropertyFilters,
): Promise<{ items: PropertyItem[]; total: number }> {
  const { conditions, values } = buildFilters(filters)

  const having: string[] = []
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

  const limitIndex = values.push(filters.limit)
  const offsetIndex = values.push((filters.page - 1) * filters.limit)

  const sql = `
    WITH filtered AS (
      SELECT p.id, p.name, p.city, p.address, p.property_type, p.created_at,
             MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS min_price,
             COUNT(*) FILTER (WHERE r.status = 'AVAILABLE')::int AS available_rooms,
             COUNT(*) FILTER (WHERE r.status <> 'INACTIVE')::int AS total_rooms
      FROM properties p
      LEFT JOIN rooms r ON r.property_id = p.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY p.id
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
    )
    SELECT f.*, count(*) OVER()::int AS total_count
    FROM filtered f
    ORDER BY ${SORT_SQL[filters.sort]}
    LIMIT $${limitIndex} OFFSET $${offsetIndex}`

  type Row = PropertyItem & { total_count: number }
  const { rows } = await query<Row>(sql, values)
  const total = rows[0]?.total_count ?? 0

  const items: PropertyItem[] = rows.map(({ total_count: _ignored, ...item }) => item)
  await attachCoverImages(items, { propertyLevelOnly: true })

  return { items, total }
}

interface CoverRow {
  property_id: string
  image_url: string
}

// Cover diambil sekali untuk semua properti, menggantikan query per baris.
export async function attachCoverImages<T extends { id: string; cover_image_url?: string | null }>(
  items: T[],
  { propertyLevelOnly = false }: { propertyLevelOnly?: boolean } = {},
): Promise<T[]> {
  if (items.length === 0) return items

  const ids = items.map((item) => item.id)
  const { rows } = await query<CoverRow>(
    `SELECT DISTINCT ON (property_id) property_id, image_url
     FROM property_images
     WHERE property_id = ANY($1::uuid[])
       AND ($2::boolean = false OR room_id IS NULL)
     ORDER BY property_id, is_cover DESC, created_at ASC`,
    [ids, propertyLevelOnly],
  )
  const coverMap = new Map(rows.map((row) => [row.property_id, row.image_url]))

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
  updated_at: Date
  owner_user_id: string
  owner_name: string
  owner_phone: string | null
}

interface ImageRow {
  id: string
  image_url: string
  room_id: string | null
  is_cover: boolean
}

export async function findPropertyDetail(propertyId: string, viewer: Viewer = null) {
  const { rows } = await query<PropertyRow>(
    `SELECT p.id, p.name, p.description, p.address, p.city, p.latitude, p.longitude,
            p.property_type, p.rules, p.verification_status, p.rejection_note, p.owner_id,
            p.created_at, p.updated_at,
            u.id AS owner_user_id, u.full_name AS owner_name, u.phone_number AS owner_phone
     FROM properties p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = $1`,
    [propertyId],
  )

  const property = rows[0]
  if (!property) throw notFound('Properti tidak ditemukan')

  const isOwner = viewer !== null && viewer.id === property.owner_id
  const isAdmin = viewer?.role === 'admin'
  if (property.verification_status !== 'approved' && !isOwner && !isAdmin) {
    throw notFound('Properti tidak ditemukan')
  }

  const images = await query<ImageRow>(
    `SELECT id, image_url, room_id, is_cover
     FROM property_images WHERE property_id = $1
     ORDER BY is_cover DESC, created_at ASC`,
    [propertyId],
  )

  const rooms = await listRoomsByProperty(propertyId, { includeInactive: isOwner || isAdmin })

  return {
    id: property.id,
    name: property.name,
    description: property.description,
    address: property.address,
    city: property.city,
    latitude: property.latitude,
    longitude: property.longitude,
    property_type: property.property_type,
    rules: property.rules,
    verification_status: property.verification_status,
    // Catatan penolakan hanya untuk pemilik dan admin.
    rejection_note: isOwner || isAdmin ? property.rejection_note : null,
    owner: {
      id: property.owner_user_id,
      full_name: property.owner_name,
      phone_number: property.owner_phone,
    },
    images: images.rows,
    rooms,
    created_at: property.created_at,
  }
}
