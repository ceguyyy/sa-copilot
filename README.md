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
  - **POC CRM:** CRM boards as an Excel-like table plus a kanban, generated with AI. Boards can be viewed as SVG, full screen, or opened in draw.io. Select/Dropdown values are sent to n8n as **zero-based** option numbers (first option = 0).
  - **n8n Workflow:** ONE gateway workflow per POC: one webhook, input validation, then **Switch Action** routes each API integration by its `"action"`. **1 use case = 1 cURL**, each with its own Copy button. Create it with **Generate with AI**, **Build from POC** (no AI, built from the API integrations), or **Import workflow** (an n8n export; its use cases are read from the Switch). **Export n8n** downloads the workflows exactly as they are in the tab.
  - Label names and label descriptions are limited to 3000 characters.
  - **POC Marketing:** coming soon.
- **Version history:** versions are immutable. Every save, AI revision or restore creates a new version, and any version can be diffed against the current one.
- **Skills library:** the instructions Claude follows per output type. They import and export as `SKILL.md`.
- **Export:**
  - per document: `.md`, `.docx`, `.xlsx` (timeline with Gantt bars), `.svg` for diagrams, and `.pptx` for the pitch deck;
  - per project: the whole project as one Markdown file, or **Send to Notion** (one page per project).

## Run from the repo (Windows and macOS)

Running from the repo needs **three things running at the same time**:

| What | Where | Check it with |
|---|---|---|
| **PostgreSQL** | port 5432 | pgAdmin (Windows) / `brew services list` (macOS) |
| **9router** (the AI router: every AI call goes through it) | http://localhost:20128 | open http://localhost:20128 in the browser; it shows the dashboard |
| **SA Copilot server** | http://localhost:3000 | the terminal says `SA Copilot running at http://localhost:3000` |

If 9router is not running, every **Generate / Draft with AI / Chat** fails with *Cannot reach the AI endpoint … is 9router running?*. If the SA Copilot server is not running, the page shows **Failed to fetch**.

### One-time setup

**Windows**

1. Install [Node.js 24](https://nodejs.org), [PostgreSQL](https://www.postgresql.org/download/windows/) (with pgAdmin; remember the `postgres` password) and, optionally, [Python 3](https://www.python.org/downloads/) (tick *Add python.exe to PATH*).
2. In this folder:
   ```powershell
   npm install
   pip install "markitdown[all]" python-pptx   # optional: file conversion + pitch deck
   copy .env.example .env
   ```
3. Start 9router and create a key (next section), then fill in `.env`:
   ```
   DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/sa_copilot
   9ROUTER_API_KEY=<key from the 9router dashboard>
   ANTHROPIC_BASE_URL=http://localhost:20128
   ```

**macOS** (Apple Silicon or Intel, with [Homebrew](https://brew.sh))

1. Install the tools and start PostgreSQL in the background (it then also starts on every login):
   ```bash
   brew install node@24 postgresql@16 python
   brew link --overwrite node@24
   brew services start postgresql@16
   ```
2. In this folder:
   ```bash
   npm install
   pip3 install "markitdown[all]" python-pptx   # optional: file conversion + pitch deck
   cp .env.example .env
   ```
3. Start 9router and create a key (next section), then fill in `.env`. Homebrew's PostgreSQL uses your Mac username and no password (`whoami` prints it):
   ```
   DATABASE_URL=postgres://YOUR_MAC_USERNAME@localhost:5432/sa_copilot
   9ROUTER_API_KEY=<key from the 9router dashboard>
   ANTHROPIC_BASE_URL=http://localhost:20128
   ```
   On macOS the app calls `python3` by default; set `MARKITDOWN_PYTHON` only if markitdown is installed in another Python (e.g. a venv).

The `sa_copilot` database and its tables are created automatically on the first start.

### 9router (the AI router)

1. In a separate terminal: `npx 9router`. Keep this terminal open: closing it stops the AI.
2. Open http://localhost:20128 → connect a provider (e.g. your Claude account) → create an **API key**.
3. Paste the key into `.env` as `9ROUTER_API_KEY=…` and restart the SA Copilot server. `.env` is read only when the server starts.

### Every day

Open **two terminals** in this folder (Windows: PowerShell; macOS: Terminal):

```bash
# terminal 1 — the AI router (leave it open)
npx 9router

# terminal 2 — SA Copilot
npm start          # builds the UI, then runs the server
```

Then open **http://localhost:3000**. PostgreSQL already runs as a service on both Windows and macOS. On Windows you can also double-click `SACopilot.bat` instead of `npm start`.

After `git pull`, run `npm install` once, then `npm start` (it rebuilds the UI). `npm run serve` skips the build and is faster when nothing changed.

### Troubleshooting

| You see | Means | Fix |
|---|---|---|
| **Failed to fetch** in the page | The SA Copilot server is not running | `npm start` in a terminal and keep it open |
| *Cannot reach … is 9router running?* | 9router is not running | `npx 9router` in another terminal |
| *9ROUTER_API_KEY is not set in .env* / *API key is invalid* | Key missing or wrong | Create a key in the 9router dashboard, put it in `.env`, restart the server |
| *Missing DATABASE_URL* / connection refused on 5432 | PostgreSQL is not running or the URL is wrong | Windows: start the *postgresql* service; macOS: `brew services start postgresql@16`. Check user/password in `DATABASE_URL` |
| Uploads are not converted / the pitch deck fails | Python packages missing | `pip install "markitdown[all]" python-pptx` (macOS: `pip3`), or set `MARKITDOWN_PYTHON` |
| Port 3000 already in use | Another app uses it | Set `PORT=3001` in `.env` and open http://localhost:3001 |

### Commands

| Command | What it does |
|---|---|
| `npm start` | Build the UI and run the server on http://localhost:3000 |
| `npm run serve` | Run the server with the last build |
| `npm run dev` + `npm run dev:server` | Vite on :5173 (proxies `/api`) + server with `--watch`, for development |
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
