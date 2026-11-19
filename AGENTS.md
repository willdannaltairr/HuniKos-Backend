# Aturan Kerja HUNIKOS (dibaca otomatis setiap sesi)

File ini berlaku **selalu**, tanpa perlu diingatkan ulang. Panduan lengkap untuk manusia ada di
`docs/GIT_WORKFLOW.md`. Sumber kebenaran API dan database ada di `docs/00_KONTRAK_BERSAMA.md`.

## 1. Model branch

| Branch | Fungsi | Boleh commit langsung? |
|---|---|---|
| `main` | Hanya kode yang sudah fix dan siap dirilis/dinilai | **Tidak pernah** |
| `develop` | Tempat fitur-fitur yang sudah selesai digabung | **Tidak pernah** (hanya lewat PR) |
| `feature/<area>-<nama-fitur>` | Satu fitur = satu branch, dibuat dari `develop` | Ya, di sinilah semua pekerjaan dilakukan |

Aturan nama: huruf kecil, kebab-case, diawali area (`db`, `api`, `mobile`, `web`, `docs`, `deploy`).
Contoh: `feature/db-schema`, `feature/api-auth`, `feature/api-bookings`, `feature/mobile-tenant`,
`feature/docs-srs`.

Alur yang berlaku:

```
feature/*  ──PR──►  develop  ──PR (hanya jika develop sudah fix)──►  main
```

- Fitur yang masih dikerjakan **tetap di branch `feature/*`-nya**. Hanya fitur yang sudah selesai
  dan lolos pengecekan yang masuk ke `develop`.
- Kode di `develop` yang belum fix **tidak boleh** dibawa ke `main`.
- `main` hanya menerima PR dari `develop`, hanya setelah pengguna menyatakan secara eksplisit bahwa
  `develop` sudah fix.
- Penggabungan (merge) PR **selalu dilakukan oleh pengguna** lewat GitHub. Agen tidak pernah merge,
  dan tidak pernah memasukkan perubahan ke `develop` atau `main` dengan cara lain.
- Branch fitur **tidak dihapus** setelah merge, supaya tiap fitur mudah diubah lagi.

## 2. Sebelum mengubah apa pun

1. Jalankan `git branch --show-current`.
2. Jika hasilnya `main` atau `develop`: **berhenti**. Tentukan fitur yang dikerjakan, lalu buat
   branch fiturnya:
   ```bash
   git switch develop && git pull origin develop
   git switch -c feature/<area>-<nama-fitur>
   ```
3. Jika sudah di `feature/*`, lanjut. Jika pekerjaan yang diminta bukan bagian dari fitur branch itu,
   tanyakan apakah perlu branch baru.
4. Sebelum membuat PR, perbarui branch fitur dengan `develop`: `git fetch origin && git merge origin/develop`.

## 3. Aturan commit (Conventional Commits 1.0.0)

### Format
```text
<type>(<scope>): <subject>

<body, opsional: jelaskan KENAPA, bungkus ±72 karakter>

<footer, opsional: Refs #12 / BREAKING CHANGE: ...>
```

- **Bahasa Inggris**, mood perintah (imperative): `add`, `fix`, `remove`, bukan `added`/`adds`.
- Subject: huruf kecil di awal, **tanpa titik** di akhir, maksimal 72 karakter (ideal ≤ 50).
- Satu commit = **satu langkah logis**. Satu commit tidak boleh mencampur dua hal yang tidak
  berhubungan.

### Commit per langkah — wajib

Setiap penambahan, perubahan, dan penghapusan berikut **selalu** dijadikan commit tersendiri:

- file baru dan file yang dihapus;
- folder atau modul baru (commit terpisah dari isinya bila folder itu fondasi, misalnya `api/`);
- satu endpoint atau satu modul fitur (`auth`, `bookings`, `owner/payments`);
- satu migration database (naik dan turun dalam satu file = satu commit);
- satu perubahan konfigurasi (`package.json`, `.env.example`, `.gitignore`);
- satu dokumen (`README`, ERD, kamus data, PRD/SRS).

Jangan menumpuk banyak langkah dalam satu commit "akhir", dan jangan memecah satu langkah menjadi
commit yang tidak bisa dijelaskan alasannya. Jika ragu, tanyakan: "kalau commit ini di-`revert`,
apakah aplikasi kembali ke keadaan yang utuh?" Jika tidak, pecah lagi.

Gunakan `git add -p` atau `git add <path-spesifik>`; hindari `git add -A` kecuali seluruh perubahan
di working tree memang satu langkah.

### Type

| Type | Dipakai untuk |
|---|---|
| `feat` | menambah fitur atau perilaku baru (termasuk migration, endpoint, layar baru) |
| `fix` | memperbaiki bug |
| `refactor` | mengubah struktur kode tanpa mengubah perilaku (memindah/mengganti nama file, hapus kode mati) |
| `perf` | perbaikan performa |
| `test` | menambah atau mengubah test |
| `docs` | dokumentasi, README, komentar dokumen, SRS |
| `style` | format, spasi, titik koma — tanpa mengubah perilaku |
| `build` | `package.json`, dependensi, skrip build |
| `ci` | konfigurasi GitHub Actions, template issue/PR |
| `chore` | pekerjaan kecil lain (`.gitignore`, konfigurasi editor) |

Perubahan yang merusak kompatibilitas: tambahkan `!` setelah scope (`feat(api)!: ...`) dan footer
`BREAKING CHANGE: ...`. Referensi issue di footer commit memakai `Refs #<nomor>`; kata `Closes
#<nomor>` ditaruh di deskripsi PR, bukan di commit.

### Yang tidak boleh masuk commit

- Rahasia apa pun: `.env`, `JWT_SECRET`, API key Cloudinary, `ca.pem`, password.
- `node_modules/`, `uploads/`, `.next/`, `dist/`, file hasil generate.
- File sementara/eksperimen yang tidak dipakai aplikasi.

## 4. Pull request

- PR selalu dari `feature/*` ke `develop` (kecuali PR rilis `develop` ke `main`).
- Judul PR memakai format Conventional Commits, contoh: `feat(api): add booking endpoints`.
- Isi deskripsi memakai template di `.github/pull_request_template.md`: ringkasan, `Closes #<issue>`,
  perubahan utama, cara menguji, **hasil pengujian yang sebenarnya**, dan checklist.
- PR hanya berisi satu fitur. Perubahan tak terkait dipindah ke PR lain.
- Setelah push branch, buat PR dengan `gh pr create --base develop --head feature/<nama> --fill`
  atau lewat tombol **Compare & pull request** di GitHub.
- Agen tidak pernah menekan tombol merge, tidak pernah `gh pr merge`, dan tidak pernah push ke
  `develop`/`main`.

## 5. Issue

- Setiap pekerjaan dimulai dari issue (template di `.github/ISSUE_TEMPLATE/`): `feature.md` untuk
  fitur, `bug.md` untuk perbaikan, `task.md` untuk pekerjaan kecil/dokumentasi.
- Judul issue memakai awalan area: `[db]`, `[api]`, `[mobile]`, `[web]`, `[docs]`, `[deploy]`.
- Isi issue memuat ruang lingkup dan kriteria terima yang bisa dicentang.
- Nomor issue dirujuk dari commit (`Refs #12`) dan ditutup otomatis lewat `Closes #12` di PR.

## 6. Aturan teknis yang tidak boleh dilanggar

- Kontrak (`docs/00_KONTRAK_BERSAMA.md`) adalah satu-satunya acuan nama tabel, kolom, enum, endpoint,
  dan bentuk response. Jangan menambah/mengurangi tanpa melapor lebih dulu.
- Semua query SQL parameterized; tidak ada input pengguna yang disambung ke string SQL.
- Setiap migration harus bisa naik (`up`) dan turun (`down`).
- Tidak ada rahasia di repo; `api/.env.example` selalu lengkap.
- Gaya kode: satu file satu tanggung jawab, ±150 baris per file, komentar bahasa Indonesia hanya
  untuk alasan yang tidak langsung terlihat dari kode.
- Klaim "selesai" harus disertai bukti: perintah yang dijalankan dan hasil sebenarnya. Yang belum
  diuji ditulis "belum diuji" beserta alasannya.
