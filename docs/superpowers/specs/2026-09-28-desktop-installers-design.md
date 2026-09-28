# Installer Desktop (Windows .exe & macOS .dmg) — Spesifikasi

Tanggal: 2026-09-28 · Status: **disetujui (desain), belum diimplementasi**

## Tujuan

SA Copilot bisa di-install di device apa pun — **Windows 64-bit** lewat installer `.exe` dan **macOS** (Apple Silicon
& Intel) lewat `.dmg` — lalu langsung jalan tanpa setup manual. Semua yang sekarang dijalankan terpisah di laptop
(PostgreSQL, 9router, Python untuk markitdown & python-pptx, server SA Copilot) ikut terpasang dan dijalankan otomatis
oleh aplikasi.

Kriteria berhasil:

- Di device kosong (tanpa Node, PostgreSQL, Python, 9router), install → buka aplikasi → layar Setup → isi 9router API key
  → semua fitur yang ada hari ini berfungsi (project, deliverables, AI draft, upload + konversi markitdown, pitch deck
  PPTX, POC, Download MD, Send to Notion, Outline).
- Menutup aplikasi tidak meninggalkan proses Postgres/9router/server yang masih hidup.
- Data bisa dipindah antar device lewat Backup & Restore.
- Instalasi tidak bentrok dengan PostgreSQL / 9router / Python yang mungkin sudah terpasang di device.

Keputusan yang sudah diambil:

| Topik | Keputusan |
|---|---|
| Teknologi | Electron + electron-builder |
| Build `.dmg` | Di Mac milik user (`npm run dist:mac`); `.exe` di-build di Windows (`npm run dist:win`) |
| Code signing | Tidak dulu; panduan membuka app yang belum di-sign ditulis di `docs/BUILD.md` |
| Key / rahasia | Tidak dibundel ke installer; diisi di layar Setup, disimpan terenkripsi per device |
| Data antar device | Backup & Restore file `.sacopilot` |
| Migrasi cloud (Vercel/Render/Supabase/R2) | Ditunda, di luar spesifikasi ini |

## Di luar lingkup

Code signing & notarization, auto-update, Linux, multi-user, sinkronisasi antar device, migrasi cloud.

## Arsitektur

```
SA Copilot.app / SA Copilot.exe (Electron)
├─ Main process
│  ├─ Postgres embedded   → data di folder data user
│  ├─ 9router             → Node bawaan Electron, 127.0.0.1:<port>, tanpa tray/browser
│  ├─ Server SA Copilot   → bundle JS dari server/, proses anak, 127.0.0.1:<port>
│  └─ shutdown rapi saat app ditutup
├─ Window utama           → memuat UI dari server lokal (sama seperti localhost:3000 sekarang)
└─ Resources              → Python portable (+ markitdown, python-pptx), template deck, db/schema.sql
```

**Folder data** (tidak ikut terhapus saat update/reinstall):

- Windows: `%APPDATA%\SA Copilot\`
- macOS: `~/Library/Application Support/SA Copilot/`

Isi: `pg/` (cluster Postgres), `uploads/`, `logs/`, `config.json`. Folder export default: `Documents/SA Copilot`
(bisa diubah di Settings).

**9router** memakai folder datanya sendiri di home user (`~/.9router`), sehingga login/provider yang sudah ada di
device itu ikut terpakai.

## Lifecycle

### Start

1. Single-instance lock — membuka aplikasi kedua kali hanya memfokuskan jendela yang ada.
2. Splash dengan status bertahap: "Menyiapkan database…" → "Menjalankan AI router…" → "Menjalankan SA Copilot…".
3. Port untuk Postgres, 9router, dan server dipilih dari port kosong (tidak memakai 5432/20128/3000 secara tetap).
4. Postgres: run pertama → `initdb` dengan password acak (disimpan terenkripsi di config) dan buat database
   `sa_copilot`; run berikutnya → start. `postmaster.pid` basi dari crash sebelumnya dibersihkan bila prosesnya
   sudah tidak ada. Skema dijalankan oleh server seperti sekarang (`db/schema.sql`, idempoten).
5. 9router: kalau device sudah menjalankan 9router di port default 20128, itu yang dipakai. Kalau tidak, server
   Next.js bawaan paket 9router (`node_modules/9router/app/server.js`) dijalankan dengan `process.execPath` +
   `ELECTRON_RUN_AS_NODE=1`, `HOSTNAME=127.0.0.1`, `PORT=<p>`, dan `NODE_PATH` ke `node_modules` miliknya (sql.js
   sudah ada di sana — tidak ada `npm install` saat runtime).
6. Server: bundle `server/` (esbuild, satu file) dijalankan sebagai proses anak dengan env hasil config:
   `DATABASE_URL`, `ANTHROPIC_BASE_URL=http://127.0.0.1:<port 9router>`, `ANTHROPIC_API_KEY` (9router API key),
   `UPLOAD_DIR`, `DOCS_DIR`, `DECK_TEMPLATE`, `MARKITDOWN_PYTHON` (Python bundel), key opsional (Outline, Demo,
   Notion), `PORT`.
7. Jendela utama dibuka setelah health check server (`GET /api/projects` 200).

### Kegagalan

| Kejadian | Perilaku |
|---|---|
| Postgres / server gagal start | Splash menampilkan error + tombol **Retry**, **Buka log**, **Keluar** |
| 9router gagal start | App tetap terbuka; fitur AI "tidak tersedia" (perilaku yang ada); Settings punya **Restart AI router** |
| Server crash saat dipakai | Restart otomatis satu kali; crash kedua → dialog error + lokasi log |

Log per komponen di `folder data/logs/` (`postgres.log`, `9router.log`, `server.log`), dirotasi per ukuran.

### Stop

Saat app ditutup: hentikan server → hentikan 9router beserta process tree-nya → `pg_ctl stop -m fast`.

### Penyesuaian fitur khusus Windows

- `revealInExplorer` membuka folder/file dengan `explorer.exe` di Windows dan `open` di macOS (server berjalan di
  device yang sama, jadi tidak perlu jembatan ke Electron). Outline MCP dijalankan dari paket
  `outline-mcp-server` yang dibundel (bukan `npx`), karena device baru tidak punya Node/npm.
- Path default export pindah ke `Documents/SA Copilot`.

## Setup & Connections

- **Layar Setup** muncul saat config belum lengkap (pembukaan pertama); bisa dibuka lagi di **Settings → Connections**.
- Semua nilai yang dulu ada di `.env` bisa dilihat dan **diganti kapan saja** di Settings → Connections (layar Setup
  hanya menampilkan bagian AI). Field:
  - **AI:** 9router API key (wajib), endpoint AI opsional (kosong = 9router bawaan; bisa ke 9router lain atau langsung
    ke Claude API), model default, effort chat & drafting + tombol "Buka dashboard 9router", **Tes koneksi**
    (memanggil `/api/ai/models`), dan **Restart AI router**.
  - **Outline:** URL, key. **Demo app:** Supabase URL, key, app URL. **Notion:** token, halaman induk.
  - **Folder:** folder export, template pitch deck (.pptx).
  - Yang dikelola aplikasi sendiri (port, password database) tidak ditampilkan.
- Key yang sudah tersimpan tidak pernah ditampilkan ulang; field hanya menunjukkan "tersimpan" dan bisa diganti atau
  dihapus.
- Penyimpanan: `config.json` di folder data; semua key dienkripsi dengan Electron `safeStorage`
  (Windows DPAPI, macOS Keychain) — tidak terbaca bila file disalin ke device lain.
- UI ↔ config lewat `preload` (contextBridge, `contextIsolation: true`, tanpa `nodeIntegration`). Save → server
  di-restart otomatis agar key baru aktif.
- Mode development (tanpa Electron): section Connections disembunyikan, `.env` tetap dipakai. `npm run dev`,
  `npm run serve`, dan `SACopilot.bat` tidak berubah.

## Backup & Restore

Tersedia di **Settings → Backup**, di aplikasi terinstal maupun mode development (jadi data laptop ini bisa dipindah).

**Backup** → file `SA Copilot backup YYYY-MM-DD.sacopilot` (zip):

- `manifest.json`: versi aplikasi, versi skema, tanggal, jumlah baris per tabel, jumlah file.
- `db/<tabel>.json`: semua baris per tabel.
- `files/…`: semua file upload & lampiran.
- Key / config **tidak** ikut.

**Restore**:

1. Pilih file → tampil ringkasan (jumlah project, dokumen, file).
2. Konfirmasi dengan mengetik `RESTORE`.
3. Backup otomatis data saat ini ke folder data sebelum ditimpa.
4. Kosongkan & isi ulang tabel dalam **satu transaksi**, urut sesuai foreign key; gagal → rollback, data lama utuh.
5. File upload ditulis setelah transaksi DB berhasil.
6. Skema dijalankan ulang agar backup dari versi lama mendapat kolom/tabel baru.

Validasi: manifest wajib ada; tabel tak dikenal diabaikan dengan peringatan; file backup maksimal 2 GB dan tiap file
upload di dalamnya maksimal 50 MB (sama dengan batas upload sekarang); nama file di zip divalidasi (tidak boleh keluar
dari folder upload).

## Build

Struktur baru:

```
electron/
  main.ts            lifecycle, splash, jendela utama, single instance
  services/
    postgres.ts      init/start/stop Postgres embedded
    router9.ts       start/stop 9router
    server.ts        start/restart server + health check
    ports.ts         cari port kosong
  config.ts          config.json + safeStorage → env server
  preload.ts         jembatan UI ↔ config (Setup, Connections, reveal file)
  splash.html
scripts/
  bundle-server.mjs  server/ → satu file JS (esbuild)
  fetch-python.mjs   Python portable per OS target + pip install deps
electron-builder.yml NSIS (win x64), DMG (mac arm64 + x64)
docs/BUILD.md        cara build, checklist Mac, cara membuka app yang belum di-sign
```

Perintah:

- Windows: `npm run dist:win` → `release/SA Copilot Setup <versi>.exe`
- macOS: `npm run dist:mac` → `release/SA Copilot-<versi>-arm64.dmg` dan `…-x64.dmg`

Pipeline: typecheck → test → build UI (Vite) → bundle server → unduh Python & Postgres untuk OS/arsitektur target →
electron-builder.

Isi Python bundel: `markitdown[pdf,docx,pptx,xlsx,xls,outlook]` dan `python-pptx` (bukan `[all]`, yang menarik paket
audio/YouTube/Azure yang tidak dipakai).

Perkiraan ukuran: installer ±300–400 MB, terpasang ±0,7–1 GB. Angka pasti dilaporkan setelah build pertama.

## Testing

- **Unit** (vitest): pemilihan port, penyusunan env dari config, format & validasi manifest backup, urutan tabel
  restore, validasi nama file di zip.
- **Integration**: backup → restore → bandingkan data terhadap database sungguhan.
- **Smoke test Windows**: install silent ke folder sementara → app start → Postgres, 9router, server hidup → health
  check lulus → tutup → tidak ada proses tersisa → uninstall.
- **macOS**: checklist manual di `docs/BUILD.md` (tidak bisa dites dari Windows).
