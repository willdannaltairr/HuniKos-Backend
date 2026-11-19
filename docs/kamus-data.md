# Kamus Data HUNIKOS

Database: PostgreSQL 16. Semua tabel memakai `UUID` sebagai primary key dengan `gen_random_uuid()`,
kecuali tabel relasi `room_facilities` yang memakai gabungan dua kolom sebagai primary key.
Kolom waktu memakai `TIMESTAMPTZ`; kolom tanggal sewa memakai `DATE` tanpa zona waktu.

## Cara membaca ERD

Kotak di `docs/erd.mmd` adalah tabel, dan baris di dalamnya adalah kolom dengan tanda `PK`
(primary key), `FK` (foreign key), atau `UK` (unique). Garis antar kotak menunjukkan relasi:
ujung bertanda `||` berarti tepat satu, sedangkan `o{` berarti nol atau banyak — jadi
`users ||--o{ properties` dibaca "satu pengguna memiliki nol atau banyak properti". Arah garis
mengikuti arah referensi: properti merujuk pemilik, kamar merujuk properti, booking merujuk kamar
dan penyewa. Tabel `room_facilities` sengaja tidak punya kolom sendiri karena hanya menyimpan
pasangan kamar–fasilitas.

## 1. `users`

Menyimpan akun untuk tiga role: `tenant`, `owner`, dan `admin`.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis oleh database. |
| `full_name` | VARCHAR(100) | ya | – | Nama lengkap 2–100 karakter. |
| `email` | VARCHAR(150) | ya | UK | Unik, selalu disimpan huruf kecil oleh aplikasi. |
| `password_hash` | VARCHAR(255) | ya | – | Hasil `bcryptjs` cost 10; password asli tidak pernah disimpan. |
| `phone_number` | VARCHAR(20) | tidak | – | Opsional, format `^[0-9+]{8,20}$`. |
| `avatar_url` | TEXT | tidak | – | URL foto profil hasil upload. |
| `role` | VARCHAR(10) | ya | – | `tenant`, `owner`, atau `admin`. Admin hanya dibuat lewat seed. |
| `account_status` | VARCHAR(10) | ya | – | `active` atau `suspended`; akun suspended ditolak saat login (403). |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu pendaftaran. |
| `updated_at` | TIMESTAMPTZ | ya | – | Diperbarui aplikasi setiap kali profil diubah. |

## 2. `properties`

Data kos yang dimiliki seorang `owner`.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `owner_id` | UUID | ya | FK → `users.id` | Pemilik kos. `ON DELETE RESTRICT`: akun yang masih punya properti tidak bisa dihapus. |
| `name` | VARCHAR(120) | ya | – | Nama kos, 3–120 karakter. |
| `description` | TEXT | tidak | – | Deskripsi bebas, maksimal 2000 karakter. |
| `address` | TEXT | ya | – | Alamat lengkap, 5–500 karakter. |
| `city` | VARCHAR(80) | ya | – | Kota, 2–80 karakter; dipakai untuk filter pencarian. |
| `latitude` | NUMERIC(9,6) | tidak | – | Harus diisi bersama `longitude`. |
| `longitude` | NUMERIC(9,6) | tidak | – | Harus diisi bersama `latitude`. |
| `property_type` | VARCHAR(10) | ya | – | `putra`, `putri`, atau `campur`. |
| `rules` | TEXT | tidak | – | Aturan kos, maksimal 2000 karakter. |
| `verification_status` | VARCHAR(10) | ya | – | `pending` (awal), `approved` (tampil publik), `rejected` (tidak tampil publik). |
| `rejection_note` | TEXT | tidak | – | Alasan penolakan dari admin; wajib saat menolak. Dikosongkan lagi saat properti diperbaiki. |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu dibuat. |
| `updated_at` | TIMESTAMPTZ | ya | – | Diperbarui aplikasi saat properti diubah atau diverifikasi. |

## 3. `rooms`

Kamar pada satu properti.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `property_id` | UUID | ya | FK → `properties.id` | Kamar ikut terhapus bila properti dihapus (`ON DELETE CASCADE`). |
| `room_number` | VARCHAR(20) | ya | UK (bersama `property_id`) | Nomor kamar unik dalam satu properti. |
| `room_type` | VARCHAR(50) | ya | – | Jenis kamar, default `standard`. |
| `dimensions` | VARCHAR(20) | tidak | – | Ukuran, contoh `3x4 m`. |
| `monthly_price` | NUMERIC(14,2) | ya | – | Harga per bulan, harus > 0 dan ≤ 100.000.000. |
| `max_occupants` | SMALLINT | ya | – | 1–10 orang. |
| `bathroom_type` | VARCHAR(10) | ya | – | `dalam` atau `luar`. |
| `floor_number` | SMALLINT | ya | – | 1–50. |
| `status` | VARCHAR(12) | ya | – | `AVAILABLE`, `RESERVED`, `OCCUPIED`, `MAINTENANCE`, `INACTIVE`. Status `RESERVED`/`OCCUPIED` hanya diubah sistem. |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu dibuat. |
| `updated_at` | TIMESTAMPTZ | ya | – | Diperbarui aplikasi saat kamar diubah. |

## 4. `facilities`

Data master fasilitas, diisi lewat migration seed.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `name` | VARCHAR(60) | ya | UK | Nama fasilitas, unik. Isi awal: Kasur, Lemari, Meja Belajar, Kursi, AC, Kipas Angin, Wi-Fi, Kamar Mandi Dalam, Water Heater, Dapur Bersama, Parkir Motor, Laundry. |

## 5. `room_facilities`

Tabel relasi banyak-ke-banyak antara kamar dan fasilitas.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `room_id` | UUID | ya | PK, FK → `rooms.id` | Baris ikut terhapus bila kamar dihapus (`ON DELETE CASCADE`). |
| `facility_id` | UUID | ya | PK, FK → `facilities.id` | Fasilitas tidak bisa dihapus bila masih dipakai (`ON DELETE RESTRICT`). |

## 6. `property_images`

Foto properti; bila `room_id` terisi, foto itu milik kamar.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `property_id` | UUID | ya | FK → `properties.id` | Foto ikut terhapus bila properti dihapus. |
| `room_id` | UUID | tidak | FK → `rooms.id` | `NULL` berarti foto properti secara keseluruhan. |
| `image_url` | TEXT | ya | – | URL yang dipakai aplikasi. |
| `storage_key` | TEXT | ya | – | Path lokal atau `public_id` Cloudinary, dipakai saat menghapus file. |
| `is_cover` | BOOLEAN | ya | – | Hanya satu cover per properti; gambar pertama otomatis jadi cover. |
| `created_at` | TIMESTAMPTZ | ya | – | Dipakai juga untuk menentukan gambar pertama bila tidak ada cover. |

## 7. `bookings`

Pengajuan sewa dari penyewa ke satu kamar.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `booking_code` | VARCHAR(20) | ya | UK | Format `BK-` + 8 digit hex huruf besar, untuk ditunjukkan ke pemilik. |
| `tenant_id` | UUID | ya | FK → `users.id` | Penyewa yang mengajukan. |
| `room_id` | UUID | ya | FK → `rooms.id` | Kamar yang dipesan. Restrict: kamar dengan riwayat booking tidak bisa dihapus. |
| `start_date` | DATE | ya | – | Tanggal mulai sewa, tidak boleh sebelum hari ini (WIB). |
| `duration_months` | SMALLINT | ya | – | 1–24 bulan. |
| `end_date` | DATE | ya | – | `start_date` + durasi bulan; **eksklusif** (tanggal ini bukan bagian masa sewa). |
| `rental_price_snapshot` | NUMERIC(14,2) | ya | – | Harga per bulan saat booking dibuat; tidak ikut berubah bila pemilik menaikkan harga. |
| `total_amount` | NUMERIC(14,2) | ya | – | `rental_price_snapshot × duration_months`. |
| `status` | VARCHAR(20) | ya | – | `PENDING`, `AWAITING_PAYMENT`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `COMPLETED`. |
| `note` | TEXT | tidak | – | Catatan penyewa, maksimal 300 karakter. |
| `owner_note` | TEXT | tidak | – | Catatan keputusan pemilik, maksimal 300 karakter. |
| `expires_at` | TIMESTAMPTZ | tidak | – | Diisi saat `AWAITING_PAYMENT` (sekarang + 24 jam). Lewat waktu ini booking menjadi `EXPIRED`. |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu pengajuan. |
| `updated_at` | TIMESTAMPTZ | ya | – | Diperbarui aplikasi setiap perubahan status. |

## 8. `booking_status_histories`

Jejak setiap perpindahan status booking.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `booking_id` | UUID | ya | FK → `bookings.id` | Riwayat ikut terhapus bila booking dihapus. |
| `from_status` | VARCHAR(20) | tidak | – | `NULL` pada baris pertama (booking baru dibuat). |
| `to_status` | VARCHAR(20) | ya | – | Status setelah perubahan. |
| `changed_by` | UUID | tidak | FK → `users.id` | `NULL` berarti perubahan oleh sistem, misalnya `EXPIRED` otomatis. |
| `note` | TEXT | tidak | – | Alasan perubahan, contoh "Kedaluwarsa otomatis". |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu perubahan. |

## 9. `payments`

Bukti transfer yang diunggah penyewa.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `booking_id` | UUID | ya | FK → `bookings.id` | Booking yang dibayar. |
| `amount` | NUMERIC(14,2) | ya | – | Diambil dari `bookings.total_amount`, bukan dari klien. Harus > 0. |
| `proof_url` | TEXT | ya | – | URL gambar bukti transfer. |
| `storage_key` | TEXT | ya | – | Kunci penyimpanan untuk menghapus file. |
| `status` | VARCHAR(10) | ya | – | `PENDING`, `VERIFIED`, atau `REJECTED`. Hanya satu `PENDING` per booking. |
| `verified_by` | UUID | tidak | FK → `users.id` | Pemilik yang memverifikasi; `NULL` selama belum diverifikasi. |
| `verified_at` | TIMESTAMPTZ | tidak | – | Waktu verifikasi; dipakai menghitung pendapatan bulan berjalan. |
| `note` | TEXT | tidak | – | Catatan pemilik, wajib saat menolak pembayaran. |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu unggah bukti. |

## 10. `maintenance_requests`

Laporan kerusakan dari penyewa yang sedang menyewa.

| Nama Kolom | Tipe Data | Wajib | Key | Keterangan |
|---|---|:-:|---|---|
| `id` | UUID | ya | PK | Dibuat otomatis. |
| `booking_id` | UUID | ya | FK → `bookings.id` | Booking yang menjadi dasar laporan; harus `CONFIRMED`. |
| `room_id` | UUID | ya | FK → `rooms.id` | Kamar yang bermasalah; salinan dari booking agar mudah difilter per kamar. |
| `tenant_id` | UUID | ya | FK → `users.id` | Pelapor. |
| `title` | VARCHAR(120) | ya | – | Judul singkat, 3–120 karakter. |
| `description` | TEXT | ya | – | Penjelasan kerusakan, 5–1000 karakter. |
| `photo_url` | TEXT | tidak | – | Foto kerusakan (opsional). |
| `storage_key` | TEXT | tidak | – | Kunci penyimpanan foto. |
| `status` | VARCHAR(12) | ya | – | `OPEN`, `IN_PROGRESS`, atau `DONE`. |
| `owner_note` | TEXT | tidak | – | Tanggapan pemilik. |
| `created_at` | TIMESTAMPTZ | ya | – | Waktu laporan dibuat. |
| `updated_at` | TIMESTAMPTZ | ya | – | Diperbarui aplikasi saat status berubah. |
