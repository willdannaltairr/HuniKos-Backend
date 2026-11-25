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

// Isi fasilitas dan cover semua kamar dengan dua query sekaligus, bukan per kamar.
export async function decorateRooms(rows: RoomRow[]): Promise<RoomItem[]> {
  if (rows.length === 0) return []
  const roomIds = rows.map((row) => row.id)

  const facilities = await query<{ room_id: string; id: string; name: string }>(
    `SELECT rf.room_id, f.id, f.name
     FROM room_facilities rf
     JOIN facilities f ON f.id = rf.facility_id
     WHERE rf.room_id = ANY($1::uuid[])
     ORDER BY f.name ASC`,
    [roomIds],
  )

  const images = await query<{ room_id: string; image_url: string }>(
    `SELECT room_id, image_url
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

  // Gambar pertama per kamar otomatis menjadi cover.
  const coverMap = new Map<string, string>()
  for (const gambar of images.rows) {
    if (!coverMap.has(gambar.room_id)) coverMap.set(gambar.room_id, gambar.image_url)
  }

  return rows.map((row) => ({
    ...row,
    facilities: facilityMap.get(row.id) ?? [],
    cover_image_url: coverMap.get(row.id) ?? null,
  }))
}

export async function listRoomsByProperty(
  propertyId: string,
  includeInactive = false,
): Promise<RoomItem[]> {
  const { rows } = await query<RoomRow>(
    `SELECT ${ROOM_COLUMNS}
     FROM rooms r
     WHERE r.property_id = $1 AND ($2::boolean OR r.status <> 'INACTIVE')
     ORDER BY r.floor_number ASC, r.room_number ASC`,
    [propertyId, includeInactive],
  )
  return decorateRooms(rows)
}

export type RoomViewer = { id: string; role: Role } | null

export async function findRoomDetail(roomId: string, viewer: RoomViewer = null) {
  const { rows } = await query<RoomRow & {
    owner_id: string
    property_name: string
    city: string
    address: string
    verification_status: VerificationStatus
  }>(
    `SELECT ${ROOM_COLUMNS},
            p.owner_id, p.name AS property_name, p.city, p.address, p.verification_status
     FROM rooms r
     JOIN properties p ON p.id = r.property_id
     WHERE r.id = $1`,
    [roomId],
  )

  const kamar = rows[0]
  if (!kamar) throw notFound('Kamar tidak ditemukan')

  const istimewa = viewer !== null && (viewer.role === 'admin' || viewer.id === kamar.owner_id)
  if (kamar.verification_status !== 'approved' && !istimewa) throw notFound('Kamar tidak ditemukan')
  if (kamar.status === 'INACTIVE' && !istimewa) throw notFound('Kamar tidak ditemukan')

  const [detail] = await decorateRooms([kamar])
  if (!detail) throw notFound('Kamar tidak ditemukan')

  const images = await query<{ id: string; image_url: string; room_id: string | null; is_cover: boolean }>(
    `SELECT id, image_url, room_id, is_cover
     FROM property_images
     WHERE room_id = $1 OR (property_id = $2 AND room_id IS NULL)
     ORDER BY is_cover DESC, created_at ASC`,
    [roomId, kamar.property_id],
  )

  // Periode yang sudah dipesan, tanpa data penyewa.
  const ranges = await query<{ start_date: string; end_date: string }>(
    `SELECT start_date, end_date FROM bookings
     WHERE room_id = $1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')
     ORDER BY start_date ASC`,
    [roomId],
  )

  return {
    ...detail,
    property: {
      id: kamar.property_id,
      name: kamar.property_name,
      city: kamar.city,
      address: kamar.address,
    },
    images: images.rows,
    unavailable_ranges: ranges.rows,
  }
}
