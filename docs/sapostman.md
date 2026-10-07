# SAPostman

SAPostman is a local HTTP workspace available in source mode and desktop Windows/macOS. Open it from the sidebar or **Test in SAPostman** on a POC API integration / n8n use case. Opening/importing never sends a request automatically.

## Endpoints and history

- **Add collection** groups saved APIs. Pick an endpoint's Collection and Save / Update to move it. Rename a collection or delete it to move its APIs to Unfiled. **Export collection** downloads a `.sapostman.json` containing current endpoint templates and docs, with authentication removed. This is SAPostman's native JSON format, not a Postman collection file.
- Docs supports font family, text size, headings, bold/italic/underline/strike, lists, alignment, color, undo/redo and preview. Formatting is stored in `docsHtml`; plain text stays available for AI. Imported/generated HTML is sanitized before display.
- **Ask your SA** uses the same collapsed vertical rail as project pages, with open/collapse/resize controls. Endpoint, response and error context remain available while the panel is open.

- **Save** creates an endpoint and version 1. **Update** appends a version; concurrent stale updates are rejected. **Save as new** creates a separate endpoint.
- **Version history** loads an earlier snapshot. Use **Update** to restore it as a new version, preserving earlier versions.
- **Delete endpoint** moves the API to Trash after confirmation; restore remains available for 30 days with docs and versions.
- **History** keeps the last 100 sends, including non-2xx responses, network failures and assertion results. Select one to inspect or replay; delete individual entries as needed.
- Saved endpoints, versions and send history are PostgreSQL tables included in local/cloud backups. Saved credentials are included when explicitly saved. Authentication headers/fields and common JSON secret fields are redacted in send-history snapshots. Payloads and responses may contain other sensitive business data.

## Request tabs

| Tab | Behaviour |
| --- | --- |
| Docs | Formatted documentation, preview/copy and Generate docs with AI |
| Params | Enabled query parameter rows appended to the existing URL |
| Authorization | No Auth, Basic, Bearer, API Key (header/query), JWT Bearer, existing OAuth 2.0 access token |
| Headers | Editable enabled rows and descriptions; transport-controlled headers are rejected |
| Body | None; raw JSON/Text/JavaScript/HTML/XML; URL-encoded; multipart text fields; binary file up to 2 MB; GraphQL query and JSON variables |
| Scripts | Declarative JSON pre-request rules and post-response assertions, validated before sending |
| Settings | Timeout 1–120 seconds, verified TLS, manual redirects, response cap 2 MB |

JWT signing, OAuth token acquisition/refresh, Digest, Hawk and OAuth 1.0 are not implemented. Form-data file parts are not supported; Binary sends one file directly. Beautify formats valid JSON. Raw JavaScript is transmitted as body text, not executed.

Pre-request rules:

```json
{"headers":{"X-Test":"true"},"params":{"debug":"1"}}
```

Post-response assertions:

```json
[
  {"name":"Created","target":"status","equals":201},
  {"name":"Content type","target":"header","path":"content-type","equals":"application/json"},
  {"name":"Success","target":"json","path":"result.ok","equals":true}
]
```

## Variables

Define endpoint variables under **Variables**, for example `base_url = https://example.com` and `customer_id = C123`. Use `{{base_url}}/customers/{{customer_id}}` in the URL and `{{token}}` in Authorization. Enabled variables resolve in URL, params, headers, auth, active body, GraphQL variables and JSON script rules at send time. Values are substituted literally; nested references are supported, while missing, duplicate or circular variables stop sending. Templates and variables are retained in saved endpoints and version history. Mark sensitive values as secret; values referenced by auth are also redacted from history/AI automatically. Re-enter redacted values before replaying history.

## AI

Use **Generate request**, **Trace error**, or **Generate docs** with the configured AI model. Endpoint content and current response are submitted intentionally; auth fields are removed. Review remaining payload/response content before asking. Suggestions appear first; **Apply generated request/docs** changes the editor without saving or sending. Trace output distinguishes response evidence from hypotheses; it cannot inspect the remote server's private logs.

## Verification

Unit checks cover POC cURL import, auth/params/body serialization, assertions, redaction, IPC compatibility, and UI navigation without automatic send. PostgreSQL integration checks cover save/update/conflicts/versions/delete, a real local HTTP send, success/error history, AI suggestion handling with a mock model, and backup/restore. Live provider quality needs testing with a configured model.

### Collection tree dan panel SA

Collection dapat dibuka/tutup sendiri atau lewat Collapse collections / Expand collections. Drag API tersimpan ke collection tujuan (atau Unfiled) menyimpan perpindahan sebagai versi baru. Simpan edit API yang sedang aktif sebelum memindahkannya.

Ask your SA menggunakan layout chat seperti panel project: percakapan di tengah, input dan Send di bawah, serta clear, resize, dan collapse. Percakapan sebelumnya disertakan untuk pertanyaan lanjutan (maksimal 20 pesan). Memilih API lain mengosongkan percakapan agar konteks endpoint tidak tercampur. Chat berlangsung selama halaman terbuka; tidak disimpan sebagai riwayat permanen.

## Workspace, environments dan automation

- Environment Dev/Staging/Prod bisa dibuat, diganti nama, diedit dan dihapus lewat Manage environments. Variable collection diedit di tab Variables. Keduanya tersimpan di PostgreSQL, ikut backup, dan memakai pemeriksaan versi untuk mencegah save dari editor lama menimpa perubahan baru.
- Urutan override: collection, environment aktif, variable API, lalu variable hasil response runner. Variable disabled tidak menimpa scope sebelumnya. Hover variable mengedit dan menyimpan scope asalnya; variable baru disimpan di API.
- API dibuka dalam beberapa tab; draft, response, dan chat masing-masing tetap tersedia saat berpindah tab. Titik pada judul menandai perubahan belum disimpan. Close meminta konfirmasi jika draft berubah. Tab hanya bertahan selama halaman terbuka.
- Search mencari nama collection, nama API, dan URL. Klik kanan API membuka rename, duplicate, move, export, dan delete. Klik kanan collection memilihnya di pengelolaan collection. Export memakai format native SAPostman JSON yang bisa diimpor kembali; credential dihapus.
- Import menerima OpenAPI 3 / Swagger 2 JSON atau YAML, Postman v2 collection, dan native SAPostman JSON. Preview memperlihatkan API dan peringatan sebelum import. Import disimpan secara atomik dan tidak mengirim request. Maksimal 5 MB / 500 API. Folder Postman diratakan menjadi nama berjenjang; external OpenAPI refs, file upload dan script JavaScript perlu konfigurasi manual.
- Collection Runner menjalankan API tersimpan secara berurutan setelah Run collection. Urutan dapat diubah dan API dapat dikecualikan. Stop after current request menunggu request aktif selesai, lalu menghentikan antrean. Default berhenti pada network error, HTTP >=400, assertion gagal, atau extraction gagal. Runner tidak membuat perubahan pada endpoint tersimpan.
- Scripts menyediakan assertion builder untuk HTTP status, response header, JSON equality, dan field existence. Expected value memakai JSON (contoh `200`, `true`, atau `"text"`). Response variables memakai JSON path dot/bracket-index, misalnya `data.tokens[0]`; nilai diteruskan ke request berikutnya dan hanya hidup selama run. Secret aktif secara default.
- Preview final request menggunakan serializer yang sama dengan Send, termasuk auth, params, pre-request rules, body mode dan variable resolution. Preview tidak melakukan HTTP call atau menambah send history. Nilai final termasuk credential terlihat dalam preview; perubahan draft/scope membuat preview lama tidak berlaku.
- Response menyediakan JSON tree dengan collapse/expand, pencarian, Copy path, raw, headers, checks, dan Compare. Baseline dapat berupa response sebelumnya di tab atau hasil send history. Compare menampilkan perubahan status, durasi, ukuran serta field JSON added/removed/changed; teks biasa dibandingkan sebagai satu nilai.
- Layout editor/response dapat atas-bawah atau berdampingan. Slider Editor width mengatur rasio kolom; sudut bawah panel bisa ditarik untuk mengatur tinggi. Warna, typography, tombol, input dan header memakai design system aplikasi.

### UI workspace

Aksi API melalui tombol titik tiga atau klik kanan membuka dialog ringkas Rename, Move, Duplicate, Export, dan Move to Trash. Form rename/move baru ditampilkan setelah aksi dipilih. Pengelolaan collection juga memakai dialog dengan pilihan collection, tombol tambah, dan aksi rename/export/delete; form panjang tidak memenuhi sidebar.

Toolbar menampilkan Import APIs, Collection runner, dan collapse/expand. Manage collections dibuka lewat ikon pengaturan atau menu collection. Menu API bisa dibuka lewat tombol titik tiga maupun klik kanan. Split otomatis kembali bertumpuk saat lebar editor kurang dari 820px agar URL dan response tidak terlalu sempit. Version history tertutup secara default.

Layout dipilih melalui ikon Settings di samping New request. Side by side menyediakan pembatas drag: kiri memperkecil Request, kanan memperbesar Request. Double-click atau Reset 50:50 mengembalikan ukuran seimbang; tombol panah mengubah rasio saat pembatas mendapat fokus. Preferensi layout/rasio disimpan lokal di perangkat.

### Preferensi workspace

Settings di samping New request mengatur density Comfortable/Compact, font editor 10–22 px, word wrap atau scroll horizontal, default response JSON Tree/Raw/Headers, panel Ask your SA terbuka/collapsed, jumlah tingkat JSON yang terbuka otomatis (0–5), dan timeout awal request baru (1–120 detik). Default: Comfortable, 12 px, wrap aktif, JSON Tree, SA collapsed, satu tingkat JSON, timeout 30 detik, layout atas-bawah dan rasio 50:50. Reset display mengembalikan semua preferensi tersebut tanpa menghapus API atau collection. Timeout API tersimpan tidak diubah oleh preferensi ini.

Preferensi disimpan di localStorage per perangkat dan tidak ikut backup. Data SAPostman di PostgreSQL—environment, collection, endpoint termasuk docs/auth/variables, version history, dan send history—ikut snapshot backup lokal dan cloud lewat BACKUP_TABLES. Draft/tab/chat yang belum disimpan tidak masuk snapshot.

Menghapus collection memindahkan API tersimpan ke Unfiled dalam satu transaksi. Variable collection yang aktif disalin ke variable API (override API tetap menang), dan tiap API mendapat versi baru. API, docs, send history, serta versi sebelumnya tetap tersedia. Dialog hapus menjelaskan perpindahan sebelum dijalankan.

API dapat dipilih melalui checkbox per baris, per collection, atau Select all (mengikuti hasil pencarian, termasuk collection yang tertutup). Trash memindahkan API terpilih secara atomik ke menu Trash di sidebar. API dapat di-restore selama 30 hari dengan docs, variables dan version history; setelah retensi berakhir API dan versinya dibersihkan permanen. Riwayat Send tetap independen. Endpoint di Trash tidak dapat diupdate atau dibuka langsung. Data Trash SAPostman tetap ikut backup karena disimpan pada tabel sa_requests.

## Secret vault, cancellation and response performance

Secret vault is opened using Vault beside New request. Create a master password (at least 12 characters), unlock, and save a named secret. Reference it as `{{vault.api_token}}` directly in Authorization, headers, params or body, or use a variable whose value is that reference. Updating an existing name replaces its value. The UI only receives names and timestamps, not stored values. The `vault.` variable namespace is reserved for the server; edit these entries through Vault.

The vault uses AES-256-GCM with a random salt and an scrypt-derived key. The password/key are not persisted. Its encrypted file is stored in the parent of the automatic backup directory (`data/sapostman-vault.enc` in source mode, or the Electron user-data directory on desktop), outside uploaded files and database backup tables. Changing the upload location does not move the vault to a drive root. Existing vaults beside the upload directory remain readable if no vault exists at the new location; the next save writes to the new location. Collection exports keep references but exclude vault values. A fresh server starts locked and inactivity automatically locks it after 15 minutes. There is no password recovery. If the password is forgotten, choose **Forgot password? Create new vault**, enter and confirm a new password, then type `RESET`. This permanently replaces the old secrets with an empty vault without requiring the old password. Saved API references remain and must be populated again. On another computer, recreate/unlock that device's vault and fill referenced secrets before sending. Existing literal credentials are not automatically migrated. Preview masks vault values; send history masks known echoed vault values. Live responses may display values returned by the target.

During Send the button becomes Cancel. Cancellation aborts the server HTTP fetch and response reading; timeout remains an independent limit. A cancelled execution is recorded in send history. Collection Runner offers Cancel now (abort current request and stop the queue) as well as Stop after current request. Cancellation cannot reverse an operation already accepted by the target server.

Response JSON is parsed once per body change, comparisons are computed only while Compare is selected, and JSON search traverses the data once per search change without repeatedly serializing object subtrees. Assertions also share a parsed JSON body. No response fields are removed by these optimizations.

Home/Inbox polling pauses while the page is hidden, runs every two seconds while working notifications exist, and every minute while idle. Focus/visibility and AI activity changes trigger refresh; manual Refresh remains available.
