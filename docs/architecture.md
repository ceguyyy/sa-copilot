# Arsitektur SA Copilot

Diagram berdasarkan implementasi kode pada 7 Oktober 2026. Nilai rahasia dan URL koneksi lengkap tidak disertakan.

## Arsitektur runtime

```mermaid
flowchart TB
    USER[Solution Architect]

    subgraph DEVICE[Komputer pengguna]
        subgraph DESKTOP[Aplikasi desktop Electron]
            MAIN[Main process\nLifecycle dan supervisor]
            PRELOAD[Preload / contextBridge\nIPC terbatas]
            UI[React UI\nVite + TanStack Query\nHalaman dimuat sesuai kebutuhan]
            CONFIG[config.json\nSecret terenkripsi safeStorage]
            UPDATER[Windows updater\nCek versi, download, restart]
            MAIN <-->|IPC| PRELOAD
            PRELOAD <--> UI
            MAIN <--> CONFIG
            MAIN --> UPDATER
        end

        subgraph LOCAL[Layanan lokal di 127.0.0.1]
            API[Node.js + Hono\nREST API dan static UI]
            AI[AI orchestration\nKonteks, skills, tools\nNDJSON streaming]
            BACKUP[Backup / restore\nMaintenance lock dan revision check]
            ROUTER[9router\nEmbedded atau instance yang sudah aktif]
            PG[(PostgreSQL lokal\nProjects, sources, documents\nVersions, POCs, audit)]
            FILES[(Filesystem lokal\nUploads, exports, backups, logs)]
            PY[Python\nmarkitdown + python-pptx]
            QA[Playwright\nBrowser QA]
            HTTP[SAPostman\nHTTP request runner, environments\nCollection runner dan assertions]
            API --> AI
            API --> BACKUP
            API <--> PG
            API <--> FILES
            API --> PY
            API --> QA
            API --> HTTP
            AI --> PG
            AI --> FILES
            AI <-->|Model API| ROUTER
            BACKUP <--> PG
            BACKUP <--> FILES
        end

        MAIN -->|Start, restart, stop| API
        MAIN -->|Start / stop embedded| PG
        MAIN -->|Start jika belum aktif| ROUTER
        UI <-->|HTTP REST + NDJSON| API
    end

    subgraph EXTERNAL[Layanan eksternal]
        MODELS[Provider model AI]
        CLOUD[(Supabase PostgreSQL\nSchema sa_copilot_sync\nAccounts, recovery, workspaces, snapshots)]
        MCP[MCP tools\nCekat Docs / Outline]
        NOTION[Notion\nPublish project]
        DEMO[Healthcare demo\nSupabase REST]
        CHAT[Cekat Livechat\nTarget QA]
        RELEASES[GitHub Releases publik\nInstaller dan metadata Windows]
    end

    USER --> UI
    ROUTER <-->|Provider API| MODELS
    AI <-->|MCP| MCP
    API <-->|Login / akun melalui PostgreSQL TLS| CLOUD
    BACKUP <-->|Push / pull snapshot melalui PostgreSQL TLS| CLOUD
    API -->|Export project| NOTION
    API -->|Skenario demo| DEMO
    QA <-->|Interaksi browser| CHAT
    UPDATER <-->|HTTPS| RELEASES
    UPDATER -->|Backup sebelum update| BACKUP
```

## Perpindahan data antar komputer

```mermaid
sequenceDiagram
    actor SA as Solution Architect
    participant A as SA Copilot komputer A
    participant DB as PostgreSQL + file lokal A
    participant C as Supabase sa_copilot_sync
    participant B as SA Copilot komputer B
    participant DBB as PostgreSQL + file lokal B

    SA->>A: Upload this computer to cloud
    A->>DB: Ambil snapshot tabel dan file referensi
    A->>C: Cek revision dan simpan snapshot baru (TLS)
    C-->>A: Revision terbaru
    SA->>B: Login akun yang sama
    B->>C: Baca status workspace akun
    SA->>B: Konfirmasi RESTORE
    B->>C: Download snapshot revision yang dipilih
    C-->>B: Arsip .sacopilot
    B->>DBB: Simpan safety backup lokal
    B->>DBB: Restore tabel dalam satu transaksi
    B->>DBB: Terapkan schema dan ganti file upload
    B-->>SA: Data lokal siap digunakan
```

## Keputusan arsitektur

- Windows terinstal memakai `electron-updater` dan GitHub Releases publik. Update memasang versi baru setelah safety backup dan shutdown layanan; detail di `windows-auto-update.md`.
- SAPostman mengimpor cURL dan menerima payload dari use case POC/n8n. Collection, environment, endpoint, dokumentasi, versi, dan riwayat kirim disimpan di PostgreSQL serta ikut backup. Variable memiliki scope collection/environment/API; runner meneruskan hasil extraction hanya selama run. Auth dihapus dari snapshot riwayat; endpoint yang sengaja disimpan mencakup auth. Request dijalankan setelah Hit / Send, dengan timeout 1–120 detik, respons maksimal 2 MB, dan redirect manual. AI memberi saran yang direview sebelum diterapkan; detail di `sapostman.md`.
- Database kerja utama berada di komputer pengguna. Supabase menyimpan akun dan snapshot backup untuk perpindahan antar komputer; transfer snapshot dilakukan secara manual dengan pemeriksaan revision.
- Akses cloud menggunakan koneksi PostgreSQL melalui TLS dengan verifikasi sertifikat. Integrasi healthcare demo menggunakan Supabase REST yang terpisah.
- Endpoint cloud memakai workspace `account:<account.id>`. Walaupun `CLOUD_WORKSPACE` masih dibaca konfigurasi, route cloud yang membutuhkan login menggunakan workspace akun tersebut.
- Mode desktop menerima konfigurasi dari Electron `config.json` melalui environment child process. Mode source membaca `.env`; mengubah `.env` tidak otomatis mengubah konfigurasi desktop.
- Electron mengelola Postgres, router, dan server. Pada mode source, browser mengakses server lokal dan PostgreSQL/9router dijalankan terpisah. Port desktop dipilih dinamis.
- UI tidak mengakses database atau kredensial cloud secara langsung. Pengaturan desktop melewati preload IPC dengan `contextIsolation`, sandbox, dan tanpa Node integration.
- Versi dokumen dan POC baru ditambahkan sebagai riwayat. Restore versi tidak mengganti riwayat lama.
- Backup cloud mencakup tabel dan upload yang direferensikan, maksimal 100 MB per snapshot, dengan retensi sepuluh revision. Konfigurasi koneksi perangkat tidak ikut dipindahkan.

Secret vault SAPostman menyimpan nilai di file lokal terenkripsi AES-256-GCM dengan key dari password via scrypt. File vault berada di luar snapshot database/uploads dan tidak ikut cloud backup; endpoint menyimpan referensi `{{vault.name}}`. Resolve dilakukan server saat Send/Preview; preview menyamarkan nilai. Cancel request memakai AbortController pada server, termasuk saat membaca response.

## Referensi implementasi

| Bagian | Source |
| --- | --- |
| Desktop dan lifecycle | `electron/main.ts`, `electron/services/server.ts`, `electron/services/postgres.ts`, `electron/services/router9.ts` |
| Config dan IPC | `electron/config.ts`, `electron/preload.ts`, `electron/bridge.ts` |
| Server dan route | `server/index.ts`, `server/routes.ts` |
| AI dan konteks | `server/ai/handler.ts`, `server/ai/context.ts`, `server/ai/mcp.ts` |
| Database lokal | `server/db.ts`, `db/schema.sql` |
| Backup dan sinkronisasi | `server/backup/service.ts`, `server/maintenance/cloud.ts`, `server/maintenance/routes.ts` |
| Akun cloud | `server/auth.ts`, `server/accountRecovery.ts`, `db/supabase-sync.sql` |
| UI dan pemuatan halaman | `src/App.tsx`, `src/components/Layout.tsx` |
