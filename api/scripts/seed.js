// Mengisi data contoh HUNIKOS. Aman dijalankan berulang kali (idempotent):
// setiap tabel diperiksa dulu sebelum insert, dan semua insert memakai ON CONFLICT DO NOTHING.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  ssl: process.env.DB_CA_CERT
    ? { ca: process.env.DB_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true }
    : false,
})

const hash = (password) => bcrypt.hash(password, 10)

// Tanggal contoh dihitung dari hari ini supaya tampilan selalu relevan.
const addDays = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const addHours = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString()

async function findOrCreateUser(client, user, password) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [user.email])
  if (existing.rowCount > 0) return existing.rows[0].id

  const { rows } = await client.query(
    `INSERT INTO users (full_name, email, password_hash, phone_number, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [user.full_name, user.email, await hash(password), user.phone_number, user.role],
  )
  if (rows.length > 0) return rows[0].id

  const again = await client.query('SELECT id FROM users WHERE email = $1', [user.email])
  return again.rows[0].id
}

async function findOrCreateProperty(client, property, ownerId) {
  const existing = await client.query(
    'SELECT id FROM properties WHERE owner_id = $1 AND name = $2',
    [ownerId, property.name],
  )
  if (existing.rowCount > 0) return existing.rows[0].id

  const { rows } = await client.query(
    `INSERT INTO properties
       (owner_id, name, description, address, city, latitude, longitude,
        property_type, rules, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      ownerId, property.name, property.description, property.address, property.city,
      property.latitude, property.longitude, property.property_type, property.rules,
      property.verification_status,
    ],
  )
  return rows[0].id
}

async function findOrCreateRoom(client, room, propertyId, facilityIds) {
  const existing = await client.query(
    'SELECT id FROM rooms WHERE property_id = $1 AND room_number = $2',
    [propertyId, room.room_number],
  )
  if (existing.rowCount > 0) return existing.rows[0].id

  const { rows } = await client.query(
    `INSERT INTO rooms
       (property_id, room_number, room_type, dimensions, monthly_price, max_occupants,
        bathroom_type, floor_number, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      propertyId, room.room_number, room.room_type, room.dimensions, room.monthly_price,
      room.max_occupants, room.bathroom_type, room.floor_number, room.status ?? 'AVAILABLE',
    ],
  )
  const roomId = rows[0].id

  for (const facilityId of facilityIds) {
    await client.query(
      `INSERT INTO room_facilities (room_id, facility_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roomId, facilityId],
    )
  }
  return roomId
}

async function findOrCreateBooking(client, booking, tenantId, roomId, roomPrice) {
  const existing = await client.query(
    'SELECT id FROM bookings WHERE tenant_id = $1 AND room_id = $2 AND start_date = $3',
    [tenantId, roomId, booking.start_date],
  )
  if (existing.rowCount > 0) return existing.rows[0].id

  const { rows } = await client.query(
    `INSERT INTO bookings
       (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
        rental_price_snapshot, total_amount, status, note, expires_at)
     VALUES ($1, $2, $3, $4::date,
             $5::smallint,
             ($4::date + make_interval(months => $5::int))::date,
             $6::numeric, $6::numeric * $5::int, $7, $8, $9)
     RETURNING id`,
    [
      booking.booking_code, tenantId, roomId, booking.start_date, booking.duration_months,
      roomPrice, booking.status, booking.note ?? null, booking.expires_at ?? null,
    ],
  )
  const bookingId = rows[0].id

  await client.query(
    `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
     VALUES ($1, NULL, $2, $3, $4)`,
    [bookingId, booking.status, tenantId, 'Data contoh seed'],
  )
  return bookingId
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const facilityIds = {}
    const facilityRows = await client.query('SELECT id, name FROM facilities')
    for (const row of facilityRows.rows) facilityIds[row.name] = row.id

    if (Object.keys(facilityIds).length === 0) {
      throw new Error('Tabel facilities kosong. Jalankan migration lebih dulu.')
    }

    const adminId = await findOrCreateUser(client, {
      full_name: 'Admin HUNIKOS',
      email: 'admin@hunikos.test',
      phone_number: '+6281200000001',
      role: 'admin',
    }, 'Admin123!')

    const owner1 = await findOrCreateUser(client, {
      full_name: 'Budi Santoso',
      email: 'owner1@hunikos.test',
      phone_number: '+6281200000002',
      role: 'owner',
    }, 'Owner123!')

    const owner2 = await findOrCreateUser(client, {
      full_name: 'Siti Rahayu',
      email: 'owner2@hunikos.test',
      phone_number: '+6281200000003',
      role: 'owner',
    }, 'Owner123!')

    const tenant1 = await findOrCreateUser(client, {
      full_name: 'Andi Pratama',
      email: 'tenant1@hunikos.test',
      phone_number: '+6281200000004',
      role: 'tenant',
    }, 'Tenant123!')

    const tenant2 = await findOrCreateUser(client, {
      full_name: 'Dewi Lestari',
      email: 'tenant2@hunikos.test',
      phone_number: '+6281200000005',
      role: 'tenant',
    }, 'Tenant123!')

    const tenant3 = await findOrCreateUser(client, {
      full_name: 'Rizky Maulana',
      email: 'tenant3@hunikos.test',
      phone_number: '+6281200000006',
      role: 'tenant',
    }, 'Tenant123!')

    // Properti milik owner1 dan owner2.
    const kosMelati = await findOrCreateProperty(client, {
      name: 'Kos Melati',
      description: 'Kos putri dekat kampus dengan lingkungan tenang dan parkir luas.',
      address: 'Jl. Kaliurang KM 5 No. 21, Sleman',
      city: 'Yogyakarta',
      latitude: -7.715600,
      longitude: 110.374800,
      property_type: 'putri',
      rules: 'Jam malam pukul 23.00. Tamu hanya boleh di ruang tamu.',
      verification_status: 'approved',
    }, owner1)

    const kosMawar = await findOrCreateProperty(client, {
      name: 'Kos Mawar',
      description: 'Kos campur dengan dapur bersama dan Wi-Fi cepat.',
      address: 'Jl. Diponegoro No. 88, Bandung Wetan',
      city: 'Bandung',
      latitude: -6.891500,
      longitude: 107.610700,
      property_type: 'campur',
      rules: 'Dilarang merokok di dalam kamar.',
      verification_status: 'approved',
    }, owner2)

    const kosAnggrek = await findOrCreateProperty(client, {
      name: 'Kos Anggrek',
      description: 'Kos putra sedang dalam proses verifikasi.',
      address: 'Jl. Ahmad Yani No. 12, Gubeng',
      city: 'Surabaya',
      latitude: -7.265000,
      longitude: 112.744000,
      property_type: 'putra',
      rules: 'Hanya untuk mahasiswa aktif.',
      verification_status: 'pending',
    }, owner1)

    const facilitiesKosMelati = [
      facilityIds['Kasur'], facilityIds['Lemari'], facilityIds['Meja Belajar'],
      facilityIds['Wi-Fi'], facilityIds['Kamar Mandi Dalam'],
    ]
    const facilitiesKosMawar = [
      facilityIds['Kasur'], facilityIds['Kipas Angin'], facilityIds['Wi-Fi'],
      facilityIds['Dapur Bersama'], facilityIds['Parkir Motor'],
    ]

    const room101 = await findOrCreateRoom(client, {
      room_number: '101', room_type: 'standard', dimensions: '3x4 m',
      monthly_price: 750000, max_occupants: 1, bathroom_type: 'dalam',
      floor_number: 1, status: 'AVAILABLE',
    }, kosMelati, facilitiesKosMelati)

    const room102 = await findOrCreateRoom(client, {
      room_number: '102', room_type: 'deluxe', dimensions: '4x4 m',
      monthly_price: 950000, max_occupants: 2, bathroom_type: 'dalam',
      floor_number: 1, status: 'RESERVED',
    }, kosMelati, [...facilitiesKosMelati, facilityIds['AC']])

    const room103 = await findOrCreateRoom(client, {
      room_number: '103', room_type: 'standard', dimensions: '3x3 m',
      monthly_price: 600000, max_occupants: 1, bathroom_type: 'luar',
      floor_number: 1, status: 'AVAILABLE',
    }, kosMelati, [facilityIds['Kasur'], facilityIds['Wi-Fi']])

    const room104 = await findOrCreateRoom(client, {
      room_number: '104', room_type: 'standard', dimensions: '3x3 m',
      monthly_price: 650000, max_occupants: 1, bathroom_type: 'luar',
      floor_number: 1, status: 'OCCUPIED',
    }, kosMelati, [facilityIds['Kasur'], facilityIds['Lemari']])

    const room201 = await findOrCreateRoom(client, {
      room_number: '201', room_type: 'standard', dimensions: '3x4 m',
      monthly_price: 900000, max_occupants: 1, bathroom_type: 'dalam',
      floor_number: 2, status: 'AVAILABLE',
    }, kosMawar, facilitiesKosMawar)

    const room202 = await findOrCreateRoom(client, {
      room_number: '202', room_type: 'deluxe', dimensions: '4x5 m',
      monthly_price: 1200000, max_occupants: 2, bathroom_type: 'dalam',
      floor_number: 2, status: 'AVAILABLE',
    }, kosMawar, [...facilitiesKosMawar, facilityIds['AC'], facilityIds['Water Heater']])

    const room301 = await findOrCreateRoom(client, {
      room_number: '301', room_type: 'standard', dimensions: '3x4 m',
      monthly_price: 700000, max_occupants: 1, bathroom_type: 'luar',
      floor_number: 1, status: 'AVAILABLE',
    }, kosAnggrek, [facilityIds['Kasur'], facilityIds['Kipas Angin']])

    // Booking contoh dengan status berbeda agar semua tampilan bisa diuji.
    const bookingPending = await findOrCreateBooking(client, {
      booking_code: 'BK-SEED0001',
      start_date: addDays(7),
      duration_months: 6,
      status: 'PENDING',
      note: 'Mohon dikonfirmasi, saya pindah dari luar kota.',
    }, tenant3, room201, 900000)

    const bookingAwaiting = await findOrCreateBooking(client, {
      booking_code: 'BK-SEED0002',
      start_date: addDays(3),
      duration_months: 12,
      status: 'AWAITING_PAYMENT',
      expires_at: addHours(24),
      note: 'Sudah transfer, bukti menyusul.',
    }, tenant2, room102, 950000)

    const bookingConfirmed = await findOrCreateBooking(client, {
      booking_code: 'BK-SEED0003',
      start_date: addDays(-15),
      duration_months: 6,
      status: 'CONFIRMED',
    }, tenant1, room104, 650000)

    await findOrCreateBooking(client, {
      booking_code: 'BK-SEED0004',
      start_date: addDays(14),
      duration_months: 3,
      status: 'REJECTED',
      note: 'Ingin dekat kampus.',
    }, tenant3, room202, 1200000)

    // Payment VERIFIED untuk booking CONFIRMED.
    const existingPayment = await client.query(
      'SELECT id FROM payments WHERE booking_id = $1',
      [bookingConfirmed],
    )
    if (existingPayment.rowCount === 0) {
      await client.query(
        `INSERT INTO payments
           (booking_id, amount, proof_url, storage_key, status, verified_by, verified_at, note)
         VALUES ($1, $2, $3, $4, 'VERIFIED', $5, now(), $6)`,
        [
          bookingConfirmed, 650000 * 6,
          'https://placehold.co/600x800/png?text=Bukti+Transfer',
          'seed/proofs/bk-seed0003.png',
          owner1, 'Pembayaran sesuai nominal.',
        ],
      )
    }

    // Histori tambahan supaya alur status terbaca di halaman detail.
    const historyCount = await client.query(
      'SELECT COUNT(*)::int AS total FROM booking_status_histories WHERE booking_id = $1',
      [bookingConfirmed],
    )
    if (historyCount.rows[0].total < 3) {
      await client.query(
        `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, 'PENDING', 'AWAITING_PAYMENT', $2, 'Booking disetujui pemilik'),
                ($1, 'AWAITING_PAYMENT', 'CONFIRMED', $2, 'Pembayaran diverifikasi')`,
        [bookingConfirmed, owner1],
      )
    }

    // Satu laporan kerusakan pada booking CONFIRMED.
    const existingMaintenance = await client.query(
      "SELECT id FROM maintenance_requests WHERE title = 'Keran kamar mandi bocor'",
    )
    if (existingMaintenance.rowCount === 0) {
      await client.query(
        `INSERT INTO maintenance_requests
           (booking_id, room_id, tenant_id, title, description, status)
         VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
        [
          bookingConfirmed, room104, tenant1,
          'Keran kamar mandi bocor',
          'Air menetes terus sejak kemarin malam, mohon diperbaiki.',
        ],
      )
    }

    await client.query('COMMIT')
    console.log('Seed selesai.')
    console.log('Admin  : admin@hunikos.test / Admin123!')
    console.log('Owner  : owner1@hunikos.test, owner2@hunikos.test / Owner123!')
    console.log('Tenant : tenant1@hunikos.test, tenant2@hunikos.test, tenant3@hunikos.test / Tenant123!')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Seed gagal:', error.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
