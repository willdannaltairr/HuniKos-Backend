# HUNIKOS Backend

REST API platform pencarian dan pengelolaan rumah kos untuk UMKM pemilik kos. Dipakai oleh
website Next.js dan aplikasi mobile Flutter.

- Kontrak API + database (sumber kebenaran): [`docs/00_KONTRAK_BERSAMA.md`](docs/00_KONTRAK_BERSAMA.md)
- Aturan branch & commit: [`AGENTS.md`](AGENTS.md) — panduan lengkap di [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md)

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

## Struktur repo

```text
.
├─ AGENTS.md                  # aturan kerja yang dibaca otomatis
├─ docs/
│  ├─ 00_KONTRAK_BERSAMA.md    # kontrak API + database
│  └─ GIT_WORKFLOW.md          # alur branch, commit, issue, PR
├─ .github/
│  ├─ ISSUE_TEMPLATE/          # template fitur, bug, tugas
│  └─ pull_request_template.md
└─ api/                       # backend (menyusul)
```

## Status

Repo masih di tahap fondasi. Kode backend (`api/`) dan dokumentasi database (`docs/schema.sql`,
ERD, kamus data) dikerjakan bertahap di branch `feature/*` masing-masing, lalu masuk `develop`
lewat pull request.

## Alur kerja singkat

```bash
git switch develop && git pull origin develop
git switch -c feature/<area>-<nama-fitur>
# commit per langkah, lalu
git push -u origin feature/<area>-<nama-fitur>
gh pr create --base develop --fill
```

Merge selalu dilakukan manual di GitHub. `main` hanya menerima PR dari `develop` setelah
`develop` dinyatakan fix.
