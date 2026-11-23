# Panduan Deploy Backend ke Render

Panduan ini menempatkan API HUNIKOS di Render (free web service) dengan database
PostgreSQL dari Aiven. Semua langkah di bawah sudah disesuaikan dengan struktur repo:
kodenya ada di folder `api/`, jadi **Root Directory** di Render harus diisi `api`.

## Yang perlu disiapkan

- Repo GitHub yang sudah berisi folder `api/` (branch `develop` setelah PR di-merge).
- Akun Render (gratis, tanpa kartu kredit).
- Service PostgreSQL di Aiven (free plan) yang sudah aktif.
- Node.js dan `npm` di komputer untuk menjalankan migration ke database Aiven.

## 1. Ambil kredensial database dari Aiven

1. Buka console Aiven, pilih service PostgreSQL, lalu buka tab **Overview**.
2. Salin **Service URI**. Bentuknya seperti:
   ```text
   postgres://avnadmin:PASSWORD@nama-service.aivencloud.com:12345/defaultdb
   ```
   URI ini **jangan** ditambah `?sslmode=...`; SSL diatur oleh kode lewat `DB_CA_CERT`.
3. Unduh **CA Certificate** (`ca.pem`) dari halaman yang sama. Isi berkas itu akan dipakai
   sebagai nilai `DB_CA_CERT`.

## 2. Buat web service di Render

1. Masuk ke [dashboard.render.com](https://dashboard.render.com), klik **New → Web Service**.
2. Hubungkan repo GitHub HUNIKOS.
3. Isi form berikut:

| Kolom | Nilai |
|---|---|
| Name | `hunikos-api` (bebas) |
| Language | `Node` |
| Branch | `develop` (atau `main` setelah rilis) |
| **Root Directory** | `api` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | `Free` |

Root Directory wajib `api`, karena `package.json` backend ada di sana. Kalau dikosongkan,
Render tidak menemukan `package.json` dan build gagal.

## 3. Isi environment variable

Tambahkan satu per satu di tab **Environment** sebelum deploy pertama:

| Nama | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Service URI Aiven dari langkah 1 (tanpa `?sslmode=`) |
| `DB_CA_CERT` | Seluruh isi `ca.pem`. Boleh ditempel dalam satu baris; kode akan mengubah `\n` literal menjadi baris baru |
| `DB_POOL_MAX` | `5` (free plan Aiven membatasi 20 koneksi) |
| `JWT_SECRET` | String acak **minimal 32 karakter**. Jangan pakai contoh di `.env.example` |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGINS` | Domain website, contoh `https://hunikos.vercel.app,http://localhost:3000` |
| `BASE_URL` | URL Render service ini, contoh `https://hunikos-api.onrender.com` |
| `STORAGE_DRIVER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | Dari dashboard Cloudinary |
| `CLOUDINARY_API_KEY` | Dari dashboard Cloudinary |
| `CLOUDINARY_API_SECRET` | Dari dashboard Cloudinary |
| `LOGIN_RATE_LIMIT` | `10` (boleh dihilangkan, nilai bawaan sudah 10) |

`PORT` tidak perlu diisi; Render menyuntikkannya sendiri.

**Mengapa `STORAGE_DRIVER` harus `cloudinary` di produksi:** sistem berkas layanan gratis
Render bersifat sementara. Setiap redeploy atau restart menghapus isi `uploads/`, sehingga
foto properti dan bukti transfer akan hilang bila disimpan lokal.

**Cara menaruh `ca.pem` pada `DB_CA_CERT`:** buka `ca.pem` di editor teks, salin seluruh
isinya termasuk baris `-----BEGIN CERTIFICATE-----` dan `-----END CERTIFICATE-----`, lalu
tempel utuh ke kolom nilai. Kalau dashboard menolak baris baru, ganti setiap baris baru
dengan tulisan `\n` — kode di `src/config/db.ts` mengubahnya kembali menjadi baris baru
sebelum dipakai.

## 4. Jalankan migration dan seed

Langkah ini dijalankan **dari komputer**, bukan dari Render, dan mengarah ke database Aiven.
Jangan menjalankan `node-pg-migrate` sebagai build command, karena setiap deploy akan
mengulang migration.

Di PowerShell (Windows):

```powershell
$env:DATABASE_URL = "postgres://avnadmin:PASSWORD@host-aiven:12345/defaultdb"
$env:DB_CA_CERT = Get-Content ca.pem -Raw
npm run migrate:up
npm run seed
```

Di bash/Linux/macOS:

```bash
export DATABASE_URL="postgres://avnadmin:PASSWORD@host-aiven:12345/defaultdb"
export DB_CA_CERT="$(cat ca.pem)"
npm run migrate:up
npm run seed
```

Migration membuat 10 tabel sesuai kontrak; seed mengisi akun uji dan data contoh. Keduanya
menggunakan kredensial yang sama dengan yang nanti dipakai Render, jadi cukup dijalankan
sekali.

## 5. Verifikasi

Setelah deploy selesai (status **Live**):

```bash
curl https://hunikos-api.onrender.com/api/health
```

Hasil yang diharapkan:

```json
{ "success": true, "message": "Server dan database sehat", "data": { "status": "ok" } }
```

Lalu uji login akun seed:

```bash
curl -X POST https://hunikos-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@hunikos.test\",\"password\":\"Admin123!\"}"
```

Kalau dua permintaan itu berhasil, backend siap dipakai website dan aplikasi mobile.

## Hal yang perlu diketahui soal free plan

- **Layanan tidur setelah 15 menit tanpa trafik** dan butuh sekitar satu menit untuk bangun.
  Buka `/api/health` beberapa menit sebelum presentasi supaya permintaan pertama tidak
  menggantung.
- **Disk bersifat sementara.** Semua berkas di `uploads/` hilang saat redeploy atau restart;
  karena itu produksi memakai Cloudinary.
- **Free Postgres milik Render kedaluwarsa setelah 30 hari.** Di proyek ini database memakai
  Aiven, jadi batas itu tidak berlaku.
- Render boleh me-restart layanan gratis kapan saja. Jangan menyimpan state di memori proses.
- `BASE_URL` harus diisi URL Render yang sebenarnya, karena nilai ini dipakai membentuk
  `image_url` saat driver lokal dipakai. Bila `STORAGE_DRIVER=cloudinary`, nilai ini tidak
  memengaruhi URL gambar, tetapi tetap diisi agar konsisten.

## Jika deploy gagal

| Gejala | Penyebab yang paling sering | Tindakan |
|---|---|---|
| Build gagal: `package.json` tidak ditemukan | Root Directory kosong | Isi Root Directory dengan `api` |
| Server berhenti: `DB_CA_CERT wajib diisi di produksi` | `DB_CA_CERT` kosong saat `NODE_ENV=production` | Tempel isi `ca.pem` |
| Server berhenti: `JWT_SECRET minimal 32 karakter` | Rahasia terlalu pendek | Buat string acak baru minimal 32 karakter |
| Request pertama lambat sekitar satu menit | Layanan gratis sedang bangun | Tunggu, lalu ulangi |
| Gambar hilang setelah deploy | `STORAGE_DRIVER=local` di produksi | Ganti ke `cloudinary` dan isi tiga kunci Cloudinary |
| Login dari website gagal karena CORS | `CORS_ORIGINS` belum memuat domain website | Tambahkan domain persis, termasuk `https://` |
