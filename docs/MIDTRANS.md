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

Kunci client juga mengikuti lingkungannya: sandbox memakai `SB-Mid-client-...`.
SDK Android memilih lingkungan dari prefiks kunci itu, jadi kunci produksi tidak
bisa membuka token sandbox — `lib/core/midtrans_payment.dart` menolak kombinasi
itu lebih awal dengan pesan yang menyebut sebabnya.

### Di Vercel (backend production)

Isi lewat **Project → Settings → Environment Variables**, atau dari terminal:

```bash
npx vercel env add MIDTRANS_IS_PRODUCTION production --value "false"
npx vercel env add MIDTRANS_SERVER_KEY production
npx vercel env add MIDTRANS_SIGNATURE_KEY production
npx vercel env add MIDTRANS_NOTIFICATION_URL production \
  --value "https://hunikosbackend.vercel.app/api/midtrans/notification"
```

`MIDTRANS_CLIENT_KEY` tidak perlu di Vercel: backend tidak pernah memakainya,
hanya aplikasi Flutter yang membutuhkan. `MIDTRANS_NOTIFICATION_URL` dikirim
sebagai header `X-Override-Notification` setiap kali transaksi dibuat, sehingga
URL notifikasi tidak bergantung pada pengaturan di dashboard Midtrans.

Kalau `MIDTRANS_SERVER_KEY` kosong, `POST /api/bookings/:id/payments/midtrans`
menjawab **500** dengan pesan generik di klien; log function mencatat
`MIDTRANS_SERVER_KEY belum diisi`. Endpoint lain tetap normal.

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
