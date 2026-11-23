import { query } from '../../config/db.js'
import { notFound } from '../../utils/HttpError.js'
import type { RoomStatus, Role, VerificationStatus } from '../../types/domain.js'

export const ROOM_COLUMNS = `
  r.id, r.property_id, r.room_number, r.room_type, r.dimensions, r.monthly_price,
  r.max_occupants, r.bathroom_type, r.floor_number, r.status`

export interface RoomRow {
  id: string
  property_id: string
  room_number: string
  room_type: string
  dimensions: string | null
  monthly_price: number
  max_occupants: number
  bathroom_type: string
  floor_number: number
  status: RoomStatus
}

export interface RoomItem extends RoomRow {
  facilities: { id: string; name: string }[]
  cover_image_url: string | null
}

interface FacilityRow {
  room_id: string
  id: string
  name: string
}

interface RoomCoverRow {
  room_id: string
  image_url: string
}

// Mengambil fasilitas dan cover semua kamar dalam dua query, bukan satu query per kamar.
export async function decorateRooms(rows: RoomRow[]): Promise<RoomItem[]> {
  if (rows.length === 0) return []

  const roomIds = rows.map((row) => row.id)

  const facilities = await query<FacilityRow>(
    `SELECT rf.room_id, f.id, f.name
     FROM room_facilities rf
     JOIN facilities f ON f.id = rf.facility_id
     WHERE rf.room_id = ANY($1::uuid[])
     ORDER BY f.name ASC`,
    [roomIds],
  )

  const covers = await query<RoomCoverRow>(
    `SELECT DISTINCT ON (room_id) room_id, image_url
     FROM property_images
     WHERE room_id = ANY($1::uuid[])
     ORDER BY room_id, is_cover DESC, created_at ASC`,
    [roomIds],
  )

  const facilityMap = new Map<string, { id: string; name: string }[]>()
  for (const row of facilities.rows) {
    const list = facilityMap.get(row.room_id) ?? []
    list.push({ id: row.id, name: row.name })
    facilityMap.set(row.room_id, list)
  }

  const coverMap = new Map(covers.rows.map((row) => [row.room_id, row.image_url]))

  return rows.map((row) => ({
    ...row,
    facilities: facilityMap.get(row.id) ?? [],
    cover_image_url: coverMap.get(row.id) ?? null,
  }))
}

export async function listRoomsByProperty(
  propertyId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<RoomItem[]> {
  const { rows } = await query<RoomRow>(
    `SELECT ${ROOM_COLUMNS}
     FROM rooms r
     WHERE r.property_id = $1
       AND ($2::boolean OR r.status <> 'INACTIVE')
     ORDER BY r.floor_number ASC, r.room_number ASC`,
    [propertyId, includeInactive],
  )
  return decorateRooms(rows)
}

export type RoomViewer = { id: string; role: Role } | null

interface RoomDetailRow extends RoomRow {
  owner_property_id: string
  property_name: string
  city: string
  address: string
  owner_id: string
  verification_status: VerificationStatus
}

export async function findRoomDetail(roomId: string, viewer: RoomViewer = null) {
  const { rows } = await query<RoomDetailRow>(
    `SELECT ${ROOM_COLUMNS},
            p.id AS owner_property_id, p.name AS property_name, p.city, p.address,
            p.owner_id, p.verification_status
     FROM rooms r
     JOIN properties p ON p.id = r.property_id
     WHERE r.id = $1`,
    [roomId],
  )

  const room = rows[0]
  if (!room) throw notFound('Kamar tidak ditemukan')

  const isPrivileged = viewer !== null && (viewer.role === 'admin' || viewer.id === room.owner_id)
  if (room.verification_status !== 'approved' && !isPrivileged) {
    throw notFound('Kamar tidak ditemukan')
  }
  if (room.status === 'INACTIVE' && !isPrivileged) throw notFound('Kamar tidak ditemukan')

  const [decorated] = await decorateRooms([room])
  if (!decorated) throw notFound('Kamar tidak ditemukan')

  const images = await query<{ id: string; image_url: string; room_id: string | null; is_cover: boolean }>(
    `SELECT id, image_url, room_id, is_cover
     FROM property_images
     WHERE room_id = $1 OR (property_id = $2 AND room_id IS NULL)
     ORDER BY is_cover DESC, created_at ASC`,
    [roomId, room.property_id],
  )

  const ranges = await query<{ start_date: string; end_date: string }>(
    `SELECT start_date, end_date
     FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
     ORDER BY start_date ASC`,
    [roomId],
  )

  return {
    ...decorated,
    property: {
      id: room.property_id,
      name: room.property_name,
      city: room.city,
      address: room.address,
    },
    images: images.rows,
    unavailable_ranges: ranges.rows,
  }
}
