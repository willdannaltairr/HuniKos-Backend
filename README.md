# HUNIKOS Backend

REST API platform pencarian dan pengelolaan rumah kos untuk UMKM pemilik kos. Dipakai oleh
website Next.js dan aplikasi mobile Flutter.

- Kontrak API + database (sumber kebenaran): [`docs/00_KONTRAK_BERSAMA.md`](docs/00_KONTRAK_BERSAMA.md)
- Aturan branch & commit: [`AGENTS.md`](AGENTS.md) — panduan lengkap di [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md)
- Hasil pengujian yang benar-benar dijalankan: [`docs/hasil-pengujian.md`](docs/hasil-pengujian.md)
- Panduan deploy: [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md)

## Stack

| Bagian | Pilihan |
|---|---|
| Runtime | Node.js 20+ (LTS) |
| Framework | Express 5, JavaScript ESM (`"type": "module"`) |
| Database | PostgreSQL 16 (Aiven free plan), `pg` tanpa ORM |
| Migrasi | `node-pg-migrate` (file `.sql`) |
| Validasi | `zod@3` |
| Auth | JWT HS256 + `bcryptjs` |
| Upload | `multer` → driver `local` (dev) atau `cloudinary` (produksi) |
| Hosting | Render (free web service) |

## Struktur repo

```text
.
├─ AGENTS.md                    # aturan kerja yang dibaca otomatis tiap sesi
├─ docs/
│  ├─ 00_KONTRAK_BERSAMA.md      # kontrak API + database
│  ├─ DEPLOY_RENDER.md           # panduan deploy ke Render
│  ├─ GIT_WORKFLOW.md            # alur branch, commit, issue, PR
│  ├─ erd.dbml / erd.mmd         # diagram relasi tabel
│  ├─ hasil-pengujian.md         # hasil uji nyata + kasus negatif
│  ├─ kamus-data.md              # penjelasan setiap kolom
│  ├─ query-contoh.sql           # 8 query untuk penjelasan ke penguji
│  └─ schema.sql                 # skema gabungan siap dijalankan di psql
├─ api.http                      # koleksi REST Client: semua endpoint
├─ contoh-upload/                # berkas contoh untuk uji unggah
├─ migrations/                   # migration node-pg-migrate
├─ scripts/seed.ts               # data contoh, aman dijalankan berulang
├─ uploads/                      # hanya untuk driver local (masuk .gitignore)
├─ src/
│  ├─ app.ts                     # susun middleware & route
│  ├─ server.ts                  # listen + cek koneksi database
│  ├─ config/                    # env.ts, db.ts (pool, type parser)
│  ├─ middlewares/               # auth, requireRole, validate, upload, errorHandler
│  ├─ types/                     # tipe domain bersama + augmentasi Express
│  ├─ utils/                     # response, HttpError, storage, bookingRules
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

Prasyarat: Node.js 20+, PostgreSQL 18 terpasang di `C:\Program Files\PostgreSQL\18\bin`
(boleh diubah lewat `PG_BIN`).

Repo ini membawa cluster database sendiri di `.pgdata/` (port **5434**), terpisah dari
instalasi PostgreSQL bawaan mesin di 5432. Menyalakannya:

```bash
npm run db:local -- start
```

Perintah itu membuat cluster bila belum ada, menyalakannya, lalu membuat database
`hunikos_test` bila belum ada. Perintah lain:

| Perintah | Kegunaan |
|---|---|
| `npm run db:local -- init` | buat cluster + database dari nol |
| `npm run db:local -- start` | nyalakan cluster |
| `npm run db:local -- stop` | hentikan cluster |
| `npm run db:local -- status` | cek apakah cluster berjalan |

Setelah cluster hidup, siapkan `.env`:

```bash
cp .env.example .env
```

Isi `.env` minimal `DATABASE_URL` dan `JWT_SECRET` (32 karakter acak). Untuk cluster lokal,
`DATABASE_URL` cukup:

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5434/hunikos_test
```

Lalu:

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
| `npm run db:local` | kelola cluster PostgreSQL lokal (`start`/`stop`/`status`) |
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

## Menguji

Ringkasan hasil terakhir: **198/198 lulus, 0 gagal**, mencakup 39 kasus negatif. Rincian per
rangkaian dan daftar yang belum diuji ada di [`docs/hasil-pengujian.md`](docs/hasil-pengujian.md).

Batas percobaan login bawaan 10 per IP per 15 menit. Saat menjalankan skrip uji otomatis yang
melakukan banyak login dari satu alamat, naikkan batasnya lewat environment:

```bash
PORT=3100 LOGIN_RATE_LIMIT=200 npm start
```

## Deploy

Panduan lengkap ada di [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md). Ringkasnya:

- Render **Web Service**, Root Directory dikosongkan, build `npm install`, start `npm start`,
  health check path `/api/health`.
- `NODE_ENV=production`, `DATABASE_URL` dari Aiven, `DB_CA_CERT` berisi isi `ca.pem`.
- Produksi wajib `STORAGE_DRIVER=cloudinary`, karena disk layanan gratis bersifat sementara.
- Layanan gratis tidur setelah 15 menit tanpa trafik; buka `/api/health` sebelum presentasi.

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
