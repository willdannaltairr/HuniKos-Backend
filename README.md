# HUNIKOS Backend

REST API platform pencarian dan pengelolaan rumah kos untuk UMKM pemilik kos. Dipakai oleh
website Next.js dan aplikasi mobile Flutter.

- Kontrak API + database (sumber kebenaran): [`docs/00_KONTRAK_BERSAMA.md`](docs/00_KONTRAK_BERSAMA.md)
- Aturan branch & commit: [`AGENTS.md`](AGENTS.md) — panduan lengkap di [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md)
- Hasil pengujian yang benar-benar dijalankan: [`docs/hasil-pengujian.md`](docs/hasil-pengujian.md)
- Panduan deploy backend: [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md)
- Panduan database: [`docs/DEPLOY_AIVEN.md`](docs/DEPLOY_AIVEN.md)

## Stack

| Bagian | Pilihan |
|---|---|
| Runtime | Node.js 20+ (LTS) |
| Framework | Express 5, TypeScript ESM (`"type": "module"`) |
| Database | PostgreSQL di Aiven, `pg` tanpa ORM |
| Migrasi | `node-pg-migrate` (file `.sql`) |
| Validasi | `zod@3` |
| Auth | JWT HS256 + `bcryptjs` |
| Upload | `multer` → **Cloudinary** (tidak ada file yang disimpan di disk server) |
| Hosting | Vercel |

## Struktur repo

```text
.
├─ AGENTS.md                    # aturan kerja yang dibaca otomatis tiap sesi
├─ .env.example                 # daftar semua variabel environment
├─ certs/                       # ca.pem Aiven (di-gitignore)
├─ docs/
│  ├─ 00_KONTRAK_BERSAMA.md      # kontrak API + database
│  ├─ DEPLOY_AIVEN.md            # panduan database ke Aiven
│  ├─ DEPLOY_VERCEL.md           # panduan deploy backend ke Vercel
│  ├─ GIT_WORKFLOW.md            # alur branch, commit, issue, PR
│  └─ hasil-pengujian.md         # hasil uji nyata + kasus negatif
├─ index.ts                     # titik masuk Vercel (mengekspor aplikasi Express)
├─ database/                     # semua berkas database ada di sini
│  ├─ migrations/                # 1_users.sql ... 12_midtrans_payments.sql
│  ├─ schema.sql                 # skema lengkap, siap dijalankan di pgAdmin
│  ├─ seed.sql                   # akun uji + data contoh, siap dijalankan di pgAdmin
│  └─ scripts/
│     ├─ migrate.ts              # jalankan migration (membaca SSL dari .env)
│     └─ seed.ts                 # data contoh, aman dijalankan berulang
├─ api.http                      # koleksi REST Client: semua endpoint
├─ vercel.json                   # konfigurasi serverless function Vercel
├─ src/
│  ├─ app.ts                     # susun middleware & route
│  ├─ server.ts                  # listen + cek koneksi database
│  ├─ config/                    # env.ts (baca env), db.ts (pool, type parser)
│  ├─ middlewares/               # auth, requireRole, validate, upload, errorHandler
│  ├─ types/                     # tipe domain bersama + augmentasi Express
│  ├─ utils/                     # response, HttpError, storage (Cloudinary), bookingRules
│  └─ modules/                   # auth, users, facilities, properties, rooms,
│                                # bookings, payments, maintenance, owner, admin
└─ .github/
   ├─ ISSUE_TEMPLATE/            # template fitur, bug, tugas
   └─ pull_request_template.md
```

Seluruh kode sumber ditulis **TypeScript** dan dijalankan langsung dengan `tsx`
(tanpa langkah build saat pengembangan). Setiap modul berisi pasangan `*.routes.ts`
(definisi route + middleware), `*.service.ts` (SQL dan logika), dan `*.schema.ts`
(validasi `zod`). Tidak ada lapisan controller terpisah.

## Menjalankan di lokal

Prasyarat: Node.js 20+, satu database PostgreSQL (Aiven, atau PostgreSQL lokal milikmu),
dan akun Cloudinary untuk penyimpanan gambar.

1. Siapkan `.env` dari contoh:

```bash
cp .env.example .env
```

2. Isi nilai berikut (lihat penjelasan tiap baris di `.env.example`):

```bash
DATABASE_URL=postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb
DB_CA_CERT_PATH=certs/aiven-ca.pem
JWT_SECRET=<string acak minimal 32 karakter>
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<api key>
CLOUDINARY_API_SECRET=<api secret>
```

`DB_CA_CERT_PATH` dipakai bila sertifikat Aiven ada sebagai berkas di `certs/`.
Kalau server tidak punya berkasnya (mis. Vercel), isi `DB_CA_CERT` dengan seluruh
isi `ca.pem`.

Untuk PostgreSQL lokal tanpa SSL, kosongkan kedua variabel CA dan cukup isi
`DATABASE_URL=postgres://postgres@127.0.0.1:5432/hunikos_test`.

3. Pasang dependensi, isi database, lalu jalankan:

```bash
npm install
npm run migrate:up
npm run seed
npm run dev
```

Server berjalan di `http://localhost:3000`. Cek koneksi database:

```bash
curl http://localhost:3000/api/health
```

Contoh hasil:

```json
{ "success": true, "message": "Server dan database sehat", "data": { "status": "ok" } }
```

Perintah lain yang tersedia:

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | jalankan server dengan `tsx watch` (auto restart) |
| `npm start` | jalankan server sekali jalan |
| `npm run build` | kompilasi TypeScript ke `dist/` |
| `npm run typecheck` | periksa tipe tanpa menulis berkas |
| `npm run migrate:up` | jalankan semua migration |
| `npm run migrate:down` | batalkan migration terakhir |
| `npm run seed` | isi akun uji dan data contoh (idempotent) |

## Akun uji

Dibuat oleh `npm run seed`, sesuai kontrak bagian 10.

| Role | Email | Password |
|---|---|---|
| admin | `admin@hunikos.test` | `Admin123!` |
| owner | `owner1@hunikos.test`, `owner2@hunikos.test` | `Owner123!` |
| tenant | `tenant1@hunikos.test`, `tenant2@hunikos.test`, `tenant3@hunikos.test` | `Tenant123!` |

Akun ini hanya untuk pengembangan dan ujian. Hapus atau ganti sebelum dipakai sungguhan.

## Daftar endpoint

Semua respons memakai amplop `{ success, message, data?, meta?, errors? }`.

| Modul | Endpoint |
|---|---|
| Auth & profil | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/users/me`, `POST /api/users/me/avatar`, `GET /api/health` |
| Publik | `GET /api/facilities`, `GET /api/properties`, `GET /api/properties/:id`, `GET /api/rooms/:id` |
| Penyewa | `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/:id`, `PATCH /api/bookings/:id/cancel`, `POST /api/bookings/:id/payments`, `GET /api/payments`, `POST /api/maintenance`, `GET /api/maintenance` |
| Pemilik | `GET /api/owner/dashboard`, `GET/POST /api/owner/properties`, `PUT/DELETE /api/owner/properties/:id`, `POST /api/owner/properties/:id/images`, `DELETE /api/owner/images/:imageId`, `PATCH /api/owner/images/:imageId/cover`, `GET/POST /api/owner/properties/:id/rooms`, `PUT/DELETE /api/owner/rooms/:id`, `GET /api/owner/bookings`, `PATCH /api/owner/bookings/:id/decision`, `PATCH /api/owner/bookings/:id/complete`, `GET /api/owner/payments`, `PATCH /api/owner/payments/:id/verify`, `GET /api/owner/maintenance`, `PATCH /api/owner/maintenance/:id` |
| Admin | `GET /api/admin/dashboard`, `GET /api/admin/users`, `PATCH /api/admin/users/:id/status`, `GET /api/admin/properties`, `PATCH /api/admin/properties/:id/verification` |

Rincian body, query, dan bentuk response ada di kontrak bagian 8 dan 9. Contoh request untuk
setiap endpoint ada di `api.http` (buka di VS Code dengan ekstensi **REST Client**, lalu
jalankan dari atas ke bawah).

## Gambar dan upload

Semua gambar (foto properti, bukti transfer, foto laporan, avatar) diunggah ke Cloudinary
dan yang disimpan di database hanya URL dan `public_id`. Tidak ada folder `uploads/`.
Multer tetap memeriksa ukuran (maksimal 2 MB) dan isi berkas lewat magic bytes, supaya file
yang bukan jpg/png/webp ditolak sebelum dikirim ke Cloudinary.

## Menguji

Ringkasan hasil terakhir: **198/198 lulus, 0 gagal**, mencakup 39 kasus negatif. Rincian per
rangkaian dan daftar yang belum diuji ada di [`docs/hasil-pengujian.md`](docs/hasil-pengujian.md).

Batas percobaan login bawaan 10 per IP per 15 menit. Saat menjalankan skrip uji otomatis yang
melakukan banyak login dari satu alamat, naikkan batasnya lewat environment:

```bash
PORT=3100 LOGIN_RATE_LIMIT=200 npm start
```

## Deploy

Panduan lengkap ada di [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md), dan database di
[`docs/DEPLOY_AIVEN.md`](docs/DEPLOY_AIVEN.md). Ringkasnya:

- Vercel **import repo GitHub**; Framework Preset *Other*, Root Directory dan Build Command
  dikosongkan.
- `index.ts` di root mengekspor aplikasi Express; Vercel mendeteksinya otomatis. `src/server.ts`
  hanya dipakai di lokal.
- **Production Branch** di Vercel harus branch yang berisi kode ini (`develop`), bukan `main`
  yang isinya hanya dokumen. Ini penyebab paling sering muncul 404.
- Health check path `/api/health`.
- `NODE_ENV=production`, `DATABASE_URL` dari Aiven, dan **`DB_CA_CERT`** berisi isi `ca.pem`
  (bukan `DB_CA_CERT_PATH`, karena berkasnya tidak ikut terunggah).
- Tiga kunci Cloudinary wajib diisi, karena gambar tidak disimpan di disk server.
- `PORT` tidak perlu diisi; Vercel mengurusnya sendiri.

## Alur kerja branch

```bash
git switch develop && git pull origin develop
git switch -c feature/<area>-<nama-fitur>
# commit per langkah, lalu
git push -u origin feature/<area>-<nama-fitur>
gh pr create --base develop --fill
```

Merge selalu dilakukan manual di GitHub. `main` hanya menerima PR dari `develop` setelah
`develop` dinyatakan fix. Rinciannya ada di `AGENTS.md` dan `docs/GIT_WORKFLOW.md`.
