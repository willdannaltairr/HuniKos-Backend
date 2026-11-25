# Deploy Database HUNIKOS ke Aiven

Panduan ini khusus untuk **database**-nya. Backend Express naik ke Vercel
(lihat [`DEPLOY_VERCEL.md`](DEPLOY_VERCEL.md)).

Aiven memakai satu akun admin bawaan bernama `avnadmin`. Kamu tidak perlu membuat user
sendiri untuk proyek ini.

---

## 1. Buat service PostgreSQL

1. Masuk ke [console.aiven.io](https://console.aiven.io).
2. Klik **Create service** → pilih **PostgreSQL**.
3. Pilih **Free plan** dan satu region terdekat (misalnya Singapore).
4. Beri nama service, misalnya `hunikos-db`, lalu **Create service**.
5. Tunggu status berubah dari *Rebuilding* menjadi **Running** (biasanya 1–3 menit).

---

## 2. Ambil kredensial

Buka service → tab **Overview**. Yang dibutuhkan ada di bagian *Connection information*:

| Yang diambil | Dipakai untuk |
|---|---|
| **Host** | pgAdmin & `DATABASE_URL` |
| **Port** | pgAdmin & `DATABASE_URL` |
| **Database** (biasanya `defaultdb`) | pgAdmin & `DATABASE_URL` |
| **Password** milik `avnadmin` | pgAdmin & `DATABASE_URL` |
| **CA Certificate** (`ca.pem`) | SSL, wajib |

Bentuk `DATABASE_URL`-nya nanti:

```text
postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb
```

Jangan menambahkan `?sslmode=...` di belakangnya. Kode aplikasi mengatur SSL sendiri
lewat `DB_CA_CERT`; menambahkan parameter itu bisa membuat perilaku SSL tidak konsisten.

Klik **Download CA certificate** untuk menyimpan `ca.pem`. Berkas ini nanti dipakai di
pgAdmin (sebagai *Root certificate*) dan oleh aplikasi lewat `DB_CA_CERT` atau
`DB_CA_CERT_PATH` (lihat langkah 5).

---

## 3. Hubungkan pgAdmin ke Aiven

1. Buka pgAdmin → klik kanan **Servers** → **Register → Server**.
2. Tab **General** → *Name*: `HuniKos Aiven`.
3. Tab **Connection**:

| Kolom | Nilai |
|---|---|
| Host name/address | Host dari langkah 2 |
| Port | Port dari langkah 2 |
| Maintenance database | `defaultdb` |
| Username | `avnadmin` |
| Password | Password dari langkah 2 |

4. Tab **SSL** → *SSL mode*: **Require**.
5. Bila muncul error SSL, pada tab **SSL** yang sama isi **Root certificate** dengan
   berkas `ca.pem` yang sudah diunduh.
6. **Save**.

Kalau berhasil, di sidebar akan muncul `HuniKos Aiven → Databases → defaultdb`.

---

## 4. Buat tabelnya

Tabel dibuat lewat berkas SQL `database/schema.sql`. Isinya sama persis dengan hasil
`npm run migrate:up`; berkas ini disediakan supaya struktur tabel bisa langsung dilihat dan
dibuat lewat pgAdmin. Jangan jalankan keduanya pada database yang sama.

1. Klik kanan `defaultdb` → **Query Tool**.
2. Ikon folder → pilih `database/schema.sql`.
3. Tekan **F5**.
4. Klik kanan **Schemas → public → Tables → Refresh**.

Hasil yang benar: **10 tabel** (`users`, `properties`, `rooms`, `facilities`,
`room_facilities`, `property_images`, `bookings`, `booking_status_histories`, `payments`,
`maintenance_requests`), 10 index, 15 foreign key, dan 12 baris fasilitas.

Berkas itu sudah diuji: dijalankan ke database kosong pada PostgreSQL 18 dan hasilnya
identik dengan database yang dipakai aplikasi.

---

## 5. Isi akun uji dan data contoh

Akun uji **tidak** ada di `schema.sql`, karena `password_hash` harus berupa hash bcrypt.

**Cara 1 — langsung di pgAdmin (tanpa Node.js).** Buka Query Tool di database tujuan, buka
`database/seed.sql`, lalu tekan **F5**. Berkas itu membuat 6 akun uji, 3 properti, 7 kamar,
29 relasi fasilitas, 4 booking dengan status berbeda, 1 pembayaran terverifikasi, dan
1 laporan kerusakan. Aman dijalankan dua kali: run kedua menyisipkan 0 baris.

**Cara 2 — dari komputer, lewat Node.js.** Isi `.env` lebih dulu:

```bash
DATABASE_URL=postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb
DB_CA_CERT_PATH=certs/aiven-ca.pem
```

Sertifikat bisa diisi dua cara, pilih salah satu:

| Cara | Cocok untuk | Isi |
|---|---|---|
| `DB_CA_CERT_PATH` | lokal | path ke berkas `.pem`, mis. `certs/aiven-ca.pem` |
| `DB_CA_CERT` | Vercel / server tanpa berkas | seluruh isi `ca.pem` ditempel langsung |

Kalau memakai `DB_CA_CERT`, isinya boleh multi-baris. Bila kolomnya hanya menerima satu
baris, ganti setiap baris baru dengan `\n` — kode mengubahnya kembali menjadi baris baru.
`DB_CA_CERT` didahulukan; `DB_CA_CERT_PATH` dipakai bila `DB_CA_CERT` kosong.

Lalu:

```bash
npm install
npm run seed
```

Hasil yang benar (sama untuk kedua cara):

```text
Admin  : admin@hunikos.test / Admin123!
Owner  : owner1@hunikos.test, owner2@hunikos.test / Owner123!
Tenant : tenant1@hunikos.test, tenant2@hunikos.test, tenant3@hunikos.test / Tenant123!
```

> Kalau kamu lebih suka memindahkan data yang sekarang ada di lokal (bukan data contoh),
> gunakan `pg_dump` dari PostgreSQL lokal lalu `pg_restore` ke Aiven. Keduanya butuh
> `--no-owner --no-privileges` supaya tidak bentrok dengan user `avnadmin`.

---

## 6. Verifikasi di pgAdmin

Buka Query Tool di `defaultdb` dan jalankan:

```sql
SELECT count(*) AS jumlah_tabel
FROM pg_tables
WHERE schemaname = 'public';

SELECT status, count(*) FROM bookings GROUP BY status ORDER BY status;
```

Tabel pertama harus berisi 10. Yang kedua menampilkan sebaran status booking hasil seed
(harus ada `PENDING`, `AWAITING_PAYMENT`, `CONFIRMED`, dan `REJECTED`).

Untuk memastikan data seed utuh, `database/seed.sql` sudah mencetak rekap jumlah baris di
akhir berkasnya: `users` 6, `properties` 3, `rooms` 7, `room_facilities` 29,
`bookings` 4, `booking_status_histories` 5, `payments` 1, `maintenance_requests` 1.

---

## 7. Sambungkan backend

**Lokal** — setelah `.env` diarahkan ke Aiven seperti langkah 5:

```bash
npm run dev
```

Log harus menampilkan `Koneksi database berhasil.` Lalu:

```bash
curl http://localhost:3000/api/health
```

**Produksi (Vercel)** — isi environment variable berikut, lalu deploy seperti di
[`DEPLOY_VERCEL.md`](DEPLOY_VERCEL.md):

| Variable | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb` |
| `DB_CA_CERT` | seluruh isi `ca.pem`, atau kosongkan bila memakai path |
| `DB_CA_CERT_PATH` | alternatif untuk lokal saja (tidak dipakai di Vercel) |
| `DB_POOL_MAX` | `5` |
| `JWT_SECRET` | string acak baru, minimal 32 karakter |
| `CORS_ORIGINS` | domain website + `http://localhost:3000` |
| `BASE_URL` | URL Vercel, misalnya `https://hunikos-api.vercel.app` |
| `STORAGE_DRIVER` | `cloudinary` (+ 3 kunci Cloudinary) |

Setelah deploy, cek `https://NAMA-PROJECT.vercel.app/api/health`. Harus menjawab
`{"success":true,"message":"Server dan database sehat",...}`.

---

## Hal yang perlu diketahui

**SSL wajib.** Aplikasi sengaja berhenti bila `NODE_ENV=production` dan tidak ada
sertifikat CA, dengan pesan `Sertifikat CA wajib diisi di produksi`. Itu pengaman, bukan
bug — tanpa sertifikat, koneksi ke Aiven ditolak.

**Batas koneksi.** `DB_POOL_MAX` diisi `5` agar jauh di bawah batas service. Angka pasti
batas koneksi dan kuota penyimpanan free plan berubah dari waktu ke waktu — lihat
halaman *Plan* di console Aiven milikmu untuk angka yang berlaku sekarang.

**Service bisa berhenti saat lama tidak dipakai.** Kalau koneksi tiba-tiba gagal padahal
kredensial benar, cek dulu status service di console; kalau berstatus *Powered off*,
nyalakan lagi dan tunggu *Running*. Ini alasan `/api/health` bisa lambat pada permintaan
pertama.

**Ubah data lewat aplikasi, bukan lewat pgAdmin.** Status booking dan status kamar saling
terikat. Mengubah `bookings.status` langsung di pgAdmin tanpa memperbarui `rooms.status`
akan membuat data tidak konsisten. Kalau perlu memeriksa data, jalankan `SELECT`; kalau
mengubah, pakai aplikasi.

---

## Jika gagal

| Gejala | Penyebab paling sering | Tindakan |
|---|---|---|
| `password authentication failed for user "avnadmin"` | password kurang lengkap saat salin | salin ulang dari *Overview*, jangan ketik manual |
| `no pg_hba.conf entry` / `SSL required` | SSL belum aktif | pgAdmin: SSL mode **Require**; aplikasi: isi `DB_CA_CERT` atau `DB_CA_CERT_PATH` |
| `self-signed certificate in certificate chain` | CA cert belum dipakai | isi *Root certificate* di pgAdmin, `DB_CA_CERT` di aplikasi |
| `timeout expired` | service sedang bangun atau mati | cek status di console, tunggu *Running* |
| `too many clients already` | pool terlalu besar | turunkan `DB_POOL_MAX` |
| Migrasi gagal `relation "users" already exists` | `schema.sql` dijalankan dua kali | pakai database kosong, atau lewati langkah 4 |
