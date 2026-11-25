import type { PoolClient } from 'pg'
import { query, withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { countActiveBookings } from '../../utils/bookingRules.js'
import { listRoomsByProperty } from '../rooms/rooms.service.js'
import type { RoomItem } from '../rooms/rooms.service.js'
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

async function assertOwnedRoom(client: PoolClient, roomId: string, ownerId: string) {
  const { rows } = await client.query<{ id: string; property_id: string; status: RoomStatus }>(
    `SELECT r.id, r.property_id, r.status FROM rooms r
     JOIN properties p ON p.id = r.property_id
     WHERE r.id = $1 AND p.owner_id = $2
     FOR UPDATE OF r`,
    [roomId, ownerId],
  )
  if (!rows[0]) throw notFound('Kamar tidak ditemukan')
  return rows[0]
}

// Ganti seluruh daftar fasilitas kamar dengan yang baru.
async function replaceFacilities(client: PoolClient, roomId: string, facilityIds?: string[]) {
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
      'INSERT INTO room_facilities (room_id, facility_id) VALUES ($1, $2)',
      [roomId, id],
    )
  }
}

export async function listOwnerRooms(ownerId: string, propertyId: string): Promise<RoomItem[]> {
  const { rows } = await query(
    'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
    [propertyId, ownerId],
  )
  if (!rows[0]) throw notFound('Properti tidak ditemukan')

  return listRoomsByProperty(propertyId, true)
}

export async function createRoom(
  ownerId: string,
  propertyId: string,
  input: RoomInput,
): Promise<string> {
  return withTransaction(async (client) => {
    const milikSendiri = await client.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [propertyId, ownerId],
    )
    if (!milikSendiri.rows[0]) throw notFound('Properti tidak ditemukan')

    const kembar = await client.query(
      'SELECT 1 FROM rooms WHERE property_id = $1 AND room_number = $2',
      [propertyId, input.room_number],
    )
    if ((kembar.rowCount ?? 0) > 0) throw conflict('Nomor kamar sudah dipakai pada properti ini')

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
    const sistemMengatur = room.status === 'RESERVED' || room.status === 'OCCUPIED'

    if (input.status && sistemMengatur) {
      // RESERVED/OCCUPIED hanya boleh diubah sistem.
      if (input.status !== 'AVAILABLE') {
        throw conflict(`Status kamar ${room.status} hanya boleh diubah sistem`)
      }
      const aktif = await countActiveBookings(client, roomId)
      if (aktif > 0) throw conflict('Kamar masih punya booking aktif')
    }

    const kembar = await client.query(
      'SELECT 1 FROM rooms WHERE property_id = $1 AND room_number = $2 AND id <> $3',
      [room.property_id, input.room_number, roomId],
    )
    if ((kembar.rowCount ?? 0) > 0) throw conflict('Nomor kamar sudah dipakai pada properti ini')

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

    const dipakai = await client.query('SELECT 1 FROM bookings WHERE room_id = $1 LIMIT 1', [roomId])
    if ((dipakai.rowCount ?? 0) > 0) {
      throw conflict('Kamar tidak bisa dihapus karena punya riwayat booking')
    }

    await client.query('DELETE FROM rooms WHERE id = $1', [roomId])
  })
}
