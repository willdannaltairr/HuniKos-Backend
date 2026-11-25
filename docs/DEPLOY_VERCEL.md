# Deploy backend ke Vercel

Backend ini adalah aplikasi Express 5 yang dijalankan sebagai satu **serverless function**
di Vercel. Berkas `index.ts` di root hanya mengekspor aplikasi Express, dan Vercel
mendeteksinya otomatis — tidak perlu konfigurasi rute.

## 1. Yang sudah disiapkan di repo

| Berkas | Isi |
|---|---|
| `index.ts` | mengekspor `createApp()` sebagai default |
| `vercel.json` | `maxDuration` 60 detik dan region `sin1` (opsional, hanya penyetelan) |

`src/server.ts` tetap dipakai untuk lokal (`npm run dev`) dan tidak dijalankan di Vercel.

**Jangan menaruh aplikasi di `api/index.ts`.** Semua path di sana akan diberi prefiks
`/api`, sehingga `/api/health` menjadi `/api/api/health` dan seluruh endpoint rusak.

## 2. Kelebihan dan kekurangan dibanding VPS

**Bisa dipakai** untuk backend ini, dengan batasan:

- Setiap request dibungkus function; tidak ada proses yang hidup terus seperti `npm start`.
- Ukuran body request dibatasi **4,5 MB** (free plan). Unggahan foto dibatasi 2 MB, jadi aman.
- Tidak ada disk tetap: semua gambar sudah disimpan di Cloudinary, jadi tidak masalah.
- Paket gratis cukup untuk demo ujian; cold start pertama bisa beberapa detik.

## 3. Isi environment variable

Buka **Project → Settings → Environment Variables**, lalu tambahkan:

| Variable | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb` |
| `DB_CA_CERT` | **seluruh isi** `certs/aiven-ca.pem` (tempel multi-baris) |
| `DB_POOL_MAX` | `3` |
| `JWT_SECRET` | minimal 32 karakter acak |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGINS` | domain website + `http://localhost:3000` |
| `BASE_URL` | `https://nama-project.vercel.app` |
| `CLOUDINARY_CLOUD_NAME` | dari dashboard Cloudinary |
| `CLOUDINARY_API_KEY` | dari dashboard Cloudinary |
| `CLOUDINARY_API_SECRET` | dari dashboard Cloudinary |

`PORT` tidak perlu diisi; Vercel mengurusnya sendiri.

**Jangan memakai `DB_CA_CERT_PATH` di Vercel.** Berkas `certs/aiven-ca.pem` masuk
`.gitignore`, jadi tidak ikut terunggah ke Vercel dan path-nya akan gagal dibaca. Isi
`DB_CA_CERT` dengan isi berkas itu.

## 4. Deploy

### 4a. Pilih branch yang benar (penyebab 404 paling sering)

Vercel membangun **Production Branch**, dan defaultnya `main`. Di repo ini `main` hanya
berisi dokumen (`AGENTS.md`, `README.md`, `docs/`), tanpa `package.json` dan tanpa `src/`.
Akibatnya deployment berhasil tetapi tidak ada aplikasi di dalamnya, dan **semua path
menjawab `404 NOT_FOUND`** — termasuk `/api/health`.

Perbaiki di **Project → Settings → Git → Production Branch**, lalu:

- pilih branch yang memuat kode backend (misalnya `develop` setelah PR di-merge), lalu
  **Redeploy** deployment terakhir dari tab *Deployments*;
- atau, untuk sementara, arahkan ke branch fitur yang sedang dipakai dan pastikan branch itu
  sudah di-push ke GitHub.

Setelah branch benar, Vercel mendeteksi `index.ts` di root dan membuat satu function.

### 4b. Import repo

1. <https://vercel.com/new> → **Import Git Repository** → pilih repo `HuniKos-Backend`.
2. Framework Preset: **Other**. Root Directory: biarkan kosong.
3. Build Command: biarkan kosong. Output Directory: biarkan kosong.
4. Tambahkan environment variable dari langkah 3, lalu **Deploy**.

Lewat terminal (opsional):

```bash
npm i -g vercel
vercel login
vercel --prod
```

## 5. Periksa hasilnya

```bash
curl https://nama-project.vercel.app/api/health
```

Harus menjawab:

```json
{ "success": true, "message": "Server dan database sehat", "data": { "status": "ok" } }
```

Kalau gagal, buka **Deployments → Functions → Logs**. Penyebab yang paling sering:

| Gejala | Penyebab | Tindakan |
|---|---|---|
| Function langsung gagal, log menyebut environment | ada variable wajib yang kosong | lengkapi `DATABASE_URL`, `JWT_SECRET`, tiga kunci Cloudinary |
| `Sertifikat CA wajib diisi di produksi` | `DB_CA_CERT` kosong saat `NODE_ENV=production` | tempel isi `ca.pem` |
| `self-signed certificate in certificate chain` | CA tidak dipakai | periksa `DB_CA_CERT` benar-benar berisi sertifikat Aiven |
| `password authentication failed` | password tersalin kurang | salin ulang dari console Aiven |
| 404 `NOT_FOUND` pada **semua** path, termasuk `/api/health` | Production Branch menunjuk branch tanpa kode (biasanya `main` yang hanya berisi dokumen) | ubah Production Branch ke branch berisi `package.json` + `src/`, lalu Redeploy |
| `/api/health` 404 tetapi `/api/api/health` ada | aplikasi ditaruh di `api/index.ts`, sehingga semua path diberi prefiks `/api` | pindahkan ke `index.ts` di root |
| Hanya function tertentu 404 | `index.ts` belum ikut ter-commit | `git add index.ts vercel.json`, commit, push |

## 6. Setelah backend online

Arahkan aplikasi Flutter ke domain Vercel:

```bash
flutter run -d chrome --dart-define=API_BASE_URL=https://nama-project.vercel.app
```

Untuk build rilis:

```bash
flutter build web --release --dart-define=API_BASE_URL=https://nama-project.vercel.app
```

Dan tambahkan domain website ke `CORS_ORIGINS` di Vercel supaya browser tidak menolak
response.
