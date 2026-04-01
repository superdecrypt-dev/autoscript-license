# Autoscript License

Portal ini adalah sistem lisensi IP untuk autoscript yang ditujukan untuk deploy di:
- `Cloudflare Worker` sebagai API lisensi publik dan endpoint check untuk VPS
- `Cloudflare D1` sebagai source of truth entry lisensi, audit log, dan rate limit bucket
- `Cloudflare Pages` sebagai website publik self-service

Repo ini adalah project standalone. Semua file Worker, Pages, dan migrasi ada langsung di root repo ini.

## Mode Operasi
- halaman root Pages `/` bersifat publik untuk `aktifkan/perpanjang IP` dan `check status`
- request dari autoscript VPS ke `POST /api/v1/license/check` diputuskan berdasarkan source IP request (`CF-Connecting-IP`), bukan token client
- route `/admin/` dipakai untuk operator: cari IP, create/update entry, revoke/reactivate, dan lihat audit log
- endpoint admin login lewat `POST /api/admin/session/login`, lalu Worker menerbitkan session token 24 jam

## Aturan v1
- masa aktif default izin IP adalah `14 hari`
- input IP baru akan membuat entry aktif 14 hari
- input IP yang sama lagi akan memperpanjang masa aktif 14 hari dari `max(now, expires_at)`
- jika IP berstatus `revoked`, aktivasi publik akan ditolak

## Struktur
- `worker/src/index.js`: API Worker publik
- `migrations/`: schema D1
- `pages/index.html`: website publik self-service
- `pages/admin/index.html`: dashboard admin
- `pages/public.js` dan `pages/public.css`: frontend publik
- `pages/app.js` dan `pages/styles.css`: frontend admin
- `pages/config.js`: fallback lokal untuk preview static tanpa build GitHub
- `scripts/build-pages.mjs`: generate `dist/config.js` dari env build Cloudflare Pages
- `dist/`: output build Pages untuk deploy GitHub/manual
- `wrangler.toml`: konfigurasi Worker + binding D1

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

## Secret dan Vars

### `wrangler.toml`
- `CACHE_TTL_SEC_DEFAULT`
- `PUBLIC_LICENSE_DURATION_DAYS`
- `PUBLIC_UI_ORIGIN`
- `ADMIN_UI_ORIGIN`
- `PUBLIC_CREATE_LIMIT_MAX`
- `PUBLIC_CREATE_WINDOW_SEC`
- `PUBLIC_STATUS_LIMIT_MAX`
- `PUBLIC_STATUS_WINDOW_SEC`
- `PUBLIC_RENEW_LIMIT_MAX`
- `PUBLIC_RENEW_WINDOW_SEC`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `PUBLIC_CREATE_TARGET_LIMIT_MAX`
- `PUBLIC_CREATE_TARGET_WINDOW_SEC`
- `PUBLIC_RENEW_TARGET_LIMIT_MAX`
- `PUBLIC_RENEW_TARGET_WINDOW_SEC`
- `AUDIT_LOG_RETENTION_DAYS`
- `PUBLIC_RATE_LIMIT_RETENTION_DAYS`

### Secret / Dashboard Env
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` optional, disarankan untuk signing session token admin
- `PUBLIC_TURNSTILE_SECRET_KEY`

Admin panel sekarang login lewat session token 24 jam yang diterbitkan Worker.

Jika env admin tidak diisi di dashboard Worker, repo ini punya fallback bawaan:

```text
ADMIN_EMAIL=super@decrypt.dev
ADMIN_PASSWORD=superdecrypt-dev
```

Jika diisi, `ADMIN_SESSION_SECRET` akan dipakai untuk signing token itu; jika tidak, Worker akan fallback ke
`ADMIN_PASSWORD` sebagai signing secret.

`CACHE_TTL_SEC_DEFAULT` adalah masa grace cache allow yang dikirim ke client VPS saat API lisensi gagal dihubungi. Default yang aman untuk produksi adalah `3600` detik agar revoke IP tidak tertahan terlalu lama.

`PUBLIC_TURNSTILE_SITE_KEY` dan `PUBLIC_TURNSTILE_SECRET_KEY` dipakai untuk verifikasi challenge di jalur publik yang mengubah state:
- `POST /api/public/license/activate`
- `POST /api/public/license/create`
- `POST /api/public/license/renew`

Jika Turnstile belum dikonfigurasi, endpoint publik untuk aktivasi/perpanjang akan fail-closed dengan `503`.

`PUBLIC_CREATE_TARGET_*` dan `PUBLIC_RENEW_TARGET_*` adalah rate limit tambahan berbasis `target IP VPS`, bukan `visitor IP`. Ini dipakai untuk mencegah banyak visitor memukul IP target yang sama secara berulang.

### Environment Build Pages
- `PAGES_API_BASE_URL`

`PAGES_API_BASE_URL` dipakai saat `npm run build:pages` untuk override `dist/config.js`.
Kalau env ini tidak diisi, build akan fallback ke nilai default di `pages/config.js`, yang saat ini sudah diarahkan ke:

```text
https://autoscript-license.minidecrypt.workers.dev
```

## Deploy Dengan Connect GitHub
1. Buat D1 database lalu isi `database_id` di `wrangler.toml`.
2. Jalankan migrasi:
   - `npm run d1:migrate:remote`
3. Isi vars di `wrangler.toml`:
   - `PUBLIC_UI_ORIGIN`
   - `ADMIN_UI_ORIGIN`
4. Buat project `Pages` via `Connect to Git`, lalu pakai konfigurasi ini:
   - `Production branch`: branch utama repo Anda
   - `Root directory`: kosongkan atau isi `.`
   - `Build command`: `npm run build:pages`
   - `Build output directory`: `dist`
5. `PAGES_API_BASE_URL` opsional.
   - jika Worker produksi Anda tetap `https://autoscript-license.minidecrypt.workers.dev`, Anda tidak perlu mengisi apa pun
   - jika ingin override ke hostname lain, baru isi:
     - `PAGES_API_BASE_URL=https://<worker-host>`
6. Buat atau connect project `Worker` ke repo GitHub yang sama dan pastikan name-nya `autoscript-license`.
7. Isi vars Worker di dashboard Cloudflare agar sesuai dengan `wrangler.toml`.
8. Tambahkan secret/env admin di Worker dashboard:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
9. Tambahkan secret Turnstile di Worker dashboard:
   - `PUBLIC_TURNSTILE_SECRET_KEY`
10. Pastikan cron trigger Worker ikut terpasang saat deploy, karena cleanup `audit_logs`, `public_rate_limits`,
    dan `public_target_rate_limits` sekarang dijalankan terjadwal dari Worker.

## Deploy Manual Lokal
- Build Pages:
  - `npm run build:pages`
- Deploy Pages:
  - `npm run deploy:pages`
- Deploy Worker:
  - `npm run deploy:worker`

## Alur Publik
1. Pengguna membuka halaman `/`.
2. Pengguna memasukkan `IPv4 VPS` lalu menyelesaikan challenge keamanan.
3. Worker memeriksa rate limit visitor IP dan target IP VPS.
4. Worker membuat entry aktif `14 hari` jika IP belum ada.
5. Jika IP sudah ada dan tidak direvoke, Worker memperpanjang masa aktif `14 hari`.
6. Jika pengguna ingin memastikan hasilnya, gunakan form `Check Status`.

## Maintenance
- Worker menjalankan cleanup terjadwal untuk:
  - `audit_logs` lebih lama dari `AUDIT_LOG_RETENTION_DAYS`
  - `public_rate_limits` lebih lama dari `PUBLIC_RATE_LIMIT_RETENTION_DAYS`
  - `public_target_rate_limits` lebih lama dari `PUBLIC_RATE_LIMIT_RETENTION_DAYS`
- Default cron di `wrangler.toml` berjalan tiap jam.

## Integrasi Autoscript
Autoscript sekarang bisa memakai URL built-in ini tanpa env manual di VPS:

```bash
export AUTOSCRIPT_LICENSE_DEFAULT_API_URL="https://autoscript-license.minidecrypt.workers.dev/api/v1/license/check"
```

Di repo ini URL itu sudah ditanam sebagai default bawaan. `run.sh`, `setup.sh`, `manage.sh`, dan runtime enforcer autoscript akan memakai endpoint yang sama dan Worker akan mengecek izin berdasarkan IP sumber request VPS.
