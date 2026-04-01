# Autoscript License

Sistem lisensi IP untuk `autoscript` yang terdiri dari:
- `Cloudflare Worker` untuk API lisensi
- `Cloudflare D1` untuk database lisensi, audit, dan rate limit
- `Cloudflare Pages` untuk website

Repo ini adalah project standalone. Semua file Worker, Pages, dan migrasi ada langsung di repo ini.

## Ringkasan

Fitur utama:
- halaman `/` untuk aktivasi, perpanjang, dan cek status IP VPS
- halaman `/admin/` untuk operator
- validasi lisensi VPS lewat `POST /api/v1/license/check`
- durasi lisensi default `14 hari`
- anti-abuse publik:
  - rate limit per visitor IP
  - rate limit per target IP
  - Cloudflare Turnstile untuk aktivasi/perpanjang

Endpoint produksi bawaan:

```text
https://autoscript-license.minidecrypt.workers.dev
```

Endpoint check untuk `autoscript`:

```text
https://autoscript-license.minidecrypt.workers.dev/api/v1/license/check
```

## Struktur Repo

- `worker/src/index.js`: API Worker
- `migrations/`: schema D1
- `pages/index.html`: halaman publik
- `pages/admin/index.html`: halaman operator
- `pages/public.js` dan `pages/public.css`: frontend publik
- `pages/app.js` dan `pages/styles.css`: frontend operator
- `pages/config.js`: fallback config lokal
- `scripts/build-pages.mjs`: generate `dist/config.js`
- `dist/`: output build Pages
- `wrangler.toml`: config Worker dan binding D1

## Endpoint

### Public
- `GET /api/public/config`
- `POST /api/public/license/activate`
- `POST /api/public/license/create`
- `POST /api/public/license/renew`
- `POST /api/public/license/status`

### Autoscript Client
- `POST /api/v1/license/check`

### Admin
- `POST /api/admin/session/login`
- `GET /api/admin/session`
- `GET /api/admin/license-entries`
- `POST /api/admin/license-entries`
- `PATCH /api/admin/license-entries/:id`
- `DELETE /api/admin/license-entries/:id`
- `POST /api/admin/license-entries/:id/revoke`
- `POST /api/admin/license-entries/:id/reactivate`
- `GET /api/admin/audit-logs`
- `GET /api/admin/metrics`

## Aturan Lisensi

- masa aktif default izin IP: `14 hari`
- IP baru akan membuat entry aktif `14 hari`
- IP yang sama akan memperpanjang masa aktif `14 hari` dari `max(now, expires_at)`
- IP `revoked` ditolak di jalur publik
- check VPS diputuskan berdasarkan source IP request (`CF-Connecting-IP`), bukan token client

## Requirement

Minimal yang perlu Anda siapkan:
- akun Cloudflare
- repo GitHub `superdecrypt-dev/autoscript-license`
- satu project `Cloudflare Worker`
- satu `D1 database`
- satu project `Cloudflare Pages`
- satu widget `Cloudflare Turnstile`

Kalau deploy lokal:
- Node.js 18+
- `npm`
- `wrangler`

## Konfigurasi

### Vars Worker

Lihat [wrangler.toml](/root/project/autoscript-license/wrangler.toml). Vars utama:

- `CACHE_TTL_SEC_DEFAULT`
- `PUBLIC_LICENSE_DURATION_DAYS`
- `PUBLIC_UI_ORIGIN`
- `ADMIN_UI_ORIGIN`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `PUBLIC_CREATE_LIMIT_MAX`
- `PUBLIC_CREATE_WINDOW_SEC`
- `PUBLIC_CREATE_TARGET_LIMIT_MAX`
- `PUBLIC_CREATE_TARGET_WINDOW_SEC`
- `PUBLIC_STATUS_LIMIT_MAX`
- `PUBLIC_STATUS_WINDOW_SEC`
- `PUBLIC_RENEW_LIMIT_MAX`
- `PUBLIC_RENEW_WINDOW_SEC`
- `PUBLIC_RENEW_TARGET_LIMIT_MAX`
- `PUBLIC_RENEW_TARGET_WINDOW_SEC`
- `AUDIT_LOG_RETENTION_DAYS`
- `PUBLIC_RATE_LIMIT_RETENTION_DAYS`

### Secret Worker

- `PUBLIC_TURNSTILE_SECRET_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Catatan:
- `ADMIN_SESSION_SECRET` optional, tapi sangat disarankan
- jika `ADMIN_SESSION_SECRET` tidak diisi, Worker fallback ke `ADMIN_PASSWORD` untuk signing session token

Repo ini punya fallback bawaan untuk login operator:

```text
ADMIN_EMAIL=super@decrypt.dev
ADMIN_PASSWORD=superdecrypt-dev
```

Kalau Anda tidak isi dua env itu di dashboard Worker, login tetap bisa berjalan memakai nilai bawaan tersebut.

### Build Pages

Env build Pages:

- `PAGES_API_BASE_URL`

Kalau env ini tidak diisi, build akan fallback ke default di `pages/config.js`, yang sekarang diarahkan ke:

```text
https://autoscript-license.minidecrypt.workers.dev
```

## Setup Dari Nol

### 1. Buat D1

Di Cloudflare Dashboard:
1. buka `Workers & Pages`
2. buka `D1`
3. klik `Create database`
4. nama: `autoscript-license`

### 2. Jalankan migrasi

Jalankan file SQL ini secara berurutan:
1. [0001_initial.sql](/root/project/autoscript-license/migrations/0001_initial.sql)
2. [0002_public_self_service.sql](/root/project/autoscript-license/migrations/0002_public_self_service.sql)
3. [0003_public_target_rate_limits.sql](/root/project/autoscript-license/migrations/0003_public_target_rate_limits.sql)

Hasilnya akan membuat tabel:
- `license_entries`
- `audit_logs`
- `public_rate_limits`
- `public_target_rate_limits`

### 3. Buat Worker

Di Cloudflare Dashboard:
1. buka `Workers & Pages`
2. klik `Create application`
3. pilih `Worker`
4. nama Worker: `autoscript-license`

Lalu:
1. buka editor Worker
2. hapus isi default
3. paste isi [index.js](/root/project/autoscript-license/worker/src/index.js)
4. deploy

### 4. Tambahkan binding D1

Di Worker `Settings` > `Bindings`:
- type: `D1`
- binding name: `LICENSE_DB`
- database: `autoscript-license`

Nama binding harus `LICENSE_DB`.

### 5. Isi vars Worker

Isi minimal:

```text
CACHE_TTL_SEC_DEFAULT=3600
PUBLIC_LICENSE_DURATION_DAYS=14
PUBLIC_UI_ORIGIN=https://<pages-domain-anda>
ADMIN_UI_ORIGIN=https://<pages-domain-anda>
PUBLIC_TURNSTILE_SITE_KEY=<site-key-turnstile>
PUBLIC_CREATE_LIMIT_MAX=5
PUBLIC_CREATE_WINDOW_SEC=900
PUBLIC_CREATE_TARGET_LIMIT_MAX=3
PUBLIC_CREATE_TARGET_WINDOW_SEC=900
PUBLIC_STATUS_LIMIT_MAX=30
PUBLIC_STATUS_WINDOW_SEC=900
PUBLIC_RENEW_LIMIT_MAX=10
PUBLIC_RENEW_WINDOW_SEC=900
PUBLIC_RENEW_TARGET_LIMIT_MAX=5
PUBLIC_RENEW_TARGET_WINDOW_SEC=900
AUDIT_LOG_RETENTION_DAYS=30
PUBLIC_RATE_LIMIT_RETENTION_DAYS=7
```

### 6. Isi secret Worker

Isi:

```text
PUBLIC_TURNSTILE_SECRET_KEY=<secret-turnstile>
ADMIN_SESSION_SECRET=<secret-random>
```

Opsional override login:

```text
ADMIN_EMAIL=<email-baru>
ADMIN_PASSWORD=<password-baru>
```

### 7. Buat Turnstile

Di Cloudflare Dashboard:
1. buka `Turnstile`
2. buat widget baru
3. tambahkan domain Pages Anda
4. salin:
   - `Site Key`
   - `Secret Key`

Pasang:
- `Site Key` ke `PUBLIC_TURNSTILE_SITE_KEY`
- `Secret Key` ke `PUBLIC_TURNSTILE_SECRET_KEY`

Turnstile hanya dipakai untuk:
- `activate`
- `create`
- `renew`

`status` tetap tanpa challenge.

### 8. Tambahkan cron

Di Worker `Triggers`, tambahkan:

```text
17 * * * *
```

Cron ini membersihkan:
- `audit_logs`
- `public_rate_limits`
- `public_target_rate_limits`

### 9. Buat Pages

Di Cloudflare Dashboard:
1. buka `Workers & Pages`
2. klik `Create application`
3. pilih `Pages`
4. pilih `Connect to Git`
5. hubungkan repo `superdecrypt-dev/autoscript-license`

Build config:
- `Production branch`: `main`
- `Root directory`: `.`
- `Build command`: `npm install && npm run build:pages`
- `Build output directory`: `dist`

`PAGES_API_BASE_URL` opsional kalau endpoint produksi Anda tetap:

```text
https://autoscript-license.minidecrypt.workers.dev
```

### 10. Deploy

Setelah Worker dan Pages selesai:
- halaman publik: `https://<pages-domain>/`
- halaman operator: `https://<pages-domain>/admin/`

## Cara Deploy

### Opsi A: Cloudflare Dashboard + GitHub

Ini cara paling mudah untuk production:
1. push repo ke GitHub
2. connect Pages ke repo
3. deploy Worker dari dashboard atau Git integration
4. isi binding, vars, dan secret di Cloudflare
5. jalankan migrasi D1
6. redeploy jika ada perubahan

### Opsi B: Local CLI

Install dependency:

```bash
npm install
```

Build Pages:

```bash
npm run build:pages
```

Deploy Worker:

```bash
npm run deploy:worker
```

Deploy Pages:

```bash
npm run deploy:pages
```

Migrasi D1:

```bash
npm run d1:migrate:remote
```

## Verifikasi Setelah Deploy

### Worker

Cek health:

```text
https://autoscript-license.minidecrypt.workers.dev/healthz
```

Harus membalas:

```json
{"ok":true}
```

### Public Config

Cek:

```text
https://autoscript-license.minidecrypt.workers.dev/api/public/config
```

Harus memuat minimal:
- `license_duration_days`
- `turnstile_site_key`

### Halaman Publik

Tes:
1. buka `/`
2. isi IPv4 VPS
3. selesaikan Turnstile
4. submit aktivasi
5. cek status IP yang sama

### Halaman Operator

Tes:
1. buka `/admin/`
2. login
3. pastikan session terbentuk
4. coba lihat entries, audit log, dan metrics

## Alur Operasi

### Jalur Publik
1. pengguna membuka `/`
2. pengguna memasukkan IPv4 VPS
3. pengguna menyelesaikan Turnstile
4. Worker memeriksa:
   - rate limit visitor IP
   - rate limit target IP
   - token Turnstile
5. Worker membuat atau memperpanjang lisensi

### Jalur Operator
1. operator login di `/admin/`
2. Worker menerbitkan session token 24 jam
3. operator dapat:
   - create entry
   - edit entry
   - revoke
   - reactivate
   - delete
   - lihat audit log
   - lihat metrics

### Jalur VPS
1. VPS memanggil `POST /api/v1/license/check`
2. Worker membaca source IP request
3. Worker memutuskan `allow` atau `deny`

## Maintenance

Cleanup terjadwal menghapus data lama:
- `audit_logs` berdasarkan `AUDIT_LOG_RETENTION_DAYS`
- `public_rate_limits` berdasarkan `PUBLIC_RATE_LIMIT_RETENTION_DAYS`
- `public_target_rate_limits` berdasarkan `PUBLIC_RATE_LIMIT_RETENTION_DAYS`

## Integrasi Dengan Autoscript

`autoscript` sekarang memakai URL bawaan ini:

```bash
export AUTOSCRIPT_LICENSE_DEFAULT_API_URL="https://autoscript-license.minidecrypt.workers.dev/api/v1/license/check"
```

Jadi install baru di VPS tidak perlu set endpoint lisensi manual kalau memang hostname produksinya tetap sama.

## Checklist Produksi

Sebelum dipakai production, pastikan:
1. D1 sudah dibuat
2. tiga migrasi sudah dijalankan
3. Worker sudah deploy
4. binding `LICENSE_DB` benar
5. Turnstile site key sudah diisi
6. Turnstile secret key sudah diisi
7. cron cleanup aktif
8. Pages sudah deploy
9. halaman `/` bisa aktivasi
10. halaman `/admin/` bisa login
11. `healthz` Worker normal

## Catatan Keamanan

- `ADMIN_SESSION_SECRET` sebaiknya dipisah dari `ADMIN_PASSWORD`
- `PUBLIC_TURNSTILE_SECRET_KEY` hanya boleh ada di Worker, bukan frontend
- fallback `ADMIN_EMAIL` dan `ADMIN_PASSWORD` bawaan repo nyaman untuk setup awal, tetapi untuk production sebaiknya di-override di dashboard Worker
