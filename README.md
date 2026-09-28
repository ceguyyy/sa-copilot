# SA Copilot

A presales Solution Architect workbench for Cekat AI. Upload the client's requirements, chat with Claude acting as your SA, and generate versioned deliverables:

**Requirement → Assessment → Knowledge → TOR → Timeline (your mandays) → SOW (Cekat / Meta CIF) → Onboarding Form → User Journey**, plus UML/flow diagrams, a pitch deck and a POC.

It runs on your own laptop: as a **desktop app** (Windows `.exe` / macOS `.dmg`, everything bundled), or from this repo in the browser.

## Install the desktop app

Download the installer for your OS (build it yourself with [docs/BUILD.md](docs/BUILD.md)):

| OS | File |
|---|---|
| Windows 10/11 x64 | `SA Copilot Setup <version>.exe` |
| macOS Apple Silicon | `SA Copilot-<version>-arm64.dmg` |
| macOS Intel | `SA Copilot-<version>-x64.dmg` |

The installers are unsigned for now:

- **Windows:** SmartScreen shows "Windows protected your PC". Click **More info → Run anyway**.
- **macOS:** drag the app to Applications, then right-click it → **Open** → **Open** on first launch. If macOS says the app "is damaged", run `xattr -dr com.apple.quarantine "/Applications/SA Copilot.app"`.

Nothing else needs installing. The app bundles and starts on its own:

- PostgreSQL (embedded, on a free local port)
- 9router (the AI router; its dashboard opens from Settings → Connections)
- Python with markitdown and python-pptx (document conversion and the pitch deck)
- the Outline MCP server

**First start:** the Setup screen asks for a 9router API key. Click **Open 9router dashboard**, connect a provider, create a key, and paste it. Every other setting that used to live in `.env` is under **Settings → Connections** and can be changed at any time: AI endpoint and model, Outline, demo app, Notion, and folders. Keys are encrypted with the OS keychain (Windows DPAPI / macOS Keychain) and are never shown again after saving.

**Where data lives:** `%APPDATA%\SA Copilot` on Windows, `~/Library/Application Support/SA Copilot` on macOS. It holds the database, uploads, automatic backups and logs, and is kept across updates and uninstalls. Settings → Connections lists every folder with an **Open** button. Exported deliverables go to `Documents/SA Copilot` by default.

**Moving to another laptop:** Settings → Backup → **Download backup** creates one `.sacopilot` file with every project, document, POC, skill, format and uploaded file (keys are not included). On the new laptop, open Settings → Backup → **Restore**. The current data is backed up automatically before a restore.

## Features

- **Projects:** one workspace per client deal, with a deliverables progress timeline.
- **Sources:** PDF, DOCX, PPTX, XLSX, CSV/TXT/MD, images, or pasted notes. markitdown converts files to compact Markdown, which saves AI tokens.
- **Knowledge:** project-level, plus a global knowledge base shared by every project. It includes the **Cekat n8n nodes** catalog (Cekat, Cekat Trigger, Cekat CRM), used when designing integrations.
- **Chat:** "Ask your SA" streams from Claude, grounded in the project's sources and documents. It can also consult Cekat Docs and the Outline wiki.
- **Deliverables:** structured documents with dedicated editors (tables, sections, Gantt, User Journey). **Draft with AI** accepts an additional prompt every time. Built-in and custom formats can be edited in Settings, with AI help.
- **POC:**
  - **POC Agent:** the AI agent setup and tools. API integrations go through Cekat n8n webhooks (`https://workflows.cekat.ai/webhook/…`); n8n then authenticates and calls the client's system. Each tool has an AI Input Schema.
  - **POC CRM:** CRM boards as an Excel-like table plus a kanban, generated with AI. Boards can be viewed as SVG, full screen, or opened in draw.io.
  - **POC Marketing:** coming soon.
- **Version history:** versions are immutable. Every save, AI revision or restore creates a new version, and any version can be diffed against the current one.
- **Skills library:** the instructions Claude follows per output type. They import and export as `SKILL.md`.
- **Export:**
  - per document: `.md`, `.docx`, `.xlsx` (timeline with Gantt bars), `.svg` for diagrams, and `.pptx` for the pitch deck;
  - per project: the whole project as one Markdown file, or **Send to Notion** (one page per project).

## Run from the repo (development)

Needs Node 24 and a PostgreSQL server (pgAdmin is fine; the `sa_copilot` database is created on first start).

1. Copy `.env.example` to `.env` and set at least:
   - `DATABASE_URL`
   - `ANTHROPIC_API_KEY`: a Claude key, **or** a 9router key together with `ANTHROPIC_BASE_URL=http://localhost:20128` (run `npx 9router` first).

   The other variables (Outline, demo app, Notion, deck template, folders) are optional and documented in `.env.example`.
2. Optional: `pip install "markitdown[all]" python-pptx` for file conversion and the pitch deck.
3. Start it with `npm start` (or double-click `SACopilot.bat` on Windows), then open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm start` | Build the UI and run the server on http://localhost:3000 |
| `npm run serve` | Run the server with the last build |
| `npm run dev` + `npm run dev:server` | Vite on :5173 (proxies `/api`) + server with `--watch` |
| `npm run desktop` | Build and run the Electron desktop app from the repo (`SA_COPILOT_DATA_DIR` = throwaway data folder) |
| `npm run dist:win` / `npm run dist:mac` | Build the installers into `release/`; see [docs/BUILD.md](docs/BUILD.md) |
| `npm test` | Vitest unit and integration tests |
| `npm run build` | Type-check everything + production UI build |

## Stack

React 19 + Vite + TypeScript + Tailwind v4 · TanStack Query · Hono server (runs `.ts` directly on Node 24) · PostgreSQL · Claude via `@anthropic-ai/sdk` (directly or through 9router) · MCP (Cekat Docs, Outline) · Electron + electron-builder + embedded-postgres for the desktop app.

```
src/          React UI: pages, editors, POC (agent + CRM), settings
server/       Hono API: routes, ai/ (chat, drafting, MCP), backup/, notion/, deck/
shared/       doc types, JSON schemas and exporters shared by server and UI
electron/     desktop shell: service startup (Postgres → 9router → server), config, IPC
scripts/      bundling, portable Python download, installer helpers
db/schema.sql schema, applied automatically on every start (idempotent)
```

## Notes & limits

- **Single user, local only:** there is no login. The server only listens on `127.0.0.1`.
- **Long generations:** a SOW can take a couple of minutes. Lower the drafting effort if that is too slow.
- **Proxies and models:** drafting uses structured outputs and adaptive thinking. Models marked *(chat only)* can chat but cannot write documents.
- **Mandays:** these come from the Timeline's `SLA/Days` column. A SOW shows a "timeline outdated" banner when the timeline changes after its last version.
- **DOCX export:** the file follows each template's section structure, but not its exact Word styling or logo.
