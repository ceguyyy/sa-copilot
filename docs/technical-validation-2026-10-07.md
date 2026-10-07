# Validasi technical design dan optimasi

Tanggal: 7 Oktober 2026

## Acuan dan lingkup

- `README.md`: arsitektur dan perilaku aplikasi v2.1 saat ini.
- `docs/superpowers/specs/2026-09-28-desktop-installers-design.md`: startup, penanganan kegagalan, shutdown, dan backup/restore desktop.
- `docs/superpowers/specs/2026-09-28-sa-copilot-design.md`: structured documents, versioning append-only, konteks AI, dan error handling. Bagian Supabase/RLS pada dokumen ini bersifat historis, sesuai catatan migrasi di dalamnya.
- `docs/superpowers/specs/2026-09-28-create-poc-design.md`: acuan POC; keputusan terbaru di README mengutamakan satu gateway workflow n8n.

Graphify dipakai untuk menemukan modul terkait. Temuan implementasi diverifikasi dari source dan tes, karena graph sebelumnya memiliki peringatan integritas.

## Perbaikan

1. **Lifecycle server desktop** (`electron/services/server.ts`): error spawn ditangani dan diteruskan ke startup/error UI. Health polling bisa dibatalkan ketika startup gagal, aplikasi berhenti, atau monitor diganti. Startup yang gagal menghentikan child process. Saat crash pada startup, satu monitor yang sama memantau proses pengganti, sehingga tidak ada polling tambahan yang melaporkan error terlambat. Kebijakan satu restart otomatis tetap dipertahankan.
2. **Deep link evidence** (`SourcesPanel`, `QuestionsPanel`): state disiapkan saat render menggunakan hook `useResetState` yang sudah ada. Effect hanya melakukan scroll. Pembaruan cache tidak lagi membuka sumber yang sudah ditutup atau mengatur ulang filter pilihan pengguna. Dua karakter BOM di tengah import dibuang.
3. **Pemuatan UI** (`App`, `Layout`): sepuluh halaman menggunakan lazy import. Suspense berada di area isi halaman sehingga navigasi tetap tersedia selama pemuatan. Pemulihan preload chunk setelah rebuild tetap memakai mekanisme yang sudah ada di `main.tsx`.

## Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| Baseline `npm test` | 445 lulus, 13 dilewati |
| Final `npm test` | 450 lulus, 13 dilewati oleh default configuration |
| Integrasi terpisah | 15 lulus, termasuk seluruh 13 tes yang dilewati pada baseline dan 2 tes pemetaan platform |
| `npm run lint` | Bersih; 4 warning baseline teratasi |
| `npm run build` | Typecheck dan production build berhasil |
| `npm run bundle` | Bundle server, Electron main, dan preload berhasil |
| `git diff --check` | Lulus |
| Smoke production UI | Home, Projects, Knowledge, QA, Trash terbuka tanpa page error; halaman berat belum dimuat sebelum navigasi |

Integrasi memakai cluster PostgreSQL baru dalam folder sementara, database `sa_design_test`, serta browser headless dengan fixture livechat lokal. Tidak memakai database aplikasi pengguna. Suite database dijalankan berurutan karena beberapa suite melakukan truncate. Startup/shutdown, restart cluster, UTF-8, pemulihan orphan Postgres, backup/restore, trash, Inbox, dan restore versi POC tercakup.

Smoke UI memakai hasil `dist/` dengan respons API tiruan. Ini memverifikasi routing dan pemuatan chunk, bukan integrasi backend produksi.

## Ukuran bundle utama

| JS entry hasil Vite | Sebelum | Sesudah |
| --- | ---: | ---: |
| Minified | 1.000,92 kB | 334,12 kB |
| Gzip | 300,59 kB | 108,14 kB |

Entry minified berkurang sekitar 66,6%; gzip sekitar 64,0%. Ini ukuran entry JS, bukan total seluruh aset atau pengukuran waktu startup. Shared chunk dan aset fitur masih ada. Warning chunk besar tetap ada untuk library diagram dan Excel yang dimuat sesuai kebutuhan.

## Batas verifikasi

Belum menjalankan installer Windows, checklist macOS, atau panggilan ke layanan AI/Notion/Outline/cloud yang sesungguhnya. Karena dokumen desain awal mengandung keputusan historis, hasil ini merupakan validasi pada lingkup yang diuji, bukan sertifikasi kesesuaian penuh seluruh fitur.

Lima tes regresi baru mencakup executable hilang, penghentian startup sebelum sehat, pembatalan polling, sumber yang ditutup setelah deep link, dan filter pertanyaan setelah deep link.
