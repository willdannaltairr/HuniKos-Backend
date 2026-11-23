-- Query contoh HUNIKOS untuk penjelasan ke penguji.
-- Semua query dijalankan pada database yang sudah di-seed.

-- 1. Daftar kos approved beserta harga termurah dan jumlah kamar tersedia (JOIN + GROUP BY).
SELECT p.id, p.name, p.city,
       MIN(r.monthly_price) FILTER (WHERE r.status <> 'INACTIVE') AS min_price,
       COUNT(*) FILTER (WHERE r.status = 'AVAILABLE')             AS available_rooms
FROM properties p
JOIN rooms r ON r.property_id = p.id
WHERE p.verification_status = 'approved'
GROUP BY p.id, p.name, p.city
ORDER BY min_price;

-- 2. Kamar yang punya SEMUA fasilitas yang diminta (HAVING COUNT(DISTINCT ...)).
SELECT r.id, r.room_number
FROM rooms r
JOIN room_facilities rf ON rf.room_id = r.id
JOIN facilities f ON f.id = rf.facility_id
WHERE f.name IN ('Kasur', 'Wi-Fi')
GROUP BY r.id, r.room_number
HAVING COUNT(DISTINCT f.id) = 2;

-- 3. Deteksi bentrok booking untuk satu kamar dan rentang tanggal (end_date eksklusif).
SELECT 1 AS bentrok
FROM bookings b
WHERE b.room_id = '00000000-0000-0000-0000-000000000000'
  AND b.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED')
  AND b.start_date < DATE '2026-12-01'
  AND b.end_date   > DATE '2026-11-01'
LIMIT 1;

-- 4. Pendapatan bulan ini per pemilik dari pembayaran VERIFIED (zona waktu Asia/Jakarta).
SELECT u.full_name AS owner,
       SUM(pay.amount) AS revenue_this_month
FROM payments pay
JOIN bookings b    ON b.id = pay.booking_id
JOIN rooms r       ON r.id = b.room_id
JOIN properties p  ON p.id = r.property_id
JOIN users u       ON u.id = p.owner_id
WHERE pay.status = 'VERIFIED'
  AND (pay.verified_at AT TIME ZONE 'Asia/Jakarta')::date
      >= date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta')::date)::date
GROUP BY u.id, u.full_name;

-- 5. Booking beserta penyewa, kamar, dan properti (JOIN 4 tabel).
SELECT b.booking_code, b.status, u.full_name AS tenant, r.room_number, p.name AS property
FROM bookings b
JOIN users u      ON u.id = b.tenant_id
JOIN rooms r      ON r.id = b.room_id
JOIN properties p ON p.id = r.property_id
ORDER BY b.created_at DESC;

-- 6. Contoh UPDATE status booking dalam transaksi, disertai catatan riwayat.
BEGIN;
UPDATE bookings
SET status = 'CANCELLED', updated_at = now()
WHERE booking_code = 'BK-SEED0001' AND status = 'PENDING';
INSERT INTO booking_status_histories (booking_id, from_status, to_status, changed_by, note)
SELECT id, 'PENDING', 'CANCELLED', tenant_id, 'Dibatalkan oleh penyewa'
FROM bookings WHERE booking_code = 'BK-SEED0001';
COMMIT;

-- 7. Pelanggaran foreign key: menghapus kamar yang masih punya riwayat booking.
-- Diharapkan error: SQLSTATE 23001 (restrict_violation) dari ON DELETE RESTRICT.
DELETE FROM rooms WHERE room_number = '104';

-- 8. Pelanggaran CHECK: memasukkan kamar dengan harga negatif.
-- Diharapkan error: SQLSTATE 23514 (check_violation) pada rooms_monthly_price_check.
INSERT INTO rooms (property_id, room_number, monthly_price, bathroom_type)
SELECT id, 'TEST-NEGATIF', -1000, 'dalam' FROM properties LIMIT 1;
