import { z } from 'zod'
import { withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/HttpError.js'
import { assertRealImage } from '../../middlewares/upload.js'
import { saveFile } from '../../utils/storage.js'
import { expireStaleBookings } from '../../utils/bookingRules.js'

export const createMaintenanceSchema = z.object({
  booking_id: z.string({ required_error: 'Booking wajib dipilih' }).uuid('Format ID booking tidak valid'),
  title: z
    .string({ required_error: 'Judul wajib diisi' })
    .trim()
    .min(3, 'Judul minimal 3 karakter')
    .max(120, 'Judul maksimal 120 karakter'),
  description: z
    .string({ required_error: 'Deskripsi wajib diisi' })
    .trim()
    .min(5, 'Deskripsi minimal 5 karakter')
    .max(1000, 'Deskripsi maksimal 1000 karakter'),
})

export const maintenanceStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE'], {
    errorMap: () => ({ message: 'Status harus OPEN, IN_PROGRESS, atau DONE' }),
  }),
  owner_note: z.string().trim().max(300, 'Catatan maksimal 300 karakter').optional(),
})

const MAINTENANCE_SELECT = `
  SELECT m.id, m.booking_id, m.room_id, m.title, m.description, m.photo_url, m.status,
         m.owner_note, m.created_at, m.updated_at,
         r.room_number, p.name AS property_name, u.full_name AS tenant_name
  FROM maintenance_requests m
  JOIN rooms r ON r.id = m.room_id
  JOIN properties p ON p.id = r.property_id
  JOIN users u ON u.id = m.tenant_id`

export async function listTenantMaintenance(tenantId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `${MAINTENANCE_SELECT} WHERE m.tenant_id = $1 ORDER BY m.created_at DESC`,
      [tenantId],
    )
    return rows
  })
}

export async function listOwnerMaintenance(ownerId, status) {
  return withTransaction(async (client) => {
    const values = [ownerId]
    let filter = 'p.owner_id = $1'
    if (status) {
      values.push(status)
      filter += ` AND m.status = $${values.length}`
    }
    const { rows } = await client.query(
      `${MAINTENANCE_SELECT} WHERE ${filter} ORDER BY m.created_at DESC`,
      values,
    )
    return rows
  })
}

export async function createMaintenance(tenantId, input, file) {
  const detected = file ? assertRealImage(file) : null

  return withTransaction(async (client) => {
    await expireStaleBookings(client)

    const { rows } = await client.query(
      `SELECT b.id, b.room_id, b.status FROM bookings b
       WHERE b.id = $1 AND b.tenant_id = $2`,
      [input.booking_id, tenantId],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking tidak ditemukan')
    if (booking.status !== 'CONFIRMED') {
      throw conflict(`Laporan hanya bisa dibuat dari booking CONFIRMED, status sekarang ${booking.status}`)
    }

    const saved = detected ? await saveFile(file, 'maintenance', detected.ext) : null

    const inserted = await client.query(
      `INSERT INTO maintenance_requests
         (booking_id, room_id, tenant_id, title, description, photo_url, storage_key, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
       RETURNING id`,
      [
        booking.id, booking.room_id, tenantId, input.title, input.description,
        saved?.url ?? null, saved?.key ?? null,
      ],
    )

    const { rows: created } = await client.query(
      `${MAINTENANCE_SELECT} WHERE m.id = $1`,
      [inserted.rows[0].id],
    )
    return created[0]
  })
}

export async function updateMaintenanceStatus(ownerId, maintenanceId, input) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT m.id FROM maintenance_requests m
       JOIN rooms r ON r.id = m.room_id
       JOIN properties p ON p.id = r.property_id
       WHERE m.id = $1 AND p.owner_id = $2`,
      [maintenanceId, ownerId],
    )
    if (!rows[0]) throw notFound('Laporan tidak ditemukan')

    await client.query(
      `UPDATE maintenance_requests
       SET status = $2, owner_note = $3, updated_at = now()
       WHERE id = $1`,
      [maintenanceId, input.status, input.owner_note ?? null],
    )

    const { rows: updated } = await client.query(
      `${MAINTENANCE_SELECT} WHERE m.id = $1`,
      [maintenanceId],
    )
    return updated[0]
  })
}
