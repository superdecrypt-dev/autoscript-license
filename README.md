# Autoscript License

Sistem lisensi IP komprehensif untuk repositori `autoscript` dan `autoscript-lite` yang dibangun di atas ekosistem Cloudflare (Workers, Pages, D1, R2).

Repo ini adalah project standalone yang mencakup Backend API, Frontend React, dan skema Database.

Hostname publik saat ini:
- utama: `https://autoscript.license.dpdns.org`
- sekunder: `https://autoscript-license.pages.dev`

## Ringkasan Fitur

### Antarmuka (UI/UX) Modern
- **Full Dark Mode:** Desain eksklusif mode gelap yang konsisten dan elegan di seluruh halaman.
- **Micro-Interactions:** Animasi *breathing pulse* pada status sistem, ikon status raksasa (Hero Icons), dan transisi halus antar menu.
- **Mobile First:** Navigasi bawah (Bottom Nav) yang nyaman untuk HP dan tata letak tabel yang otomatis berubah menjadi kartu (card-based).
- **Floating Notifications:** Sistem notifikasi melayang di bagian atas layar untuk feedback instan (Edit, Tambah, Hapus, Revoke, Restore).

### Jalur Publik (`/`)
- **Register IP:** Pendaftaran IP baru dengan dukungan **Label (Opsional)** untuk identifikasi server.
- **Perpanjang (Renew):** Mendukung perpanjangan IP yang masih aktif maupun yang sudah **Expired**.
- **Cek Status:** Informasi detail masa aktif, sisa hari, dan **Alasan Revoke** yang transparan jika IP diblokir.
- **Anti-Abuse:** Proteksi Cloudflare Turnstile dan sistem Rate-Limit ganda (per visitor & per target IP).

### Jalur Admin (`/admin/`)
- **Dashboard "Live":** Ringkasan kesehatan sistem, grafik tren cek lisensi, dan kartu **Recent Activity** (5 aktivitas terbaru).
- **Entries Management:**
  - Pagination fleksibel (10, 25, 50, 100 baris).
  - Formulir "Tambah IP" berbasis Modal (Pop-up).
  - Sistem Konfirmasi (Yes/No) yang aman untuk Hapus & Revoke.
  - **Revoke dengan Alasan:** Mewajibkan input alasan pemblokiran yang terdokumentasi otomatis ke database.
- **Backup & Restore:** 
  - Snapshot otomatis dan manual ke `Cloudflare R2`.
  - Fitur **Preview** isi backup sebelum restore.
  - Tombol **Download** untuk mengamankan file backup ke komputer pribadi.

## Struktur Repo

- `worker/src/index.js`: "Otak" sistem (API Lisensi & Logika Bisnis).
- `migrations/`: Skema database D1 (IP, Logs, Rate Limits).
- `src/public/main.jsx`: Frontend Portal Publik (React).
- `src/admin/main.jsx`: Frontend Dashboard Operator (React).
- `src/shared/`: Komponen UI bersama, utilitas, dan konfigurasi.
- `src/styles/`: Entry point Tailwind CSS v4.
- `functions/`: Cloudflare Pages Functions (Proxy Admin & Auth Relay).
- `scripts/build-pages.mjs`: Orkestrasi build React/Tailwind ke aset produksi.

## Endpoint API Utama

### Client `autoscript` & `autoscript-lite`
- `POST /api/v1/license/check` (Validasi lisensi dari script VPS).

### Admin API
- `GET /api/admin/metrics` (Data statistik & tren).
- `GET /api/admin/backups/:key/download` (Unduh file snapshot).
- `POST /api/admin/license-entries/:id/revoke` (Blokir IP dengan alasan).

## Aturan Lisensi

1. **Durasi Default:** `14 hari` (bisa dikonfigurasi lewat vars).
2. **Pendaftaran:** Menu Register hanya menerima IP yang belum terdaftar.
3. **Perpanjangan:** Menu Perpanjang menerima IP aktif (jendela 3 hari sebelum expired) atau IP yang sudah expired.
4. **Perhitungan Expired:** Jika IP sudah expired, masa aktif baru dihitung dari **saat ini**.
5. **Pemblokiran (Revoke):** IP yang di-revoke ditolak total oleh sistem publik dan client VPS.

## Keamanan

- **Identity-based Auth:** Dashboard Admin dilindungi oleh Cloudflare Access.
- **Shared Secret:** Komunikasi antara Pages dan Worker menggunakan `ADMIN_PROXY_SHARED_SECRET`.
- **Database Integrity:** Foreign keys dan index pada D1 untuk memastikan data tidak duplikat.
- **Secure Headers:** Implementasi CSP yang ketat, HSTS, dan pencegahan Clickjacking.

## Pemeliharaan (Maintenance)

Sistem memiliki Cron Job otomatis yang berjalan setiap jam untuk:
- Membersihkan `audit_logs` lama (Retention 30 hari).
- Membersihkan data rate-limit yang sudah tidak berlaku.
- Membuat snapshot backup otomatis ke R2.
- Menghapus snapshot R2 yang sudah melewati masa simpan.

---
© 2026 Autoscript License Portal. Dirancang untuk stabilitas dan kemudahan pengelolaan infrastruktur.
