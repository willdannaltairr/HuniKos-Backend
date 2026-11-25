-- Up Migration
-- Data master fasilitas. ON CONFLICT membuat file aman dijalankan ulang.

INSERT INTO facilities (name) VALUES
  ('Kasur'),
  ('Lemari'),
  ('Meja Belajar'),
  ('Kursi'),
  ('AC'),
  ('Kipas Angin'),
  ('Wi-Fi'),
  ('Kamar Mandi Dalam'),
  ('Water Heater'),
  ('Dapur Bersama'),
  ('Parkir Motor'),
  ('Laundry')
ON CONFLICT (name) DO NOTHING;

-- Down Migration
-- Relasi kamar-fasilitas dihapus dulu, karena foreign key-nya ON DELETE RESTRICT.
DELETE FROM room_facilities
WHERE facility_id IN (
  SELECT id FROM facilities WHERE name IN (
    'Kasur', 'Lemari', 'Meja Belajar', 'Kursi', 'AC', 'Kipas Angin',
    'Wi-Fi', 'Kamar Mandi Dalam', 'Water Heater', 'Dapur Bersama',
    'Parkir Motor', 'Laundry'
  )
);

DELETE FROM facilities WHERE name IN (
  'Kasur',
  'Lemari',
  'Meja Belajar',
  'Kursi',
  'AC',
  'Kipas Angin',
  'Wi-Fi',
  'Kamar Mandi Dalam',
  'Water Heater',
  'Dapur Bersama',
  'Parkir Motor',
  'Laundry'
);
