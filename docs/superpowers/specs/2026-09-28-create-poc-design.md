# Create POC — Spesifikasi

Tanggal: 2026-09-28 · Status: **draft, belum diimplementasi**

## Tujuan

Di setiap project ada fitur **Create POC**: SA menyusun konfigurasi AI Agent Cekat untuk klien, lengkap dan siap
disalin ke dashboard Cekat. Isinya mengikuti field yang ada di Cekat (AI Agent Behavior, Welcome Message, handoff,
AI Action, pipeline, Knowledge Base, API Integrations, Additional Settings). AI bisa membuatkan draft dari requirement
project, dan untuk setiap API integration SA Copilot membuatkan **workflow n8n (JSON)** yang bisa didownload lalu
di-import ke n8n.

## Letak di UI

- Tab baru di halaman project: **POC**, di antara *Diagrams* dan *Files* (grid tab jadi 8 kartu).
- Satu project bisa punya lebih dari satu POC (misalnya "AI CS WhatsApp" dan "AI Booking"). Daftar POC di kiri, editor
  di kanan, dengan urutan section sama seperti di dashboard Cekat supaya mudah disalin.
- Tombol di atas editor:
  - **Draft with AI**: isi semua section dari requirement, TOR, deck, dan jawaban klien.
  - **Export** → `.md` (seluruh konfigurasi, siap copy-paste ke Cekat) dan `.json` (data mentah POC).
  - **n8n** → download workflow n8n per API integration, atau semuanya sekaligus dalam `.zip`.
- POC punya versi (seperti dokumen lain), tercatat di audit trail, dan ikut auto-export ke folder project.

## Isi POC

### 1. AI Agent Behavior
| Field | Tipe | Keterangan |
|---|---|---|
| AI Agent Behavior | teks panjang (markdown) | Prompt AI: gaya bicara, identitas, aturan, batasan. |

### 2. Welcome Message
| Field | Tipe | Keterangan |
|---|---|---|
| Welcome Message | teks | Pesan pertama yang dikirim AI ke user. |
| Gambar | file gambar (opsional) | **Di-upload manual** oleh SA (PNG/JPG/WebP, maks 5 MB). AI tidak membuat gambar; AI hanya boleh menyarankan gambar apa yang cocok. |

### 3. Handoff ke human agent
| Field | Tipe | Keterangan |
|---|---|---|
| Agent Transfer Conditions | teks | Kondisi yang membuat AI mentransfer chat ke human agent. Status chat menjadi **Pending** dan muncul di **Assigned**. |
| Stop AI after Handoff | boolean | Hentikan AI mengirim pesan setelah status chat menjadi Pending. |
| Silent Agent Handoff | boolean | AI mentransfer percakapan diam-diam, tanpa balasan AI lagi. |

### 4. AI Action — Labels
Label yang boleh dipasang AI secara otomatis. **Satu chat bisa punya banyak label.**

| Field | Tipe | Keterangan |
|---|---|---|
| Nama label | teks | Contoh: `Booking`, `Komplain`, `VIP`. |
| Kondisi | teks | Kapan AI memasang label ini. |

### 5. Change Conversation Pipeline Status
Urutan status pipeline dan kondisi perpindahannya.

| Field | Tipe | Keterangan |
|---|---|---|
| Urutan | angka | Posisi di pipeline (1, 2, 3, …). |
| Nama status | teks | Contoh: `New Lead` → `Qualified` → `Booked` → `Done`. |
| Kondisi masuk | teks | Kondisi chat pindah **dari status sebelumnya ke status ini** (misalnya 1 → 2: "pasien sudah menyebut poli dan tanggal"). |

Aturan: status pertama nggak punya kondisi masuk (status awal). Urutan harus unik dan berurutan, dan editor mengurutkan ulang otomatis kalau baris dipindah.

### 6. Knowledge Base
Empat jenis sumber, masing-masing berupa daftar.

| Jenis | Field | Keterangan |
|---|---|---|
| **Text** | Judul section, isi (markdown) | Untuk data **statis**: profil klinik, jam operasional, daftar layanan, kebijakan. |
| **Website** | URL, catatan (opsional) | Daftar halaman untuk di-*crawl* Cekat sebagai KB. Validasi: harus `https://`. |
| **Files** | File PDF (dan DOCX/XLSX bila diizinkan Cekat) | Di-upload manual. SA Copilot menyimpan file dan hasil konversi markitdown untuk dibaca AI saat membuat draft. |
| **Q&A** | Question, Answer | Pasangan tanya-jawab. |

Sumber project yang sudah ada (tab Requirements, dan knowledge global) bisa **disalin** ke KB POC dengan satu klik.

### 7. API Integrations
Tool yang bisa dipanggil AI Agent saat percakapan. Setiap integration:

| Field | Tipe | Keterangan |
|---|---|---|
| Name | teks | Nama tool, contoh `cek_jadwal_dokter`. Huruf kecil, angka, `_` (maks 64). |
| HTTP Method | enum | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. |
| Description | teks | **Kapan tool ini harus dipakai dalam percakapan** (sama seperti tooltip di Cekat). |
| Webhook Address | URL | Alamat webhook yang dibuat di **n8n**. Terisi otomatis dari workflow n8n yang dibuat SA Copilot (lihat di bawah), atau diisi manual. |
| API Key (Bearer) | teks rahasia (opsional) | Dikirim sebagai `Authorization: Bearer <key>`. Disimpan terenkripsi, ditampilkan tersamar, dan **tidak ikut** ke export `.md`/`.json` maupun ke AI. |
| AI Input | JSON Schema | Payload yang diisi AI saat memanggil tool. Harus `type: "object"`, boleh berisi `properties`, `required`, `additionalProperties`, `description`, `enum`, `minimum`, `minLength`, `items`, `minItems`, dan objek bertingkat, seperti kedua contoh di bawah. |

Contoh **AI Input** (flat):

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "description": "this for type" },
    "body": { "type": "string", "description": "" },
    "userId": { "type": "integer", "description": "" }
  },
  "required": ["title", "body", "userId"],
  "additionalProperties": false
}
```

Contoh **AI Input** (array of objects):

```json
{
  "type": "object",
  "properties": {
    "users": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer", "minimum": 1 },
          "name": { "type": "string", "minLength": 1 },
          "role": { "type": "string", "enum": ["developer", "designer", "tester", "manager", "analyst"] }
        },
        "required": ["id", "name", "role"],
        "additionalProperties": false
      },
      "minItems": 1
    }
  },
  "required": ["users"],
  "additionalProperties": false
}
```

Editor AI Input:
- Editor JSON dengan validasi langsung (JSON valid, root `object`, setiap nama di `required` ada di `properties`).
- Tombol **Contoh payload**: membuat contoh data dari schema (untuk tes di n8n).
- AI bisa membuatkan schema dari Description.

### 8. Additional Settings
Default mengikuti dashboard Cekat.

| Field | Tipe | Default | Keterangan |
|---|---|---|---|
| AI History Limit | angka | 20 | Jumlah pesan yang diingat AI. |
| AI Read File Limit | angka | 3 | Jumlah pesan terakhir yang lampirannya dibaca AI. |
| AI Context Limit | angka | 10 | Kedalaman membaca knowledge source. Naikkan kalau entri KB banyak. |
| AI Temperature | enum | Balanced | Tingkat kreativitas jawaban. Pilihan sesuai Cekat. |
| Message Await | angka (detik) | 5 | Jeda sebelum AI membalas. |
| AI Message Limit | angka | 1000 | Batas pesan AI per sesi percakapan; reset saat chat di-resolve. |
| Watcher | enum | Off | Memantau respon AI agar fungsi penting dijalankan. |
| Timezone | enum | (GMT+7:00) Bangkok, Hanoi, Jakarta | Zona waktu AI. |
| Session-Only Memory | enum | Off | Jika aktif, AI tidak mengingat sesi sebelumnya. |
| Ignore Team Handoff | boolean | false | AI tidak mempertimbangkan penugasan tim saat handoff ke human agent. |

## Draft with AI

- Input: konteks project (requirement, knowledge, jawaban klien, TOR, SOW, deck mockup), bahasa project, dan dokumentasi
  Cekat lewat MCP (untuk memastikan fitur benar-benar ada).
- Output: seluruh section sebagai JSON terstruktur, lalu divalidasi (lihat Validasi) sebelum disimpan sebagai versi baru.
- Bisa juga **per section** ("Revise with AI" dengan instruksi, misalnya "tambahkan label untuk komplain BPJS").
- API Key, gambar welcome message, dan file KB tidak pernah dibuat AI.

## Workflow n8n (download)

Untuk setiap API integration, SA Copilot membuat file JSON workflow n8n yang bisa di-import lewat
*n8n → Workflows → Import from File*:

1. **Webhook** node (`n8n-nodes-base.webhook`)
   - `httpMethod` = HTTP Method integration, `path` = slug nama tool + id pendek (unik).
   - `authentication` = `headerAuth` bila API Key diisi. Credential *Header Auth* dibuat manual di n8n (nama header
     `Authorization`, value `Bearer <key>`). Key-nya **tidak** ditulis ke file JSON.
   - `responseMode` = `responseNode`.
2. **Validate input** node (Code): mengecek body terhadap AI Input schema (field wajib, tipe, enum, minimum/minLength,
   array minItems) dan membalas `400` dengan daftar error bila tidak valid.
3. **TODO: logika bisnis** node (NoOp) dengan sticky note berisi Description tool dan contoh payload, jadi tempat SA
   menyambungkan ke HIS/CRM/Google Sheets, dll.
4. **Respond to Webhook** node: membalas `200` JSON `{ "ok": true, "data": … }`, dengan contoh respon yang dibuat AI dari
   Description.

Setelah workflow di-import dan diaktifkan di n8n, SA menempel **Production URL** webhook ke field Webhook Address
(atau SA Copilot bisa mengisinya otomatis bila base URL n8n disimpan di Settings, format `https://<n8n>/webhook/<path>`).

Download: satu file per integration (`<poc>-<tool>.n8n.json`) atau semua dalam `<poc>-n8n.zip`.

## Validasi

- Name tool unik dalam satu POC, pola `^[a-z][a-z0-9_]{0,63}$`.
- Webhook Address harus URL `https://` (kecuali `http://localhost` untuk tes).
- AI Input harus JSON Schema valid (root `object`, `required` ⊆ `properties`).
- Pipeline: urutan unik dan berurutan; status pertama tanpa kondisi.
- Label: nama unik.
- Additional Settings: angka ≥ 0, dan enum hanya nilai yang diizinkan Cekat.

## Data

Tabel `pocs` (id, project_id, name, created/updated) + `poc_versions` (append-only seperti `document_versions`, berisi
seluruh konfigurasi sebagai JSONB), `poc_files` (gambar welcome message dan file KB, disimpan di folder upload),
dan `poc_secrets` (API key per integration, terenkripsi dengan key dari `.env`). Audit trail lewat trigger seperti tabel lain.

## Di luar lingkup (versi pertama)

- Push konfigurasi langsung ke dashboard Cekat lewat API (belum ada API publik yang terkonfirmasi).
- Deploy workflow ke n8n lewat n8n API (bisa ditambah nanti dengan `N8N_API_URL` + `N8N_API_KEY`).
- Crawl website dari SA Copilot sendiri (crawling dilakukan Cekat).

## Pertanyaan terbuka

1. **Pilihan enum** untuk AI Temperature, Watcher, dan Session-Only Memory: selain "Balanced"/"Off", apa saja nilai
   persisnya di Cekat?
2. **Files KB**: format apa saja yang diterima Cekat selain PDF?
3. **Base URL n8n**: mau disimpan di Settings supaya Webhook Address terisi otomatis?
4. **Satu atau banyak POC per project?** (spesifikasi ini mengasumsikan banyak.)
5. **Export**: cukup `.md` + `.json`, atau perlu juga `.docx` untuk dikirim ke klien?
