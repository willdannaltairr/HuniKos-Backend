# Pembayaran Midtrans Snap

HuniKos memakai Midtrans Snap sebagai satu-satunya metode pembayaran. Upload bukti
transfer manual sudah tidak dipakai.

## Alur

1. Penyewa menekan tombol **Bayar** pada detail booking berstatus
   `AWAITING_PAYMENT`.
2. Aplikasi memanggil `POST /api/bookings/:id/payments/midtrans`. Backend
   membuat satu baris `payments` berstatus `PENDING`, lalu membuat transaksi Snap
   dan mengembalikan `snap_token` serta `redirect_url`.
3. Android menampilkan halaman Snap lewat `midtrans_sdk`. Web membuka
   `redirect_url` di tab baru, karena paket itu tidak mendukung web.
4. Midtrans mengirim notifikasi ke `POST /api/midtrans/notification`. Backend
   memeriksa `signature_key`, lalu menyamakan status ke `payments` dan `bookings`.
5. Bila notifikasi terlambat atau tidak sampai (misalnya saat development
   memakai localhost), aplikasi memanggil
   `GET /api/bookings/:id/payments/midtrans/status` yang menanyakan status
   langsung ke Midtrans.

Ketika pembayaran berhasil (`settlement` atau `capture`, dan `fraud_status`
`accept` bila ada), backend menulis `payments.status = VERIFIED`, mengubah
booking menjadi `CONFIRMED`, mencatat histori, dan mengubah kamar menjadi
`OCCUPIED`. Semua langkah itu berada dalam satu transaksi database.

## Variabel lingkungan

Isi pada `.env` (lihat `.env.example`):

| Variabel | Fungsi |
|---|---|
| `MIDTRANS_IS_PRODUCTION` | `false` untuk sandbox, `true` untuk produksi |
| `MIDTRANS_SERVER_KEY` | Dipakai backend untuk membuat transaksi dan menanyakan status |
| `MIDTRANS_SIGNATURE_KEY` | Dipakai untuk memeriksa notifikasi; bila kosong, memakai server key |
| `MIDTRANS_CLIENT_KEY` | Dibutuhkan aplikasi, tapi disimpan di sisi Flutter |
| `MIDTRANS_NOTIFICATION_URL` | Opsional; menimpa URL notifikasi dari dashboard |

Untuk sandbox, `MIDTRANS_SERVER_KEY` dan `MIDTRANS_SIGNATURE_KEY` sama-sama
memakai kunci `SB-Mid-server-...`. Kunci `Mid-server-...` hanya berlaku di
produksi; memakainya pada transaksi sandbox membuat verifikasi notifikasi gagal.

## Menjalankan migrasi

Kolom Midtrans ditambahkan oleh `database/migrations/12_midtrans_payments.sql`.
Jika database dikelola manual lewat pgAdmin, jalankan bagian `-- Up Migration`
dari berkas itu. Bagian `-- Down Migration` hanya dipakai untuk membatalkan.

## Menyiapkan notifikasi

Midtrans tidak bisa mengirim notifikasi ke `localhost`. Untuk development,
pakai tunneling (misalnya `ngrok http 3001`), lalu isi **Payment Notification
URL** di MAP dengan `https://<domain>/api/midtrans/notification`. Endpoint ini
sengaja tidak memakai auth aplikasi, tetapi menolak tanda tangan yang salah
dengan HTTP 401.

## Endpoint baru

| Method | Path | Akses | Fungsi |
|---|---|---|---|
| POST | `/api/bookings/:id/payments/midtrans` | tenant | Membuat transaksi Snap |
| GET | `/api/bookings/:id/payments/midtrans/status` | tenant | Menyinkronkan status dari Midtrans |
| POST | `/api/midtrans/notification` | publik bersignature | Menerima notifikasi Midtrans |

Nominal selalu diambil dari `bookings.total_amount` di backend, bukan dari
aplikasi.
