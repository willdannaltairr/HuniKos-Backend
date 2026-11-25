// Mengisi data contoh HUNIKOS. Aman dijalankan berulang kali:
// setiap tabel dicek dulu, dan semua insert memakai ON CONFLICT DO NOTHING.
import bcrypt from 'bcryptjs'
import { pool } from '../src/config/db.js'
import type { PoolClient } from 'pg'

// Tanggal contoh dihitung dari hari ini supaya tampilan selalu relevan.
function hariDariSekarang(jumlahHari: number): string {
  const tanggal = new Date()
  tanggal.setDate(tanggal.getDate() + jumlahHari)
  return tanggal.toISOString().slice(0, 10)
}

function jamDariSekarang(jumlahJam: number): string {
  return new Date(Date.now() + jumlahJam * 3600 * 1000).toISOString()
}

interface DataUser {
  full_name: string
  email: string
  phone_number: string
  role: 'tenant' | 'owner' | 'admin'
  password: string
}

// Cari user lama berdasarkan email; buat baru kalau belum ada.
async function simpanUser(client: PoolClient, user: DataUser): Promise<string> {
  const lama = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    user.email,
  ])
  if (lama.rows[0]) return lama.rows[0].id

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (full_name, email, password_hash, phone_number, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [user.full_name, user.email, await bcrypt.hash(user.password, 10), user.phone_number, user.role],
  )
  return rows[0]?.id as string
}

interface DataProperti {
  name: string
  description: string
  address: string
  city: string
  latitude: number
  longitude: number
  property_type: string
  rules: string
  verification_status: 'pending' | 'approved'
}

async function simpanProperti(
  client: PoolClient,
  properti: DataProperti,
  ownerId: string,
): Promise<string> {
  const lama = await client.query<{ id: string }>(
    'SELECT id FROM properties WHERE owner_id = $1 AND name = $2',
    [ownerId, properti.name],
  )
  if (lama.rows[0]) return lama.rows[0].id

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO properties
       (owner_id, name, description, address, city, latitude, longitude,
        property_type, rules, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      ownerId, properti.name, properti.description, properti.address, properti.city,
      properti.latitude, properti.longitude, properti.property_type, properti.rules,
      properti.verification_status,
    ],
  )
  return rows[0]?.id as string
}

interface DataKamar {
  room_number: string
  room_type: string
  dimensions: string
  monthly_price: number
  max_occupants: number
  bathroom_type: 'dalam' | 'luar'
  floor_number: number
  status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED'
  fasilitas: string[]
}

async function simpanKamar(
  client: PoolClient,
  kamar: DataKamar,
  propertyId: string,
  idsFasilitas: Record<string, string>,
): Promise<string> {
  const lama = await client.query<{ id: string }>(
    'SELECT id FROM rooms WHERE property_id = $1 AND room_number = $2',
    [propertyId, kamar.room_number],
  )
  if (lama.rows[0]) return lama.rows[0].id

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO rooms
       (property_id, room_number, room_type, dimensions, monthly_price, max_occupants,
        bathroom_type, floor_number, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      propertyId, kamar.room_number, kamar.room_type, kamar.dimensions, kamar.monthly_price,
      kamar.max_occupants, kamar.bathroom_type, kamar.floor_number, kamar.status,
    ],
  )
  const roomId = rows[0]?.id as string

  for (const nama of kamar.fasilitas) {
    await client.query('INSERT INTO room_facilities (room_id, facility_id) VALUES ($1, $2)', [
      roomId,
      idsFasilitas[nama],
    ])
  }
  return roomId
}

interface DataBooking {
  booking_code: string
  start_date: string
  duration_months: number
  status: 'PENDING' | 'AWAITING_PAYMENT' | 'CONFIRMED' | 'REJECTED'
  note?: string
  expires_at?: string
}

// booking_code dipakai sebagai kunci idempotensi karena nilainya tetap,
// sedangkan start_date bergeser tiap hari.
async function simpanBooking(
  client: PoolClient,
  booking: DataBooking,
  tenantId: string,
  roomId: string,
  harga: number,
): Promise<string> {
  const lama = await client.query<{ id: string }>('SELECT id FROM bookings WHERE booking_code = $1', [
    booking.booking_code,
  ])
  if (lama.rows[0]) return lama.rows[0].id

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO bookings
       (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
        rental_price_snapshot, total_amount, status, note, expires_at)
     VALUES ($1, $2, $3, $4::date, $5::int,
             ($4::date + make_interval(months => $5::int))::date,
             $6::numeric, $6::numeric * $5::int, $7, $8, $9)
     RETURNING id`,
    [
      booking.booking_code, tenantId, roomId, booking.start_date, booking.duration_months,
      harga, booking.status, booking.note ?? null, booking.expires_at ?? null,
    ],
  )
  const bookingId = rows[0]?.id as string

  await client.query(
    `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
     VALUES ($1, NULL, $2, $3, 'Data contoh seed')`,
    [bookingId, booking.status, tenantId],
  )
  return bookingId
}

async function main(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const daftarFasilitas = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM facilities',
    )
    if (daftarFasilitas.rows.length === 0) {
      throw new Error('Tabel facilities kosong. Jalankan migration lebih dulu.')
    }
    const idsFasilitas: Record<string, string> = {}
    for (const baris of daftarFasilitas.rows) idsFasilitas[baris.name] = baris.id

    // Akun uji sesuai kontrak.
    const admin = await simpanUser(client, {
      full_name: 'Admin HUNIKOS', email: 'admin@hunikos.test',
      phone_number: '+6281200000001', role: 'admin', password: 'Admin123!',
    })
    const owner1 = await simpanUser(client, {
      full_name: 'Budi Santoso', email: 'owner1@hunikos.test',
      phone_number: '+6281200000002', role: 'owner', password: 'Owner123!',
    })
    const owner2 = await simpanUser(client, {
      full_name: 'Siti Rahayu', email: 'owner2@hunikos.test',
      phone_number: '+6281200000003', role: 'owner', password: 'Owner123!',
    })
    const tenant1 = await simpanUser(client, {
      full_name: 'Andi Pratama', email: 'tenant1@hunikos.test',
      phone_number: '+6281200000004', role: 'tenant', password: 'Tenant123!',
    })
    const tenant2 = await simpanUser(client, {
      full_name: 'Dewi Lestari', email: 'tenant2@hunikos.test',
      phone_number: '+6281200000005', role: 'tenant', password: 'Tenant123!',
    })
    const tenant3 = await simpanUser(client, {
      full_name: 'Rizky Maulana', email: 'tenant3@hunikos.test',
      phone_number: '+6281200000006', role: 'tenant', password: 'Tenant123!',
    })
    void admin

    const kosMelati = await simpanProperti(client, {
      name: 'Kos Melati',
      description: 'Kos putri dekat kampus dengan lingkungan tenang dan parkir luas.',
      address: 'Jl. Kaliurang KM 5 No. 21, Sleman',
      city: 'Yogyakarta',
      latitude: -7.7156,
      longitude: 110.3748,
      property_type: 'putri',
      rules: 'Jam malam pukul 23.00. Tamu hanya boleh di ruang tamu.',
      verification_status: 'approved',
    }, owner1)

    const kosMawar = await simpanProperti(client, {
      name: 'Kos Mawar',
      description: 'Kos campur dengan dapur bersama dan Wi-Fi cepat.',
      address: 'Jl. Diponegoro No. 88, Bandung Wetan',
      city: 'Bandung',
      latitude: -6.8915,
      longitude: 107.6107,
      property_type: 'campur',
      rules: 'Dilarang merokok di dalam kamar.',
      verification_status: 'approved',
    }, owner2)

    const kosAnggrek = await simpanProperti(client, {
      name: 'Kos Anggrek',
      description: 'Kos putra sedang dalam proses verifikasi.',
      address: 'Jl. Ahmad Yani No. 12, Gubeng',
      city: 'Surabaya',
      latitude: -7.265,
      longitude: 112.744,
      property_type: 'putra',
      rules: 'Hanya untuk mahasiswa aktif.',
      verification_status: 'pending',
    }, owner1)

    const room101 = await simpanKamar(client, {
      room_number: '101', room_type: 'standard', dimensions: '3x4 m', monthly_price: 750000,
      max_occupants: 1, bathroom_type: 'dalam', floor_number: 1, status: 'AVAILABLE',
      fasilitas: ['Kasur', 'Lemari', 'Meja Belajar', 'Wi-Fi', 'Kamar Mandi Dalam'],
    }, kosMelati, idsFasilitas)

    const room102 = await simpanKamar(client, {
      room_number: '102', room_type: 'deluxe', dimensions: '4x4 m', monthly_price: 950000,
      max_occupants: 2, bathroom_type: 'dalam', floor_number: 1, status: 'RESERVED',
      fasilitas: ['Kasur', 'Lemari', 'Meja Belajar', 'Wi-Fi', 'Kamar Mandi Dalam', 'AC'],
    }, kosMelati, idsFasilitas)

    const room103 = await simpanKamar(client, {
      room_number: '103', room_type: 'standard', dimensions: '3x3 m', monthly_price: 600000,
      max_occupants: 1, bathroom_type: 'luar', floor_number: 1, status: 'AVAILABLE',
      fasilitas: ['Kasur', 'Wi-Fi'],
    }, kosMelati, idsFasilitas)

    const room104 = await simpanKamar(client, {
      room_number: '104', room_type: 'standard', dimensions: '3x3 m', monthly_price: 650000,
      max_occupants: 1, bathroom_type: 'luar', floor_number: 1, status: 'OCCUPIED',
      fasilitas: ['Kasur', 'Lemari'],
    }, kosMelati, idsFasilitas)

    const room201 = await simpanKamar(client, {
      room_number: '201', room_type: 'standard', dimensions: '3x4 m', monthly_price: 900000,
      max_occupants: 1, bathroom_type: 'dalam', floor_number: 2, status: 'AVAILABLE',
      fasilitas: ['Kasur', 'Kipas Angin', 'Wi-Fi', 'Dapur Bersama', 'Parkir Motor'],
    }, kosMawar, idsFasilitas)

    const room202 = await simpanKamar(client, {
      room_number: '202', room_type: 'deluxe', dimensions: '4x5 m', monthly_price: 1200000,
      max_occupants: 2, bathroom_type: 'dalam', floor_number: 2, status: 'AVAILABLE',
      fasilitas: ['Kasur', 'Kipas Angin', 'Wi-Fi', 'Dapur Bersama', 'Parkir Motor', 'AC', 'Water Heater'],
    }, kosMawar, idsFasilitas)

    await simpanKamar(client, {
      room_number: '301', room_type: 'standard', dimensions: '3x4 m', monthly_price: 700000,
      max_occupants: 1, bathroom_type: 'luar', floor_number: 1, status: 'AVAILABLE',
      fasilitas: ['Kasur', 'Kipas Angin'],
    }, kosAnggrek, idsFasilitas)

    // Booking contoh dengan status berbeda agar semua tampilan bisa diuji.
    await simpanBooking(client, {
      booking_code: 'BK-SEED0001', start_date: hariDariSekarang(7), duration_months: 6,
      status: 'PENDING', note: 'Mohon dikonfirmasi, saya pindah dari luar kota.',
    }, tenant3, room201, 900000)

    await simpanBooking(client, {
      booking_code: 'BK-SEED0002', start_date: hariDariSekarang(3), duration_months: 12,
      status: 'AWAITING_PAYMENT', expires_at: jamDariSekarang(24),
      note: 'Sudah transfer, bukti menyusul.',
    }, tenant2, room102, 950000)

    const bookingConfirmed = await simpanBooking(client, {
      booking_code: 'BK-SEED0003', start_date: hariDariSekarang(-15), duration_months: 6,
      status: 'CONFIRMED',
    }, tenant1, room104, 650000)

    await simpanBooking(client, {
      booking_code: 'BK-SEED0004', start_date: hariDariSekarang(14), duration_months: 3,
      status: 'REJECTED', note: 'Ingin dekat kampus.',
    }, tenant3, room202, 1200000)

    // Pembayaran VERIFIED untuk booking CONFIRMED.
    const adaPembayaran = await client.query(
      'SELECT 1 FROM payments WHERE booking_id = $1 LIMIT 1',
      [bookingConfirmed],
    )
    if ((adaPembayaran.rowCount ?? 0) === 0) {
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
    const jumlahHistory = await client.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM booking_status_histories WHERE booking_id = $1',
      [bookingConfirmed],
    )
    if ((jumlahHistory.rows[0]?.total ?? 0) < 3) {
      await client.query(
        `INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, 'PENDING', 'AWAITING_PAYMENT', $2, 'Booking disetujui pemilik'),
                ($1, 'AWAITING_PAYMENT', 'CONFIRMED', $2, 'Pembayaran diverifikasi')`,
        [bookingConfirmed, owner1],
      )
    }

    // Satu laporan kerusakan pada booking CONFIRMED.
    const adaLaporan = await client.query(
      "SELECT 1 FROM maintenance_requests WHERE title = 'Keran kamar mandi bocor' LIMIT 1",
    )
    if ((adaLaporan.rowCount ?? 0) === 0) {
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

    void room101
    void room103
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Seed gagal:', (error as Error).message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
