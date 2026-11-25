-- ============================================================================
-- HUNIKOS — Data awal proyek (akun uji + data contoh)
-- ============================================================================
-- Jalankan berkas ini SETELAH docs/schema.sql.
--
-- Isinya sama dengan yang dibuat `npm run seed`, hanya dalam bentuk SQL supaya
-- bisa langsung dijalankan di pgAdmin milikmu tanpa Node.js.
--
-- Aman dijalankan berulang: setiap INSERT memeriksa data yang sudah ada
-- (ON CONFLICT / NOT EXISTS), jadi tidak ada baris ganda.
--
-- Password di-hash bcrypt cost 10, sama seperti yang dibuat aplikasi saat register.
--
-- Akun hasil seed:
--   admin@hunikos.test   / Admin123!
--   owner1@hunikos.test  / Owner123!
--   owner2@hunikos.test  / Owner123!
--   tenant1@hunikos.test / Tenant123!
--   tenant2@hunikos.test / Tenant123!
--   tenant3@hunikos.test / Tenant123!
--
-- Seluruh INSERT dibungkus satu transaksi: kalau ada yang gagal, tidak ada
-- yang setengah tersimpan.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Akun pengguna
-- ----------------------------------------------------------------------------
INSERT INTO users (full_name, email, password_hash, phone_number, role) VALUES
  ('Admin HUNIKOS', 'admin@hunikos.test',
   '$2b$10$sQ2BU3ZC5pMCKNZSehGCg.nUX/HzuDCRgxDoSjwmDTJqiijhFeIpq',
   '+6281200000001', 'admin'),
  ('Budi Santoso', 'owner1@hunikos.test',
   '$2b$10$YTdEEkmgiFEzHQQ40FPvTuiIKZYmd/zq5CbAWCAt4CW/HpgrkhrmW',
   '+6281200000002', 'owner'),
  ('Siti Rahayu', 'owner2@hunikos.test',
   '$2b$10$YTdEEkmgiFEzHQQ40FPvTuiIKZYmd/zq5CbAWCAt4CW/HpgrkhrmW',
   '+6281200000003', 'owner'),
  ('Andi Pratama', 'tenant1@hunikos.test',
   '$2b$10$16jqagy1uteUxt7PPdn4FuSAsMow0gKTlXbpylRrRvMHemU.c6yoa',
   '+6281200000004', 'tenant'),
  ('Dewi Lestari', 'tenant2@hunikos.test',
   '$2b$10$16jqagy1uteUxt7PPdn4FuSAsMow0gKTlXbpylRrRvMHemU.c6yoa',
   '+6281200000005', 'tenant'),
  ('Rizky Maulana', 'tenant3@hunikos.test',
   '$2b$10$16jqagy1uteUxt7PPdn4FuSAsMow0gKTlXbpylRrRvMHemU.c6yoa',
   '+6281200000006', 'tenant')
ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Properti
--    owner_id diambil dari email supaya tidak perlu menulis UUID manual.
--    NOT EXISTS membuat insert dilewati bila properti itu sudah ada.
-- ----------------------------------------------------------------------------
INSERT INTO properties
  (owner_id, name, description, address, city, latitude, longitude,
   property_type, rules, verification_status)
SELECT u.id, 'Kos Melati',
       'Kos putri dekat kampus dengan lingkungan tenang dan parkir luas.',
       'Jl. Kaliurang KM 5 No. 21, Sleman', 'Yogyakarta', -7.715600, 110.374800,
       'putri', 'Jam malam pukul 23.00. Tamu hanya boleh di ruang tamu.', 'approved'
FROM users u
WHERE u.email = 'owner1@hunikos.test'
  AND NOT EXISTS (
    SELECT 1 FROM properties p WHERE p.owner_id = u.id AND p.name = 'Kos Melati'
  );

INSERT INTO properties
  (owner_id, name, description, address, city, latitude, longitude,
   property_type, rules, verification_status)
SELECT u.id, 'Kos Mawar',
       'Kos campur dengan dapur bersama dan Wi-Fi cepat.',
       'Jl. Diponegoro No. 88, Bandung Wetan', 'Bandung', -6.891500, 107.610700,
       'campur', 'Dilarang merokok di dalam kamar.', 'approved'
FROM users u
WHERE u.email = 'owner2@hunikos.test'
  AND NOT EXISTS (
    SELECT 1 FROM properties p WHERE p.owner_id = u.id AND p.name = 'Kos Mawar'
  );

-- Properti ini dibiarkan `pending` supaya halaman verifikasi admin punya data.
INSERT INTO properties
  (owner_id, name, description, address, city, latitude, longitude,
   property_type, rules, verification_status)
SELECT u.id, 'Kos Anggrek',
       'Kos putra sedang dalam proses verifikasi.',
       'Jl. Ahmad Yani No. 12, Gubeng', 'Surabaya', -7.265000, 112.744000,
       'putra', 'Hanya untuk mahasiswa aktif.', 'pending'
FROM users u
WHERE u.email = 'owner1@hunikos.test'
  AND NOT EXISTS (
    SELECT 1 FROM properties p WHERE p.owner_id = u.id AND p.name = 'Kos Anggrek'
  );

-- ----------------------------------------------------------------------------
-- 3. Kamar
-- ----------------------------------------------------------------------------
INSERT INTO rooms
  (property_id, room_number, room_type, dimensions, monthly_price, max_occupants,
   bathroom_type, floor_number, status)
SELECT p.id, v.room_number, v.room_type, v.dimensions, v.monthly_price,
       v.max_occupants, v.bathroom_type, v.floor_number, v.status
FROM (VALUES
  ('101', 'standard', '3x4 m',  750000::numeric, 1::smallint, 'dalam', 1::smallint, 'AVAILABLE'),
  ('102', 'deluxe',   '4x4 m',  950000::numeric, 2::smallint, 'dalam', 1::smallint, 'RESERVED'),
  ('103', 'standard', '3x3 m',  600000::numeric, 1::smallint, 'luar',  1::smallint, 'AVAILABLE'),
  ('104', 'standard', '3x3 m',  650000::numeric, 1::smallint, 'luar',  1::smallint, 'OCCUPIED')
) AS v(room_number, room_type, dimensions, monthly_price, max_occupants, bathroom_type, floor_number, status)
CROSS JOIN properties p
WHERE p.name = 'Kos Melati'
  AND NOT EXISTS (
    SELECT 1 FROM rooms r WHERE r.property_id = p.id AND r.room_number = v.room_number
  );

INSERT INTO rooms
  (property_id, room_number, room_type, dimensions, monthly_price, max_occupants,
   bathroom_type, floor_number, status)
SELECT p.id, v.room_number, v.room_type, v.dimensions, v.monthly_price,
       v.max_occupants, v.bathroom_type, v.floor_number, v.status
FROM (VALUES
  ('201', 'standard', '3x4 m',  900000::numeric, 1::smallint, 'dalam', 2::smallint, 'AVAILABLE'),
  ('202', 'deluxe',   '4x5 m', 1200000::numeric, 2::smallint, 'dalam', 2::smallint, 'AVAILABLE')
) AS v(room_number, room_type, dimensions, monthly_price, max_occupants, bathroom_type, floor_number, status)
CROSS JOIN properties p
WHERE p.name = 'Kos Mawar'
  AND NOT EXISTS (
    SELECT 1 FROM rooms r WHERE r.property_id = p.id AND r.room_number = v.room_number
  );

INSERT INTO rooms
  (property_id, room_number, room_type, dimensions, monthly_price, max_occupants,
   bathroom_type, floor_number, status)
SELECT p.id, v.room_number, v.room_type, v.dimensions, v.monthly_price,
       v.max_occupants, v.bathroom_type, v.floor_number, v.status
FROM (VALUES
  ('301', 'standard', '3x4 m', 700000::numeric, 1::smallint, 'luar', 1::smallint, 'AVAILABLE')
) AS v(room_number, room_type, dimensions, monthly_price, max_occupants, bathroom_type, floor_number, status)
CROSS JOIN properties p
WHERE p.name = 'Kos Anggrek'
  AND NOT EXISTS (
    SELECT 1 FROM rooms r WHERE r.property_id = p.id AND r.room_number = v.room_number
  );

-- ----------------------------------------------------------------------------
-- 4. Fasilitas kamar
--    Fasilitas master ('Kasur', 'AC', dst.) sudah diisi oleh schema.sql.
--    102 sengaja berbeda dari 101 supaya filter "semua fasilitas" bisa diuji.
-- ----------------------------------------------------------------------------
INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Lemari','Meja Belajar','Wi-Fi','Kamar Mandi Dalam'])
WHERE p.name = 'Kos Melati' AND r.room_number = '101'
ON CONFLICT DO NOTHING;

INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Lemari','Meja Belajar','Wi-Fi','Kamar Mandi Dalam','AC'])
WHERE p.name = 'Kos Melati' AND r.room_number = '102'
ON CONFLICT DO NOTHING;

INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Wi-Fi'])
WHERE p.name = 'Kos Melati' AND r.room_number = '103'
ON CONFLICT DO NOTHING;

INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Lemari'])
WHERE p.name = 'Kos Melati' AND r.room_number = '104'
ON CONFLICT DO NOTHING;

INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Kipas Angin','Wi-Fi','Dapur Bersama','Parkir Motor'])
WHERE p.name = 'Kos Mawar' AND r.room_number = '201'
ON CONFLICT DO NOTHING;

INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Kipas Angin','Wi-Fi','Dapur Bersama','Parkir Motor','AC','Water Heater'])
WHERE p.name = 'Kos Mawar' AND r.room_number = '202'
ON CONFLICT DO NOTHING;

INSERT INTO room_facilities (room_id, facility_id)
SELECT r.id, f.id
FROM rooms r
JOIN properties p ON p.id = r.property_id
JOIN facilities f ON f.name = ANY (ARRAY['Kasur','Kipas Angin'])
WHERE p.name = 'Kos Anggrek' AND r.room_number = '301'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Booking
--    Tanggal dihitung dari CURRENT_DATE supaya data selalu relevan, bukan
--    tanggal mati yang keburu lewat. end_date = start_date + durasi bulan.
--    Satu booking per status, agar semua tampilan punya contoh.
-- ----------------------------------------------------------------------------
INSERT INTO bookings
  (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
   rental_price_snapshot, total_amount, status, note)
SELECT 'BK-SEED0001', t.id, r.id,
       CURRENT_DATE + 7, 6,
       (CURRENT_DATE + 7) + make_interval(months => 6),
       900000, 900000 * 6, 'PENDING',
       'Mohon dikonfirmasi, saya pindah dari luar kota.'
FROM users t
JOIN rooms r ON r.room_number = '201'
JOIN properties p ON p.id = r.property_id AND p.name = 'Kos Mawar'
WHERE t.email = 'tenant3@hunikos.test'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.booking_code = 'BK-SEED0001');

INSERT INTO bookings
  (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
   rental_price_snapshot, total_amount, status, note, expires_at)
SELECT 'BK-SEED0002', t.id, r.id,
       CURRENT_DATE + 3, 12,
       (CURRENT_DATE + 3) + make_interval(months => 12),
       950000, 950000 * 12, 'AWAITING_PAYMENT',
       'Sudah transfer, bukti menyusul.', now() + INTERVAL '24 hours'
FROM users t
JOIN rooms r ON r.room_number = '102'
JOIN properties p ON p.id = r.property_id AND p.name = 'Kos Melati'
WHERE t.email = 'tenant2@hunikos.test'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.booking_code = 'BK-SEED0002');

INSERT INTO bookings
  (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
   rental_price_snapshot, total_amount, status)
SELECT 'BK-SEED0003', t.id, r.id,
       CURRENT_DATE - 15, 6,
       (CURRENT_DATE - 15) + make_interval(months => 6),
       650000, 650000 * 6, 'CONFIRMED'
FROM users t
JOIN rooms r ON r.room_number = '104'
JOIN properties p ON p.id = r.property_id AND p.name = 'Kos Melati'
WHERE t.email = 'tenant1@hunikos.test'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.booking_code = 'BK-SEED0003');

INSERT INTO bookings
  (booking_code, tenant_id, room_id, start_date, duration_months, end_date,
   rental_price_snapshot, total_amount, status, note)
SELECT 'BK-SEED0004', t.id, r.id,
       CURRENT_DATE + 14, 3,
       (CURRENT_DATE + 14) + make_interval(months => 3),
       1200000, 1200000 * 3, 'REJECTED',
       'Ingin dekat kampus.'
FROM users t
JOIN rooms r ON r.room_number = '202'
JOIN properties p ON p.id = r.property_id AND p.name = 'Kos Mawar'
WHERE t.email = 'tenant3@hunikos.test'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.booking_code = 'BK-SEED0004');

-- ----------------------------------------------------------------------------
-- 6. Riwayat status
--    Booking baru langsung punya satu baris. BK-SEED0003 ditambah dua baris
--    supaya alur PENDING -> AWAITING_PAYMENT -> CONFIRMED terbaca di detail.
-- ----------------------------------------------------------------------------
INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
SELECT b.id, NULL, b.status, b.tenant_id, 'Data contoh seed'
FROM bookings b
WHERE b.booking_code IN ('BK-SEED0001', 'BK-SEED0002', 'BK-SEED0003', 'BK-SEED0004')
  AND NOT EXISTS (
    SELECT 1 FROM booking_status_histories h WHERE h.booking_id = b.id
  );

INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
SELECT b.id, 'PENDING', 'AWAITING_PAYMENT', u.id, 'Booking disetujui pemilik'
FROM bookings b
CROSS JOIN users u
WHERE b.booking_code = 'BK-SEED0003' AND u.email = 'owner1@hunikos.test'
  AND NOT EXISTS (
    SELECT 1 FROM booking_status_histories h
    WHERE h.booking_id = b.id AND h.to_status = 'AWAITING_PAYMENT'
  );

INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
SELECT b.id, 'AWAITING_PAYMENT', 'CONFIRMED', u.id, 'Pembayaran diverifikasi'
FROM bookings b
CROSS JOIN users u
WHERE b.booking_code = 'BK-SEED0003' AND u.email = 'owner1@hunikos.test'
  AND NOT EXISTS (
    SELECT 1 FROM booking_status_histories h
    WHERE h.booking_id = b.id AND h.to_status = 'CONFIRMED'
  );

-- ----------------------------------------------------------------------------
-- 7. Pembayaran terverifikasi untuk booking CONFIRMED
--    posted_by/verified_by diambil dari pemilik kos, bukan angka UUID.
-- ----------------------------------------------------------------------------
INSERT INTO payments
  (booking_id, amount, proof_url, storage_key, status, verified_by, verified_at, note)
SELECT b.id, b.total_amount,
       'https://placehold.co/600x800/png?text=Bukti+Transfer',
       'seed/proofs/bk-seed0003.png', 'VERIFIED', u.id, now(),
       'Pembayaran sesuai nominal.'
FROM bookings b
CROSS JOIN users u
WHERE b.booking_code = 'BK-SEED0003' AND u.email = 'owner1@hunikos.test'
  AND NOT EXISTS (SELECT 1 FROM payments pay WHERE pay.booking_id = b.id);

-- ----------------------------------------------------------------------------
-- 8. Satu laporan kerusakan (status OPEN) pada booking yang sudah CONFIRMED
-- ----------------------------------------------------------------------------
INSERT INTO maintenance_requests
  (booking_id, room_id, tenant_id, title, description, status)
SELECT b.id, b.room_id, b.tenant_id,
       'Keran kamar mandi bocor',
       'Air menetes terus sejak kemarin malam, mohon diperbaiki.', 'OPEN'
FROM bookings b
WHERE b.booking_code = 'BK-SEED0003'
  AND NOT EXISTS (
    SELECT 1 FROM maintenance_requests m
    WHERE m.booking_id = b.id AND m.title = 'Keran kamar mandi bocor'
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- Pemeriksaan: jumlah baris setiap tabel setelah seed.
-- ----------------------------------------------------------------------------
SELECT 'users' AS tabel, count(*) AS jumlah FROM users
UNION ALL SELECT 'properties', count(*) FROM properties
UNION ALL SELECT 'rooms', count(*) FROM rooms
UNION ALL SELECT 'room_facilities', count(*) FROM room_facilities
UNION ALL SELECT 'bookings', count(*) FROM bookings
UNION ALL SELECT 'booking_status_histories', count(*) FROM booking_status_histories
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'maintenance_requests', count(*) FROM maintenance_requests
ORDER BY tabel;
