import { query } from '../../config/db.js'
import { notFound } from '../../utils/HttpError.js'
import { listRoomsByProperty } from '../rooms/rooms.service.js'

const SORT_SQL = {
  newest: 'f.created_at DESC',
  price_asc: 'f.min_price ASC NULLS LAST',
  price_desc: 'f.min_price DESC NULLS LAST',
}

function buildFilters(filters) {
  const values = []
  const conditions = ["p.verification_status = 'approved'"]

  if (filters.q) {
    values.push(`%${filters.q}%`)
    conditions.push(`(p.name ILIKE $${values.length} OR p.address ILIKE $${values.length} OR p.city ILIKE $${values.length})`)
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

export async function searchProperties(filters) {
  const { conditions, values } = buildFilters(filters)

  const having = []
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

  const { rows } = await query(sql, values)
  const total = rows[0]?.total_count ?? 0

  const items = rows.map(({ total_count: _ignored, ...item }) => item)
  await attachCoverImages(items, { propertyLevelOnly: true })

  return { items, total }
}

// Cover diambil sekali untuk semua properti, menggantikan query per baris.
export async function attachCoverImages(items, { propertyLevelOnly = false } = {}) {
  if (items.length === 0) return items

  const ids = items.map((item) => item.id)
  const { rows } = await query(
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

export async function findPropertyDetail(propertyId, viewer = null) {
  const { rows } = await query(
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

  const isOwner = viewer && viewer.id === property.owner_id
  const isAdmin = viewer?.role === 'admin'
  if (property.verification_status !== 'approved' && !isOwner && !isAdmin) {
    throw notFound('Properti tidak ditemukan')
  }

  const images = await query(
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
