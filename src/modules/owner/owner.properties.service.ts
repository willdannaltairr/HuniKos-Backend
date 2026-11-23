import { query, withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { deleteFile, saveFile } from '../../utils/storage.js'
import { assertRealImage } from '../../middlewares/upload.js'
import { attachCoverImages } from '../properties/properties.service.js'
import type { VerificationStatus } from '../../types/domain.js'

const ITEM_AGGREGATES = `
  MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS min_price,
  COUNT(*) FILTER (WHERE r.status = 'AVAILABLE')::int AS available_rooms,
  COUNT(*) FILTER (WHERE r.status <> 'INACTIVE')::int AS total_rooms`

/** Bentuk PropertyItem untuk daftar milik pemilik, lengkap dengan field detail. */
export interface OwnerPropertyItem {
  id: string
  name: string
  city: string
  address: string
  property_type: string
  description: string | null
  rules: string | null
  latitude: number | null
  longitude: number | null
  verification_status: VerificationStatus
  rejection_note: string | null
  created_at: Date
  min_price: number | null
  available_rooms: number
  total_rooms: number
  cover_image_url: string | null
}

export interface PropertyInput {
  name: string
  address: string
  city: string
  property_type: string
  description?: string
  rules?: string
  latitude?: number
  longitude?: number
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
  created_at: Date
}

export async function listOwnerProperties(ownerId: string): Promise<OwnerPropertyItem[]> {
  const { rows } = await query<OwnerPropertyItem>(
    // Kolom detail ikut dikirim supaya form "Ubah properti" bisa mengisi ulang
    // nilai lama; tanpa ini, menyimpan form akan mengosongkan deskripsi dan aturan.
    `SELECT p.id, p.name, p.city, p.address, p.property_type,
            p.description, p.rules, p.latitude, p.longitude,
            p.verification_status, p.rejection_note, p.created_at, ${ITEM_AGGREGATES}
     FROM properties p
     LEFT JOIN rooms r ON r.property_id = p.id
     WHERE p.owner_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [ownerId],
  )
  return attachCoverImages(rows)
}

export async function createProperty(ownerId: string, input: PropertyInput): Promise<PropertyRow> {
  const { rows } = await query<PropertyRow>(
    `INSERT INTO properties
       (owner_id, name, description, address, city, latitude, longitude, property_type, rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      ownerId, input.name, input.description ?? null, input.address, input.city,
      input.latitude ?? null, input.longitude ?? null, input.property_type, input.rules ?? null,
    ],
  )
  return rows[0] as PropertyRow
}

// Properti yang sebelumnya ditolak kembali ke antrean verifikasi saat diperbaiki.
export async function updateProperty(
  ownerId: string,
  propertyId: string,
  input: PropertyInput,
): Promise<PropertyRow> {
  const { rows } = await query<PropertyRow>(
    `UPDATE properties
     SET name = $3, description = $4, address = $5, city = $6, latitude = $7, longitude = $8,
         property_type = $9, rules = $10, updated_at = now(),
         verification_status = CASE WHEN verification_status = 'rejected' THEN 'pending' ELSE verification_status END,
         rejection_note = CASE WHEN verification_status = 'rejected' THEN NULL ELSE rejection_note END
     WHERE id = $1 AND owner_id = $2
     RETURNING *`,
    [
      propertyId, ownerId, input.name, input.description ?? null, input.address, input.city,
      input.latitude ?? null, input.longitude ?? null, input.property_type, input.rules ?? null,
    ],
  )
  if (!rows[0]) throw notFound('Properti tidak ditemukan')
  return rows[0]
}

export async function deleteProperty(ownerId: string, propertyId: string): Promise<void> {
  await withTransaction(async (client) => {
    const owned = await client.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [propertyId, ownerId],
    )
    if (!owned.rows[0]) throw notFound('Properti tidak ditemukan')

    // Ditolak lebih awal agar pesannya jelas; database tetap menjaga lewat RESTRICT.
    const used = await client.query(
      `SELECT 1 FROM bookings b
       JOIN rooms r ON r.id = b.room_id
       WHERE r.property_id = $1 LIMIT 1`,
      [propertyId],
    )
    if ((used.rowCount ?? 0) > 0) {
      throw conflict('Properti tidak bisa dihapus karena kamarnya punya riwayat booking')
    }

    const images = await client.query<{ storage_key: string | null }>(
      'SELECT storage_key FROM property_images WHERE property_id = $1',
      [propertyId],
    )
    await client.query('DELETE FROM properties WHERE id = $1', [propertyId])

    for (const image of images.rows) {
      if (image.storage_key) await deleteFile(image.storage_key)
    }
  })
}

export interface PropertyImageRow {
  id: string
  image_url: string
  room_id: string | null
  is_cover: boolean
}

export async function addPropertyImages(
  ownerId: string,
  propertyId: string,
  files: Express.Multer.File[],
  roomId?: string,
): Promise<PropertyImageRow[]> {
  const detectedFiles = files.map((file) => ({ file, detected: assertRealImage(file) }))

  return withTransaction(async (client) => {
    const owned = await client.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [propertyId, ownerId],
    )
    if (!owned.rows[0]) throw notFound('Properti tidak ditemukan')

    if (roomId) {
      const room = await client.query(
        'SELECT 1 FROM rooms WHERE id = $1 AND property_id = $2',
        [roomId, propertyId],
      )
      if (!room.rows[0]) throw notFound('Kamar tidak ditemukan pada properti ini')
    }

    const coverExists = await client.query(
      `SELECT 1 FROM property_images WHERE property_id = $1 AND is_cover = true LIMIT 1`,
      [propertyId],
    )
    let needsCover = (coverExists.rowCount ?? 0) === 0

    const saved: PropertyImageRow[] = []
    for (const { file, detected } of detectedFiles) {
      if (!detected) throw notFound('Berkas gambar tidak valid')
      const stored = await saveFile(file, 'properties', detected.ext)
      const inserted = await client.query<PropertyImageRow>(
        `INSERT INTO property_images (property_id, room_id, image_url, storage_key, is_cover)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, image_url, room_id, is_cover`,
        [propertyId, roomId ?? null, stored.url, stored.key, needsCover],
      )
      needsCover = false
      if (inserted.rows[0]) saved.push(inserted.rows[0])
    }
    return saved
  })
}

interface OwnedImageRow {
  id: string
  property_id: string
  storage_key: string | null
}

async function findOwnedImage(
  client: import('pg').PoolClient,
  imageId: string,
  ownerId: string,
): Promise<OwnedImageRow | null> {
  const { rows } = await client.query<OwnedImageRow>(
    `SELECT i.id, i.property_id, i.storage_key
     FROM property_images i
     JOIN properties p ON p.id = i.property_id
     WHERE i.id = $1 AND p.owner_id = $2`,
    [imageId, ownerId],
  )
  return rows[0] ?? null
}

export async function deleteImage(ownerId: string, imageId: string): Promise<void> {
  await withTransaction(async (client) => {
    const image = await findOwnedImage(client, imageId, ownerId)
    if (!image) throw notFound('Gambar tidak ditemukan')

    await client.query('DELETE FROM property_images WHERE id = $1', [imageId])
    if (image.storage_key) await deleteFile(image.storage_key)
  })
}

export async function setCoverImage(
  ownerId: string,
  imageId: string,
): Promise<PropertyImageRow> {
  return withTransaction(async (client) => {
    const image = await findOwnedImage(client, imageId, ownerId)
    if (!image) throw notFound('Gambar tidak ditemukan')

    await client.query(
      `UPDATE property_images SET is_cover = false WHERE property_id = $1 AND id <> $2`,
      [image.property_id, imageId],
    )
    const { rows } = await client.query<PropertyImageRow>(
      'UPDATE property_images SET is_cover = true WHERE id = $1 RETURNING id, image_url, room_id, is_cover',
      [imageId],
    )
    return rows[0] as PropertyImageRow
  })
}
