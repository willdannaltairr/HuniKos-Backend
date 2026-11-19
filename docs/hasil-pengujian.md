# Hasil Pengujian API HUNIKOS

Dokumen ini mencatat hasil pengujian yang **benar-benar dijalankan**, bukan perkiraan.
Semua angka di bawah berasal dari eksekusi terhadap server yang hidup dan PostgreSQL
lokal yang berisi data seed. Perangkat yang dipakai: Node.js 22.17.1, PostgreSQL 18,
Windows 11, server dijalankan dengan `node src/server.js` (`PORT=3100`).

Tanggal pengujian: 19 November 2026.

## Ringkasan

| Rangkaian uji | Cakupan | Hasil |
|---|---|---|
| `e2e-auth` | register, login, profil, avatar, pembatasan akun | **21/21 lulus** |
| `e2e-public` | fasilitas, daftar & detail properti, filter, detail kamar | **23/23 lulus** |
| `e2e-tenant` | booking, bentrok paralel, pembayaran, laporan kerusakan | **32/32 lulus** |
| `e2e-owner` | properti, foto, kamar, keputusan booking, verifikasi bayar | **47/47 lulus** |
| `e2e` (skenario penuh) | alur ujung-ke-ujung dari register sampai admin | **43/43 lulus** |
| Uji modul admin | dashboard, daftar pengguna, verifikasi properti, blokir akun | **32/32 lulus** |

**Total: 198/198 lulus, 0 gagal.**

## Cara menjalankan ulang

```bash
cd api
node src/server.js
```

Batas percobaan login bawaan adalah 10 per IP per 15 menit. Saat menjalankan skrip uji
otomatis, banyak login terjadi dari satu alamat, jadi batas itu perlu dinaikkan:

```bash
PORT=3100 LOGIN_RATE_LIMIT=200 node src/server.js
```

Batas 10 tetap berlaku di produksi; `LOGIN_RATE_LIMIT` hanya jalan keluar untuk pengujian.

## Kasus negatif yang terbukti

Setiap baris di bawah ini menghasilkan kode HTTP yang disebut, bukan sekadar dugaan.

| Skenario | Hasil yang diamati |
|---|---|
| Register dengan email yang sudah dipakai | 409 |
| Register dengan password tanpa angka | 422 |
| Register dengan `role: "admin"` | 422 |
| Register dengan format email salah | 422 |
| Login dengan password salah | 401 |
| Login dengan email yang tidak ada | 401 |
| Login akun `suspended` | 403 |
| Endpoint privat tanpa token | 401 |
| Token rusak | 401 |
| Token milik akun yang baru di-suspend | 401 |
| Tenant mengakses `/api/owner/...` | 403 |
| Owner mengakses `/api/admin/...` | 403 |
| Admin mengubah status akun admin | 403 |
| Owner A membuka properti milik owner B | 404 |
| Owner A memutuskan booking di properti owner B | 404 |
| Owner A memverifikasi pembayaran owner B | 404 |
| Penyewa lain membuka detail booking orang lain | 404 |
| Tamu membuka properti yang belum `approved` | 404 |
| Booking dengan `start_date` kemarin | 422 |
| Booking dengan durasi 0 atau 25 bulan | 422 |
| Booking dengan catatan lebih dari 300 karakter | 422 |
| Dua booking paralel pada kamar & tanggal yang sama | satu 201, satu 409 |
| Booking pada kamar `MAINTENANCE` / `INACTIVE` | 409 |
| Unggah berkas `.txt` yang dinamai `.jpg` (magic bytes tidak cocok) | 415 |
| Unggah berkas lebih dari 2 MB | 413 |
| Unggah bukti pembayaran saat booking masih `PENDING` | 409 |
| Unggah bukti kedua saat masih ada pembayaran `PENDING` | 409 |
| Approve pembayaran setelah `expires_at` lewat | 409 |
| Approve booking yang bukan `PENDING` | 409 |
| Tolak properti / booking / pembayaran tanpa catatan | 422 |
| Menyetel status kamar ke `RESERVED`/`OCCUPIED` secara manual | 422 |
| Menghapus kamar yang punya riwayat booking | 409 |
| Menghapus properti yang punya kamar ber-riwayat booking | 409 |
| Harga kamar negatif | 422 |
| Nomor kamar kembar dalam satu properti | 409 |
| Melapor kerusakan untuk booking yang belum `CONFIRMED` | 409 |
| Judul laporan kurang dari 3 karakter | 422 |
| ID bukan UUID | 422 |
| Endpoint yang tidak ada | 404 |
| JSON rusak | 400 |

## Bug yang ditemukan dan diperbaiki saat pengujian

Tiga masalah ini muncul dari pengujian, bukan dari membaca kode saja.

1. **Rute gambar pemilik selalu 422.** `/api/owner/images/:imageId` memakai validator
   parameter `id`, padahal nama parameternya `imageId`, sehingga nilai yang divalidasi
   selalu kosong. Diperbaiki dengan skema `imageIdParamSchema`; sesudah itu hapus gambar
   dan jadikan cover berjalan normal.

2. **Detail booking tidak bisa dibaca pemilik dan admin.** Router booking memasang
   `requireRole('tenant')` untuk seluruh rute, termasuk `GET /api/bookings/:id`, padahal
   kontrak membolehkan penyewa, pemilik kamar, dan admin. Akibatnya pemilik mendapat 403.
   Diperbaiki dengan memindahkan rute detail ke atas penjaga peran; kepemilikan tetap
   diperiksa di service sehingga pihak lain mendapat 404.

3. **Batas percobaan login tidak bisa diatur.** Angka 10 tertulis langsung di kode,
   sehingga rangkaian uji otomatis saling menolak dengan 429. Sekarang dibaca dari
   `LOGIN_RATE_LIMIT` dengan nilai bawaan tetap 10.

## Bukti tambahan

- Dua belas uji unggah berkas lulus: foto kamar 201 dan URL publiknya 200; berkas palsu
  400/415; dokumen pemilik 201; tautan bertanda tangan 200; tanda tangan dipalsukan 403;
  tautan kedaluwarsa 403.
- Uji balapan booking dijalankan dengan dua permintaan paralel ke kamar dan tanggal yang
  sama; hanya satu menerima 201 dan satunya 409 (dikunci dengan `SELECT ... FOR UPDATE`).
- Seluruh query memakai parameter `$1, $2, ...`; tidak ada input pengguna yang disambung
  ke string SQL.

## Yang belum diuji

- **Driver Cloudinary.** Semua uji memakai `STORAGE_DRIVER=local`. Jalur Cloudinary sudah
  ditulis tetapi belum pernah dijalankan terhadap akun Cloudinary sungguhan.
- **Deploy ke Render dan database Aiven.** Pengujian memakai PostgreSQL lokal. Koneksi SSL
  dengan `DB_CA_CERT` belum dicoba ke Aiven.
- **Pengujian beban.** Tidak ada uji jumlah permintaan bersamaan di luar dua booking
  paralel di atas.
