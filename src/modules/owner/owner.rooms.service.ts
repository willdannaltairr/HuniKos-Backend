import { withTransaction } from '../../config/db.js'
import type { PoolClient } from 'pg'
import { conflict, notFound } from '../../utils/HttpError.js'
import { countActiveBookings, syncRoomStatus } from '../../utils/bookingRules.js'
import { listRoomsByProperty } from '../rooms/rooms.service.js'
import type { RoomItem, RoomRow } from '../rooms/rooms.service.js'
import type { RoomStatus } from '../../types/domain.js'

export interface RoomInput {
  room_number: string
  room_type: string
  dimensions?: string
  monthly_price: number
  max_occupants: number
  bathroom_type: string
  floor_number: number
  facility_ids?: string[]
  status?: RoomStatus
}

async function assertOwnedRoom(
  client: PoolClient,
  roomId: string,
  ownerId: string,
): Promise<RoomRow> {
  const { rows } = await client.query<RoomRow>(
    `SELECT r.* FROM rooms r
     JOIN properties p ON p.id = r.property_id
     WHERE r.id = $1 AND p.owner_id = $2
     FOR UPDATE OF r`,
    [roomId, ownerId],
  )
  if (!rows[0]) throw notFound('Kamar tidak ditemukan')
  return rows[0]
}

async function replaceFacilities(
  client: PoolClient,
  roomId: string,
  facilityIds?: string[],
): Promise<void> {
  await client.query('DELETE FROM room_facilities WHERE room_id = $1', [roomId])
  if (!facilityIds?.length) return

  const valid = await client.query<{ id: string }>(
    'SELECT id FROM facilities WHERE id = ANY($1::uuid[])',
    [facilityIds],
  )
  if ((valid.rowCount ?? 0) !== new Set(facilityIds).size) {
    throw notFound('Ada fasilitas yang tidak ditemukan')
  }

  for (const { id } of valid.rows) {
    await client.query(
      'INSERT INTO room_facilities (room_id, facility_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [roomId, id],
    )
  }
}

export async function listOwnerRooms(ownerId: string, propertyId: string): Promise<RoomItem[]> {
  const owned = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [propertyId, ownerId],
    )
    return rows[0]
  })
  if (!owned) throw notFound('Properti tidak ditemukan')

  return listRoomsByProperty(propertyId, { includeInactive: true })
}

export async function createRoom(
  ownerId: string,
  propertyId: string,
  input: RoomInput,
): Promise<string> {
  return withTransaction(async (client) => {
    const owned = await client.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [propertyId, ownerId],
    )
    if (!owned.rows[0]) throw notFound('Properti tidak ditemukan')

    const duplicate = await client.query(
      'SELECT 1 FROM rooms WHERE property_id = $1 AND room_number = $2',
      [propertyId, input.room_number],
    )
    if ((duplicate.rowCount ?? 0) > 0) throw conflict('Nomor kamar sudah dipakai pada properti ini')

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO rooms
         (property_id, room_number, room_type, dimensions, monthly_price, max_occupants,
          bathroom_type, floor_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        propertyId, input.room_number, input.room_type, input.dimensions ?? null,
        input.monthly_price, input.max_occupants, input.bathroom_type, input.floor_number,
      ],
    )
    const roomId = rows[0]?.id as string
    await replaceFacilities(client, roomId, input.facility_ids)
    return roomId
  })
}

export async function updateRoom(
  ownerId: string,
  roomId: string,
  input: RoomInput,
): Promise<string> {
  return withTransaction(async (client) => {
    const room = await assertOwnedRoom(client, roomId, ownerId)

    if (input.status) {
      // RESERVED/OCCUPIED hanya boleh diubah sistem.
      if (['RESERVED', 'OCCUPIED'].includes(room.status) && input.status !== 'AVAILABLE') {
        throw conflict(`Status kamar ${room.status} hanya boleh diubah sistem`)
      }
      if (['RESERVED', 'OCCUPIED'].includes(room.status)) {
        const active = await countActiveBookings(client, roomId)
        if (active > 0) throw conflict('Kamar masih punya booking aktif')
      }
    }

    const duplicate = await client.query(
      'SELECT 1 FROM rooms WHERE property_id = $1 AND room_number = $2 AND id <> $3',
      [room.property_id, input.room_number, roomId],
    )
    if ((duplicate.rowCount ?? 0) > 0) throw conflict('Nomor kamar sudah dipakai pada properti ini')

    await client.query(
      `UPDATE rooms
       SET room_number = $2, room_type = $3, dimensions = $4, monthly_price = $5,
           max_occupants = $6, bathroom_type = $7, floor_number = $8,
           status = coalesce($9, status), updated_at = now()
       WHERE id = $1`,
      [
        roomId, input.room_number, input.room_type, input.dimensions ?? null,
        input.monthly_price, input.max_occupants, input.bathroom_type, input.floor_number,
        input.status ?? null,
      ],
    )
    await replaceFacilities(client, roomId, input.facility_ids)
    return roomId
  })
}

export async function deleteRoom(ownerId: string, roomId: string): Promise<void> {
  await withTransaction(async (client) => {
    await assertOwnedRoom(client, roomId, ownerId)

    const used = await client.query('SELECT 1 FROM bookings WHERE room_id = $1 LIMIT 1', [roomId])
    if ((used.rowCount ?? 0) > 0) {
      throw conflict('Kamar tidak bisa dihapus karena punya riwayat booking')
    }

    await client.query('DELETE FROM rooms WHERE id = $1', [roomId])
  })
}

export { syncRoomStatus }
