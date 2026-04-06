# Autoscript License

Sistem lisensi IP untuk `autoscript` yang terdiri dari:
- `Cloudflare Worker` untuk API lisensi
- `Cloudflare D1` untuk database lisensi, audit, dan rate limit
- `Cloudflare Pages` untuk website

Repo ini adalah project standalone. Semua file Worker, Pages, dan migrasi ada langsung di repo ini.

Hostname publik saat ini:
- utama: `https://autoscript.license.dpdns.org`
- sekunder/legacy: `https://autoscript-license.pages.dev`

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
- `pages/config.js`: fallback config lokal untuk build, tidak dipublish langsung
- `pages/_redirects`: blok path legacy asset di Pages
- `pages/_headers`: template security headers dan cache policy untuk Pages
- `pages/404.html`: fallback 404 sederhana untuk Pages
- `pages/robots.txt`: larangan indexing untuk seluruh portal
- `functions/api/admin/[[path]].js`: proxy admin internal dari Pages ke Worker
- `functions/[[path]].js`: blokir path asset legacy agar tetap `404`
- `scripts/build-pages.mjs`: build HTML final + aset minified hashed ke `dist/assets`
- `dist/`: output build Pages
- `wrangler.toml`: config Pages
- `wrangler.worker.toml`: config Worker, vars, cron, dan binding D1

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

Lihat [wrangler.worker.toml](/root/project/autoscript-license/wrangler.worker.toml). Vars utama:

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
- `ADMIN_PROXY_SHARED_SECRET`

Catatan:
- `ADMIN_PROXY_SHARED_SECRET` wajib diisi manual dan harus acak
- jika diisi manual, nilainya harus sama antara Pages dan Worker
- identitas operator diambil dari Cloudflare Access
- Pages Functions meneruskan identitas itu ke Worker lewat secret internal
- `PUBLIC_UI_ORIGIN` dan `ADMIN_UI_ORIGIN` bisa diisi satu origin atau daftar origin dipisah koma

### Build Pages

Env build Pages:

- `PAGES_API_BASE_URL`
- `PAGES_TURNSTILE_SITE_KEY`
- `ADMIN_PROXY_SHARED_SECRET`

Build sekarang fail-fast jika `PAGES_API_BASE_URL` kosong dan `pages/config.js` juga tidak menyediakan fallback yang valid. Nilai default repo saat ini untuk `apiBaseUrl` memang kosong, jadi production build harus mengisi env ini secara eksplisit.

Catatan:
- `PAGES_API_BASE_URL` wajib diisi manual ke origin Worker yang benar untuk deploy production
- `PAGES_TURNSTILE_SITE_KEY` fallback ke `pages/config.js`
- `ADMIN_PROXY_SHARED_SECRET` wajib diisi di Pages env
- dua nilai itu tetap bisa dioverride manual dari Pages project jika diperlukan
- output build Pages sekarang berupa HTML final + aset hashed di `dist/assets`
- `config.js` tidak lagi dipublish sebagai file publik terpisah; config publik di-inline saat build sebagai JSON pasif
- path asset legacy diblok lewat kombinasi `pages/_redirects` dan `functions/[[path]].js`
- security headers dan cache policy Pages dibangun dari `pages/_headers`

### Ringkasan Hardening Pages

Hardening browser-level yang sekarang dipakai:
- `Content-Security-Policy` untuk halaman publik dan admin
- `Strict-Transport-Security`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` untuk mematikan capability browser yang tidak dipakai
- `X-Robots-Tag: noindex, nofollow, noarchive`

Perilaku cache:
- HTML publik dan admin: `no-store`
- JSON/API Worker dan admin proxy: `no-store`
- hashed assets di `/assets/*`: `immutable`
- path asset legacy yang diblok: `no-store`

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
PUBLIC_UI_ORIGIN=https://autoscript-license.pages.dev,https://autoscript.license.dpdns.org
ADMIN_UI_ORIGIN=https://autoscript-license.pages.dev,https://autoscript.license.dpdns.org
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
ADMIN_PROXY_SHARED_SECRET=<secret-random>
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
- `Site Key` ke:
  - `PUBLIC_TURNSTILE_SITE_KEY` di Worker
  - `PAGES_TURNSTILE_SITE_KEY` di Pages
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

Lindungi path operator dengan Cloudflare Access:

```text
/admin*
/api/admin*
```

Tambahkan juga runtime variable di Pages:

```text
PAGES_API_BASE_URL=https://autoscript-license.minidecrypt.workers.dev
ADMIN_PROXY_SHARED_SECRET=<secret-yang-sama-dengan-worker>
```

Catatan:
- project Pages ini memakai Pages Functions dan `_redirects`
- saat deploy, `dist/` harus ikut membawa `assets/`, `_redirects`, dan Functions bundle

### 10. Deploy

Setelah Worker dan Pages selesai:
- halaman publik utama: `https://autoscript.license.dpdns.org/`
- halaman publik legacy: `https://autoscript-license.pages.dev/`
- halaman operator mengikuti hostname Pages yang Anda lindungi dengan Access

## Quick Path Dashboard

Urutan menu tercepat di Cloudflare Dashboard:

1. `Workers & Pages` -> `D1` -> buat database `autoscript-license`
2. jalankan 3 file migrasi D1
3. `Workers & Pages` -> buat `Worker` bernama `autoscript-license`
4. paste source Worker, lalu tambahkan binding `LICENSE_DB`
5. isi vars dan secret Worker
6. `Turnstile` -> buat widget -> salin `Site Key` dan `Secret Key`
7. `Workers & Pages` -> buat `Pages` -> hubungkan repo GitHub
8. isi env Pages dan deploy
9. `Zero Trust` -> `Access` -> `Applications` -> lindungi:
   - `/admin*`
   - `/api/admin*`
10. tes `/`, `/admin/`, dan `healthz`

## Access Setup Cepat

Untuk jalur operator, buat aplikasi Access dengan:

- `Application type`: `Self-hosted`
- `Domain`: `autoscript.license.dpdns.org` sebagai utama
- `Paths`:
  - `/admin*`
  - `/api/admin*`
- `Policy`: `Allow`
- `Rule`: email Anda atau `Email ending in`

Catatan:
- kalau UI Access hanya menerima satu path per app, buat 2 app terpisah
- `/api/admin*` wajib ikut dilindungi, bukan hanya `/admin*`
- kalau Anda tetap ingin dua hostname aktif, buat Access juga untuk:
  - `autoscript-license.pages.dev`
  - `autoscript.license.dpdns.org`

## Cara Deploy

### Opsi A: Cloudflare Dashboard + GitHub

Ini cara paling mudah untuk production:
1. push repo ke GitHub
2. connect Pages ke repo
3. deploy Worker dari dashboard atau Git integration
4. isi binding, vars, dan secret di Cloudflare
5. aktifkan Cloudflare Access untuk `/admin*` dan `/api/admin*`
6. jalankan migrasi D1
7. redeploy jika ada perubahan

### Opsi B: Local CLI

Install dependency:

```bash
npm install
```

Build Pages:

```bash
npm run build:pages
```

Output build Pages sekarang:
- `dist/index.html`
- `dist/admin/index.html`
- `dist/assets/*.js`
- `dist/assets/*.css`

Build ini tidak lagi mempublikasikan file source Pages mentah seperti:
- `/public.js`
- `/public.css`
- `/config.js`
- `/app.js`
- `/styles.css`

Path itu sekarang diblok lagi di layer Pages supaya tetap `404` walau pernah ada asset lama yang sempat ter-cache.

Build juga menghasilkan:
- `_headers` untuk CSP, noindex, dan cache policy
- `robots.txt` dengan `Disallow: /`

Deploy Worker:

```bash
npm run deploy:worker
```

Pasang secret Worker:

```bash
wrangler secret put PUBLIC_TURNSTILE_SECRET_KEY
wrangler secret put ADMIN_PROXY_SHARED_SECRET
```

Deploy Pages:

```bash
npm run deploy:pages
```

Set runtime variable Pages:

```text
PAGES_API_BASE_URL=https://autoscript-license.minidecrypt.workers.dev
PAGES_TURNSTILE_SITE_KEY=<site-key-turnstile>
ADMIN_PROXY_SHARED_SECRET=<secret-yang-sama-dengan-worker>
```

Migrasi D1:

```bash
npm run d1:migrate:remote
```

Catatan CLI:
- `wrangler.toml` sekarang khusus Pages
- `wrangler.worker.toml` dipakai otomatis oleh script:
  - `npm run dev:worker`
  - `npm run deploy:worker`
  - `npm run d1:migrate:*`
- `npm test` sekarang menjalankan contract test yang sama dengan `npm run test:contracts`

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

Endpoint ini sekarang hanya readiness endpoint generik. Frontend publik tidak lagi mengambil detail runtime sensitif dari sini.

### Hardening Aset Pages

Sesudah deploy, URL source lama berikut seharusnya `404`:

```text
/public.js
/public.css
/config.js
/app.js
/styles.css
```

Catatan:
- JS/CSS frontend tetap publik secara prinsip karena harus dijalankan browser
- hardening di repo ini bertujuan menghilangkan file source mentah yang terlalu eksplisit dan menggantinya dengan aset minified hashed
- selain itu, path lama dipaksa `404` di Pages supaya alias produksi tidak kembali menampilkan file legacy
- HTML publik dan admin sekarang memakai `Content-Security-Policy`
- Worker JSON dan admin proxy juga menambahkan header `no-store`, `nosniff`, `strict-origin-when-cross-origin`, dan `noindex`

Contoh cek cepat:

```bash
curl -I https://autoscript.license.dpdns.org/
curl -I https://autoscript.license.dpdns.org/admin/
curl -I https://autoscript.license.dpdns.org/public.js
curl -I https://autoscript-license.pages.dev/
curl -I https://autoscript-license.minidecrypt.workers.dev/api/public/config
```

Yang diharapkan:
- `/` dan `/admin/` membawa `Content-Security-Policy`
- `/public.js` membalas `404`
- `/api/public/config` membawa `Cache-Control: no-store`

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
2. pastikan Cloudflare Access meminta login lebih dulu
3. setelah lolos Access, dashboard harus langsung terbuka tanpa login internal
4. coba lihat entries, audit log, dan metrics

## Troubleshooting Operator

Kalau `/admin/` gagal, cek urutan ini:

1. **Muncul login Access**
- kalau tidak muncul, path Access belum benar
- pastikan `/admin*` dan `/api/admin*` keduanya dilindungi

2. **Muncul `Cloudflare Access identity tidak tersedia.`**
- `/admin/` sudah dilindungi, tapi `/api/admin*` belum
- perbaiki policy Access untuk `/api/admin*`

3. **Muncul `Proxy admin belum dikonfigurasi.`**
- deployment Pages live belum membawa:
  - `PAGES_API_BASE_URL`
  - `ADMIN_PROXY_SHARED_SECRET`
- save env Pages lalu redeploy

4. **Muncul `Admin API hanya menerima request internal dari Pages.`**
- `ADMIN_PROXY_SHARED_SECRET` di Pages dan Worker tidak sama
- samakan nilainya lalu redeploy

5. **Domain custom `autoscript.license.dpdns.org` kena `403` / `cf-mitigated: challenge`**
- ini bukan bug aplikasi `autoscript-license`
- cek layer security Cloudflare pada zone custom domain
- pastikan perilaku pembanding sehat:
  - `autoscript-license.pages.dev/admin/` seharusnya redirect ke login Access
  - `autoscript-license.pages.dev/api/admin/session` seharusnya redirect ke login Access
- kalau `pages.dev` sehat tetapi custom domain tetap `403`, audit `Security Events / Rules Trace` untuk host custom itu

6. **Halaman kosong atau data tidak tampil**
- cek deployment Pages terbaru sukses
- cek Worker terbaru sudah deploy
- cek `/api/admin/session` di domain Pages setelah lolos Access

7. **Masih error setelah config benar**
- uji lewat incognito
- login ulang Access
- hard refresh browser

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
1. operator lolos Cloudflare Access di `/admin/`
2. Pages Functions meneruskan request `/api/admin/*` ke Worker
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

Secara default install baru di VPS memang akan memakai URL itu, tetapi `AUTOSCRIPT_LICENSE_API_URL` dan `AUTOSCRIPT_LICENSE_DEFAULT_API_URL` sekarang tetap bisa dioverride dari env/config jika ingin mengarah ke deployment Worker lain.

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
9. halaman `/` di `autoscript.license.dpdns.org` bisa aktivasi
10. halaman `/admin/` di hostname yang Anda lindungi bisa terbuka setelah lolos Cloudflare Access
11. `healthz` Worker normal
12. `/admin/` dan `/api/admin/session` pada hostname operator tidak tertahan challenge browser-level Cloudflare

## Catatan Keamanan

- `PUBLIC_TURNSTILE_SECRET_KEY` hanya boleh ada di Worker, bukan frontend
- `ADMIN_PROXY_SHARED_SECRET` hanya boleh ada di Pages dan Worker
- browser operator tidak perlu lagi memanggil `workers.dev` langsung untuk `/api/admin/*`
- Cloudflare Access harus melindungi `/admin*` dan `/api/admin*`
- kalau dua hostname aktif bersamaan, pastikan CORS Worker dan policy Access keduanya mengizinkan dua origin itu
