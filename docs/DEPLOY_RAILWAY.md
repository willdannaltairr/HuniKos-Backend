# Panduan Deploy Backend ke Railway

Panduan ini menempatkan API HUNIKOS di Railway dengan database PostgreSQL dari Aiven
(lihat [`DEPLOY_AIVEN.md`](DEPLOY_AIVEN.md)). Kodenya ada di root repo, jadi **Root
Directory** di Railway dibiarkan kosong.

## Yang perlu disiapkan

- Repo GitHub HUNIKOS (branch `develop` setelah PR di-merge).
- Akun Railway yang sudah terhubung ke GitHub.
- Service PostgreSQL Aiven yang sudah aktif, beserta `DATABASE_URL` dan `ca.pem`.
- Node.js dan `npm` di komputer, untuk menjalankan seed ke database Aiven.

## 1. Buat service dari repo GitHub

1. Buka [railway.com/new](https://railway.com/new).
2. Pilih **Deploy from GitHub repo**, lalu pilih repo HUNIKOS.
3. Kalau akun Railway belum terhubung ke GitHub, ikuti dialog otorisasinya lebih dulu.

Railway mendeteksi proyek Node.js secara otomatis (lewat Railpack), jadi tidak perlu
menulis Dockerfile. Build memakai `npm install` dan start memakai `npm start` dari
`package.json` — pastikan keduanya ada di root repo, bukan di subfolder.

**Jangan menambahkan layanan PostgreSQL Railway.** Database tetap Aiven, sesuai keputusan
di kontrak. Layanan database Railway hanya akan membuat dua sumber data yang berbeda.

## 2. Isi environment variable

Buka service → tab **Variables** → **Raw Editor** (tempel sekaligus, lebih cepat daripada
menambah satu per satu):

| Nama | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Service URI Aiven, tanpa `?sslmode=` |
| `DB_CA_CERT` | Seluruh isi `ca.pem` |
| `DB_POOL_MAX` | `5` |
| `JWT_SECRET` | String acak **minimal 32 karakter**, baru — jangan pakai yang di `.env` lokal |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGINS` | Domain website + `http://localhost:3000` |
| `BASE_URL` | URL publik Railway (diisi setelah langkah 3), misalnya `https://hunikos-api-production.up.railway.app` |
| `STORAGE_DRIVER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | Dari dashboard Cloudinary |
| `CLOUDINARY_API_KEY` | Dari dashboard Cloudinary |
| `CLOUDINARY_API_SECRET` | Dari dashboard Cloudinary |

`PORT` **tidak perlu** diisi. Railway menyuntikkannya sendiri dan aplikasi sudah membaca
`process.env.PORT` lewat `src/config/env.ts`.

**Cara menaruh `ca.pem` pada `DB_CA_CERT`:** buka `ca.pem` di editor teks, salin seluruh
isinya termasuk baris `-----BEGIN CERTIFICATE-----` dan `-----END CERTIFICATE-----`.
Kalau kolomnya menolak baris baru, ganti setiap baris baru dengan `\n` — kode di
`src/config/db.ts` mengubahnya kembali menjadi baris baru.

**Mengapa gambar disimpan di Cloudinary:** aplikasi tidak menyimpan file di disk server,
semua foto properti, bukti transfer, dan avatar diunggah ke Cloudinary. Dengan begitu
gambar tetap ada walaupun container di-deploy ulang.

## 3. Buka domain publik

1. Buka service → tab **Settings** → bagian **Networking**.
2. Klik **Generate Domain**.
3. Salin URL yang muncul (`https://<nama-service>-production.up.railway.app`).
4. Kembali ke tab **Variables**, isi `BASE_URL` dengan URL itu, lalu simpan.

Tanpa langkah ini aplikasi tetap berjalan, tetapi tidak bisa diakses dari luar dan
`image_url` driver lokal akan salah bentuk.

## 4. Atur health check

Masih di tab **Settings** → bagian **Deploy**, isi **Healthcheck Path** dengan:

```text
/api/health
```

Railway akan menunggu endpoint ini menjawab `2xx` sebelum menganggap deploy baru aktif.
Kalau gagal dalam batas waktunya (bawaan 300 detik), deploy ditandai gagal.

## 5. Jalankan seed ke database Aiven

Langkah ini dijalankan **dari komputer**, bukan dari Railway. Jangan menjadikan seed
sebagai build command, karena setiap deploy akan mengulanginya.

Cara paling sederhana: buka `docs/seed.sql` di pgAdmin yang sudah terhubung ke Aiven, lalu
tekan **F5**. Aman dijalankan dua kali.

Alternatif lewat terminal, kalau lebih suka Node.js — isi `.env` dulu dengan `DATABASE_URL`
dan `DB_CA_CERT` Aiven, lalu:

```bash
npm install
npm run seed
```

Hasil yang benar:

```text
Admin  : admin@hunikos.test / Admin123!
Owner  : owner1@hunikos.test, owner2@hunikos.test / Owner123!
Tenant : tenant1@hunikos.test, tenant2@hunikos.test, tenant3@hunikos.test / Tenant123!
```

## 6. Verifikasi

Setelah deploy berstatus aktif:

```bash
curl https://<nama-service>-production.up.railway.app/api/health
```

Hasil yang diharapkan:

```json
{ "success": true, "message": "Server dan database sehat", "data": { "status": "ok" } }
```

Lalu uji login akun seed:

```bash
curl -X POST https://<nama-service>-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@hunikos.test\",\"password\":\"Admin123!\"}"
```

Kalau dua permintaan itu berhasil, backend siap dipakai website dan aplikasi mobile.

## Setiap kali kode berubah

Railway otomatis deploy ulang saat ada push ke branch yang terhubung. Kalau ingin memicu
manual: service → **Deploy** → **Redeploy**.

Untuk melihat apa yang terjadi saat deploy, buka tab **Deployments** lalu **View Logs**.
Log inilah tempat pesan seperti `Koneksi database berhasil.` atau
`DB_CA_CERT wajib diisi di produksi` muncul.

## Hal yang perlu diketahui

- **Aplikasi berhenti bila konfigurasi produksi tidak lengkap.** `src/config/env.ts`
  menolak start kalau `NODE_ENV=production` dan `DB_CA_CERT` kosong. Itu pengaman, bukan
  bug: tanpa sertifikat, Aiven menolak koneksi.
- **Container bisa di-restart kapan saja.** Jangan menyimpan state di memori proses.
- **Kuota dan harga mengikuti paket akunmu.** Buka halaman *Usage* / *Plans* di dashboard
  Railway untuk angka yang berlaku sekarang; angka di sana yang menentukan seberapa lama
  layanan ini bisa berjalan.
- **Database tetap di Aiven.** Kalau koneksi tiba-tiba gagal padahal kredensial benar, cek
  status service di console Aiven lebih dulu sebelum menuduh Railway.

## Jika deploy gagal

| Gejala | Penyebab yang paling sering | Tindakan |
|---|---|---|
| Build gagal: `package.json` tidak ditemukan | Root Directory diisi subfolder | kosongkan Root Directory |
| Deploy gagal sebelum aktif | `/api/health` tidak menjawab `2xx` | cek **View Logs**; biasanya `DB_CA_CERT` atau `JWT_SECRET` kosong |
| Server berhenti: `DB_CA_CERT wajib diisi di produksi` | `DB_CA_CERT` kosong saat `NODE_ENV=production` | tempel isi `ca.pem` |
| Server berhenti: `JWT_SECRET minimal 32 karakter` | rahasia terlalu pendek | buat string acak baru minimal 32 karakter |
| `password authentication failed for user "avnadmin"` | password Aiven kurang lengkap saat disalin | salin ulang dari Overview Aiven |
| `self-signed certificate in certificate chain` | CA cert tidak dipakai | isi `DB_CA_CERT` |
| `too many clients already` | pool terlalu besar | turunkan `DB_POOL_MAX` |
| URL publik membuka halaman kosong | domain belum di-generate | Settings → Networking → **Generate Domain** |
| Gambar hilang setelah deploy ulang | `STORAGE_DRIVER=local` | ganti ke `cloudinary` + tiga kunci Cloudinary |
| Login dari website gagal karena CORS | `CORS_ORIGINS` belum memuat domain website | tambahkan domain persis, termasuk `https://` |
