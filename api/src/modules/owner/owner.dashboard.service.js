import { query, withTransaction } from '../../config/db.js'
import { expireStaleBookings } from '../../utils/bookingRules.js'
import { sumRevenueThisMonth } from '../payments/payments.service.js'

// Semua hitungan memakai agregasi SQL, bukan loop di JavaScript.
export async function getOwnerDashboard(ownerId) {
  await withTransaction(async (client) => {
    await expireStaleBookings(client)
  })

  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM properties WHERE owner_id = $1) AS total_properties,
       (SELECT count(*)::int FROM properties WHERE owner_id = $1 AND verification_status = 'approved') AS approved_properties,
       (SELECT count(*)::int FROM rooms r JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1 AND r.status <> 'INACTIVE') AS total_rooms,
       (SELECT count(*)::int FROM rooms r JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1 AND r.status = 'AVAILABLE') AS available_rooms,
       (SELECT count(*)::int FROM rooms r JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1 AND r.status = 'OCCUPIED') AS occupied_rooms,
       (SELECT count(*)::int FROM bookings b
          JOIN rooms r ON r.id = b.room_id JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1 AND b.status = 'PENDING') AS pending_bookings,
       (SELECT count(*)::int FROM payments pay
          JOIN bookings b ON b.id = pay.booking_id
          JOIN rooms r ON r.id = b.room_id JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1 AND pay.status = 'PENDING') AS pending_payments,
       (SELECT count(*)::int FROM maintenance_requests m
          JOIN rooms r ON r.id = m.room_id JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1 AND m.status = 'OPEN') AS open_maintenance`,
    [ownerId],
  )

  const stats = rows[0]
  const revenue = await sumRevenueThisMonth(ownerId)
  const occupancy = stats.total_rooms === 0
    ? 0
    : Math.round((stats.occupied_rooms / stats.total_rooms) * 1000) / 10

  return {
    ...stats,
    revenue_this_month: Number(revenue),
    occupancy_rate: occupancy,
  }
}
