-- Up Migration
-- Data master fasilitas. ON CONFLICT membuat migration aman dijalankan ulang.

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
