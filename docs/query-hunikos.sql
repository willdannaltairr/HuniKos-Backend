-- ============================================================================
-- HUNIKOS — Kumpulan query PostgreSQL sesuai fitur dan role
-- ============================================================================
-- Semua query di bawah hanya membaca data (SELECT), jadi aman dijalankan
-- berkali-kali di pgAdmin Query Tool tanpa merusak isi tabel.
--
-- Cara pakai:
--   1. Buka pgAdmin -> klik database -> Query Tool.
--   2. Salin satu blok query, tekan F5.
--
-- Query yang butuh ID memakai email atau nama akun contoh dari `npm run seed`,
-- supaya bisa langsung jalan tanpa mengganti angka apa pun.
--
-- Daftar akun contoh:
--   admin@hunikos.test    / Admin123!
--   owner1@hunikos.test   / Owner123!
--   tenant1@hunikos.test  / Tenant123!
-- ============================================================================


-- ============================================================================
-- BAGIAN 1 — PUBLIK (pengunjung yang belum login)
-- ============================================================================

-- 1.1 Daftar kos yang sudah disetujui admin, lengkap dengan harga termurah,
--     jumlah kamar tersedia, dan total kamar. Ini isi halaman "Jelajah".
SELECT
  p.id,
  p.name,
  p.city,
  p.property_type,
  MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS harga_termurah,
  COUNT(*) FILTER (WHERE r.status = 'AVAILABLE')             AS kamar_tersedia,
  COUNT(*) FILTER (WHERE r.status <> 'INACTIVE')             AS total_kamar
FROM properties p
LEFT JOIN rooms r ON r.property_id = p.id
WHERE p.verification_status = 'approved'
GROUP BY p.id
ORDER BY p.created_at DESC;


-- 1.2 Pencarian dengan filter kota dan rentang harga.
--     Ganti 'Yogyakarta' dan angka harga sesuai kebutuhan.
SELECT
  p.id,
  p.name,
  p.city,
  MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS harga_termurah
FROM properties p
LEFT JOIN rooms r ON r.property_id = p.id
WHERE p.verification_status = 'approved'
  AND p.city ILIKE '%Yogyakarta%'
GROUP BY p.id
HAVING MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE')
       BETWEEN 600000 AND 1000000
ORDER BY harga_termurah ASC;


-- 1.3 Detail satu kos beserta data pemiliknya.
SELECT
  p.name,
  p.address,
  p.city,
  p.property_type,
  p.rules,
  u.full_name AS nama_pemilik,
  u.phone_number AS telepon_pemilik
FROM properties p
JOIN users u ON u.id = p.owner_id
WHERE p.name = 'Kos Melati';


-- 1.4 Semua kamar di satu kos beserta daftar fasilitasnya.
--     json_agg menggabungkan fasilitas menjadi satu kolom, jadi tidak perlu
--     query berulang per kamar.
SELECT
  r.room_number,
  r.monthly_price,
  r.bathroom_type,
  r.status,
  COALESCE(
    json_agg(f.name ORDER BY f.name) FILTER (WHERE f.id IS NOT NULL),
    '[]'
  ) AS fasilitas
FROM rooms r
LEFT JOIN room_facilities rf ON rf.room_id = r.id
LEFT JOIN facilities f ON f.id = rf.facility_id
WHERE r.property_id = (SELECT id FROM properties WHERE name = 'Kos Melati')
  AND r.status <> 'INACTIVE'
GROUP BY r.id
ORDER BY r.floor_number, r.room_number;


-- 1.5 Kamar yang memiliki SEMUA fasilitas yang diminta.
--     Di sini contohnya AC dan Wi-Fi.
SELECT r.room_number, p.name AS properti
FROM rooms r
JOIN properties p ON p.id = r.property_id
WHERE (
  SELECT count(DISTINCT f.name)
  FROM room_facilities rf
  JOIN facilities f ON f.id = rf.facility_id
  WHERE rf.room_id = r.id AND f.name IN ('AC', 'Wi-Fi')
) = 2
ORDER BY p.name, r.room_number;


-- 1.6 Tanggal yang sudah terisi untuk satu kamar.
--     Dipakai saat penyewa memilih tanggal, agar tidak memesan yang bentrok.
SELECT b.start_date, b.end_date, b.status
FROM bookings b
WHERE b.room_id = (
        SELECT r.id FROM rooms r
        JOIN properties p ON p.id = r.property_id
        WHERE p.name = 'Kos Melati' AND r.room_number = '101'
      )
  AND b.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED')
ORDER BY b.start_date;


-- ============================================================================
-- BAGIAN 2 — PENYEWA (role tenant)
-- ============================================================================

-- 2.1 Semua booking milik satu penyewa, terbaru di atas.
SELECT
  b.booking_code,
  b.status,
  b.start_date,
  b.end_date,
  b.total_amount,
  r.room_number,
  p.name AS properti
FROM bookings b
JOIN rooms r ON r.id = b.room_id
JOIN properties p ON p.id = r.property_id
WHERE b.tenant_id = (SELECT id FROM users WHERE email = 'tenant1@hunikos.test')
ORDER BY b.created_at DESC;


-- 2.2 Detail satu booking: data booking, pembayaran, dan riwayat status.
--     Jalankan tiga blok ini berurutan (atau pisah sesuai kebutuhan).
SELECT
  b.booking_code,
  b.status,
  b.start_date,
  b.duration_months,
  b.end_date,
  b.rental_price_snapshot,
  b.total_amount,
  b.expires_at
FROM bookings b
WHERE b.tenant_id = (SELECT id FROM users WHERE email = 'tenant1@hunikos.test')
ORDER BY b.created_at DESC
LIMIT 1;

SELECT pay.status, pay.amount, pay.created_at
FROM payments pay
WHERE pay.booking_id = (SELECT id FROM bookings WHERE booking_code = 'BK-SEED0003')
ORDER BY pay.created_at DESC;

SELECT h.from_status, h.to_status, h.note, h.created_at
FROM booking_status_histories h
WHERE h.booking_id = (SELECT id FROM bookings WHERE booking_code = 'BK-SEED0003')
ORDER BY h.created_at;


-- 2.3 Cek bentrok sebelum membuat booking baru.
--     Rumusnya: mulai_baru < akhir_lama DAN akhir_baru > mulai_lama.
--     Kalau hasilnya 0 baris, kamar masih kosong pada rentang itu.
SELECT b.booking_code, b.start_date, b.end_date, b.status
FROM bookings b
WHERE b.room_id = (
        SELECT r.id FROM rooms r
        JOIN properties p ON p.id = r.property_id
        WHERE p.name = 'Kos Melati' AND r.room_number = '101'
      )
  AND b.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED')
  AND b.start_date < DATE '2027-01-10'   -- akhir sewa baru (eksklusif)
  AND b.end_date   > DATE '2027-01-01';  -- mulai sewa baru


-- 2.4 Tagihan yang harus dibayar: total_amount dikurangi pembayaran VERIFIED.
SELECT
  b.booking_code,
  b.total_amount,
  COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'VERIFIED'), 0) AS sudah_dibayar,
  b.total_amount
    - COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'VERIFIED'), 0) AS sisa
FROM bookings b
LEFT JOIN payments pay ON pay.booking_id = b.id
WHERE b.tenant_id = (SELECT id FROM users WHERE email = 'tenant1@hunikos.test')
GROUP BY b.id
ORDER BY b.created_at DESC;


-- 2.5 Laporan kerusakan milik sendiri.
SELECT m.title, m.status, m.owner_note, m.created_at, r.room_number
FROM maintenance_requests m
JOIN rooms r ON r.id = m.room_id
WHERE m.tenant_id = (SELECT id FROM users WHERE email = 'tenant1@hunikos.test')
ORDER BY m.created_at DESC;


-- ============================================================================
-- BAGIAN 3 — PEMILIK KOS (role owner)
-- ============================================================================

-- 3.1 Ringkasan dashboard pemilik dalam satu baris.
--     Semua hitungan memakai subquery agar tidak perlu beberapa query terpisah.
SELECT
  (SELECT count(*) FROM properties
     WHERE owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test'))
    AS total_properti,
  (SELECT count(*) FROM properties
     WHERE owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
       AND verification_status = 'approved') AS properti_approved,
  (SELECT count(*) FROM rooms r JOIN properties p ON p.id = r.property_id
     WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
       AND r.status <> 'INACTIVE') AS total_kamar,
  (SELECT count(*) FROM rooms r JOIN properties p ON p.id = r.property_id
     WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
       AND r.status = 'AVAILABLE') AS kamar_tersedia,
  (SELECT count(*) FROM rooms r JOIN properties p ON p.id = r.property_id
     WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
       AND r.status = 'OCCUPIED') AS kamar_terisi,
  (SELECT count(*) FROM bookings b
     JOIN rooms r ON r.id = b.room_id JOIN properties p ON p.id = r.property_id
     WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
       AND b.status = 'PENDING') AS booking_menunggu,
  (SELECT count(*) FROM payments pay
     JOIN bookings b ON b.id = pay.booking_id
     JOIN rooms r ON r.id = b.room_id JOIN properties p ON p.id = r.property_id
     WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
       AND pay.status = 'PENDING') AS pembayaran_menunggu;


-- 3.2 Pendapatan bulan berjalan.
--     Dihitung dari pembayaran VERIFIED memakai bulan WIB (Asia/Jakarta),
--     supaya pembayaran tanggal 1 pagi tidak terhitung ke bulan sebelumnya.
SELECT COALESCE(SUM(pay.amount), 0) AS pendapatan_bulan_ini
FROM payments pay
JOIN bookings b ON b.id = pay.booking_id
JOIN rooms r ON r.id = b.room_id
JOIN properties p ON p.id = r.property_id
WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
  AND pay.status = 'VERIFIED'
  AND date_trunc('month', pay.verified_at AT TIME ZONE 'Asia/Jakarta')
      = date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta');


-- 3.3 Semua properti milik sendiri beserta jumlah kamarnya.
SELECT
  p.name,
  p.city,
  p.verification_status,
  p.rejection_note,
  COUNT(r.id) FILTER (WHERE r.id IS NOT NULL)                  AS total_kamar,
  COUNT(r.id) FILTER (WHERE r.status = 'AVAILABLE')             AS kamar_tersedia
FROM properties p
LEFT JOIN rooms r ON r.property_id = p.id
WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
GROUP BY p.id
ORDER BY p.created_at DESC;


-- 3.4 Booking yang masuk ke properti sendiri, terbaru di atas.
--     Kolom tenant hanya nama dan telepon, bukan email/password.
SELECT
  b.booking_code,
  b.status,
  b.start_date,
  b.total_amount,
  r.room_number,
  p.name AS properti,
  u.full_name AS penyewa,
  u.phone_number
FROM bookings b
JOIN rooms r ON r.id = b.room_id
JOIN properties p ON p.id = r.property_id
JOIN users u ON u.id = b.tenant_id
WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
ORDER BY b.created_at DESC;


-- 3.5 Pembayaran yang menunggu diverifikasi pemilik.
SELECT
  pay.id,
  b.booking_code,
  u.full_name AS penyewa,
  pay.amount,
  pay.proof_url,
  pay.created_at
FROM payments pay
JOIN bookings b ON b.id = pay.booking_id
JOIN rooms r ON r.id = b.room_id
JOIN properties p ON p.id = r.property_id
JOIN users u ON u.id = b.tenant_id
WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
  AND pay.status = 'PENDING'
ORDER BY pay.created_at ASC;


-- 3.6 Laporan kerusakan yang masih terbuka, urut dari yang paling lama.
SELECT m.title, m.description, m.status, r.room_number, p.name AS properti, m.created_at
FROM maintenance_requests m
JOIN rooms r ON r.id = m.room_id
JOIN properties p ON p.id = r.property_id
WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test')
  AND m.status = 'OPEN'
ORDER BY m.created_at ASC;


-- 3.7 Tingkat keterisian kamar (persentase).
SELECT
  count(*) FILTER (WHERE r.status = 'OCCUPIED') AS terisi,
  count(*) FILTER (WHERE r.status <> 'INACTIVE') AS total,
  ROUND(
    100.0 * count(*) FILTER (WHERE r.status = 'OCCUPIED')
    / NULLIF(count(*) FILTER (WHERE r.status <> 'INACTIVE'), 0),
    1
  ) AS persen_terisi
FROM rooms r
JOIN properties p ON p.id = r.property_id
WHERE p.owner_id = (SELECT id FROM users WHERE email = 'owner1@hunikos.test');


-- ============================================================================
-- BAGIAN 4 — ADMIN PLATFORM
-- ============================================================================

-- 4.1 Ringkasan statistik seluruh platform.
SELECT
  (SELECT count(*) FROM users)                                  AS total_user,
  (SELECT count(*) FROM users WHERE role = 'tenant')            AS total_penyewa,
  (SELECT count(*) FROM users WHERE role = 'owner')             AS total_pemilik,
  (SELECT count(*) FROM properties)                             AS total_properti,
  (SELECT count(*) FROM properties WHERE verification_status = 'pending') AS properti_menunggu,
  (SELECT count(*) FROM bookings WHERE status = 'CONFIRMED')    AS booking_aktif;


-- 4.2 Daftar pengguna. Comment/uncomment baris WHERE untuk memfilter role.
SELECT id, full_name, email, role, account_status, created_at
FROM users
WHERE role = 'tenant'        -- ganti ke 'owner' atau 'admin' bila perlu
ORDER BY created_at DESC
LIMIT 20;


-- 4.3 Properti yang menunggu verifikasi, termasuk nama pemiliknya.
SELECT
  p.name,
  p.city,
  p.property_type,
  p.created_at,
  u.full_name AS pemilik,
  COUNT(r.id) FILTER (WHERE r.status = 'AVAILABLE') AS kamar_tersedia
FROM properties p
JOIN users u ON u.id = p.owner_id
LEFT JOIN rooms r ON r.property_id = p.id
WHERE p.verification_status = 'pending'
GROUP BY p.id, u.id
ORDER BY p.created_at ASC;


-- 4.4 Rekap properti per status verifikasi.
SELECT verification_status, count(*) AS jumlah
FROM properties
GROUP BY verification_status
ORDER BY jumlah DESC;


-- ============================================================================
-- BAGIAN 5 — PEMERIKSAAN DATA (untuk menjelaskan ke penguji)
-- ============================================================================

-- 5.1 Ada booking bentrok? Hasil 0 baris berarti aman.
--     Dua booking dianggap bentrok bila rentang tanggalnya beririsan.
SELECT a.booking_code AS booking_a, b.booking_code AS booking_b,
       a.room_id, a.start_date, a.end_date
FROM bookings a
JOIN bookings b
  ON a.room_id = b.room_id
 AND a.id < b.id
 AND a.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED')
 AND b.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED')
 AND a.start_date < b.end_date
 AND a.end_date   > b.start_date;


-- 5.2 Kamar yang statusnya tidak cocok dengan booking aktifnya.
--     Booking PENDING sengaja TIDAK mengunci kamar, jadi kamar AVAILABLE dengan
--     booking PENDING masih benar. Yang salah: RESERVED/OCCUPIED tanpa booking aktif.
--     Hasil 0 baris berarti status kamar konsisten.
SELECT r.id, r.room_number, r.status,
       count(b.id) AS booking_aktif
FROM rooms r
LEFT JOIN bookings b
  ON b.room_id = r.id
 AND b.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED')
GROUP BY r.id
HAVING r.status IN ('RESERVED', 'OCCUPIED') AND count(b.id) = 0;


-- 5.3 Total uang yang tercatat per status pembayaran.
SELECT status, count(*) AS jumlah, SUM(amount) AS total_nominal
FROM payments
GROUP BY status
ORDER BY status;
