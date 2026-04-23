# Konteks Instruksi Gemini: Autoscript License

Proyek ini adalah sistem lisensi komprehensif untuk alamat IP VPS, yang dibangun khusus di ekosistem Cloudflare (Workers, Pages, D1, R2). Proyek ini berfungsi sebagai backend lisensi dan portal untuk repositori `autoscript` dan `autoscript-lite`.

## Ringkasan Proyek

- **Tujuan:** Mengelola dan memvalidasi lisensi berbasis IP untuk deployment VPS.
- **Teknologi Utama:**
    - **Cloudflare Worker:** API utama dan logika bisnis (`worker/src/index.js`).
    - **Cloudflare Pages:** Hosting untuk frontend React (Publik dan Admin).
    - **Cloudflare D1:** Database SQL untuk entri lisensi, log audit, dan rate limit.
    - **Cloudflare R2:** Backup dan restore berbasis snapshot.
    - **Cloudflare Turnstile:** Proteksi anti-abuse untuk aktivasi/perpanjangan lisensi publik.
    - **Cloudflare Access:** Proteksi berbasis identitas untuk portal Admin.

## Struktur Repositori

- `worker/`: Kode sumber Cloudflare Worker (Backend).
- `src/`: Kode sumber React (Frontend).
    - `src/public/`: Portal publik untuk aktivasi dan cek status IP.
    - `src/admin/`: Dashboard operator untuk manajemen lisensi.
    - `src/shared/`: Komponen bersama, utilitas, dan konfigurasi.
    - `src/styles/`: Entry point untuk Tailwind CSS.
- `pages/`: Aset statis dan template dasar untuk Cloudflare Pages.
- `functions/`: Cloudflare Pages Functions (middleware/proxy).
- `migrations/`: Skema database D1 dan skrip migrasi.
- `scripts/`: Skrip build kustom (misalnya, `build-pages.mjs`).
- `tests/`: Pengujian kontrak dan integrasi.

## Membangun dan Menjalankan

### Pengembangan
- **Worker:** `npm run dev:worker` (Menjalankan Wrangler dev untuk API).
- **Pages:** `npm run dev:pages` (Membangun frontend dan menjalankan Wrangler pages dev).

### Build
- **Build Frontend:** `npm run build:pages` (Menggunakan ESBuild dan PostCSS/Tailwind untuk menghasilkan folder `dist/`).

### Deployment
- **Deploy Worker:** `npm run deploy:worker`
- **Deploy Pages:** `npm run deploy:pages`
- **Terapkan Migrasi:**
    - Lokal: `npm run d1:migrate:local`
    - Remote: `npm run d1:migrate:remote`

### Pengujian
- **Jalankan Tes:** `npm test` atau `npm run test:contracts` (Menjalankan tes kontrak menggunakan test runner bawaan Node.js).

## Konvensi Pengembangan

- **Frontend:**
    - Menggunakan React (JSX) dengan Tailwind CSS (v4).
    - Menggunakan ESBuild untuk bundling dan hashing aset.
    - Konfigurasi di-inline saat proses build dari variabel lingkungan atau `pages/config.js`.
- **Backend:**
    - Cloudflare Worker standar (ES Modules).
    - Titik masuk tunggal di `worker/src/index.js` dengan routing internal.
    - Menggunakan binding `LICENSE_DB` (D1) dan `LICENSE_BACKUPS` (R2).
- **Database:**
    - Skema berbasis SQL (kompatibel dengan SQLite).
    - Migrasi dilacak di direktori `migrations/`.
- **Keamanan:**
    - Endpoint admin (`/api/admin/*`) dilindungi oleh secret bersama (`ADMIN_PROXY_SHARED_SECRET`) dan Cloudflare Access.
    - Endpoint publik dibatasi kecepatannya (rate-limited) dan dilindungi oleh Turnstile.
    - Header CSP yang ketat dihasilkan selama proses build Pages.

## Berkas Penting
- `worker/src/index.js`: "Otak" dari sistem lisensi.
- `wrangler.toml`: Konfigurasi, variabel, dan binding untuk Worker (Utama).
- `wrangler.pages.toml`: Konfigurasi untuk Cloudflare Pages.
- `scripts/build-pages.mjs`: Orkestrasi build kustom untuk frontend React.
- `migrations/0001_initial.sql`: Skema database dasar.
