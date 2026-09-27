# SA Copilot

A presales Solution Architect workbench for Cekat AI. You upload the client's requirements, chat with Claude acting as your SA, and generate versioned deliverables:

**Requirement → Assessment → Knowledge → TOR → Timeline (your mandays) → SOW (Cekat / Meta CIF) → Onboarding Form**, plus Mermaid UML/flow diagrams.

- **Projects**: one workspace per client deal.
- **Sources**: PDF, DOCX, XLSX, CSV/TXT/MD, images, or pasted notes. Text is extracted in the browser. Images and scanned PDFs go to Claude natively.
- **Knowledge**: project-level, plus a global knowledge base shared by every project.
- **Chat**: streams from Claude and grounds its answers in all of the project's sources and documents.
- **Documents**: structured JSON per type, rendered by editors (tables, sections, Gantt, Mermaid). Claude writes them through JSON-schema structured outputs.
- **Version history**: versions are immutable. Every save, AI revision or restore creates a new version, and you can diff any version against the current one.
- **Skills library**: full CRUD over the instructions Claude follows per output type. The first run seeds defaults built from your templates. Skills import and export as `SKILL.md`.
- **Export**: `.md` for all documents, `.docx` for SOW/onboarding/assessment/TOR/timeline, `.xlsx` for assessment/TOR/timeline (the timeline export includes Gantt week bars), and `.svg` for diagrams.

## Stack

React 19 + Vite + TypeScript + Tailwind v4 · TanStack Query · local Node server (Hono, runs `.ts` directly on Node 24) · PostgreSQL (manage it with pgAdmin) · Claude via `@anthropic-ai/sdk` (directly or through 9router) · mermaid · exceljs · docx · pdf.js · mammoth.

```
src/
  pages/              Projects, Project (sources + pipeline + chat), Document, Knowledge, Settings (formats, skills, AI tools, model, theme)
  components/         ChatPanel, SourcesPanel, AiPanel, VersionHistory, Markdown, MermaidView, ui
  components/editors/ Assessment, TOR, Timeline (Gantt), SOW, Onboarding, Diagram
  lib/                api (REST client), ai (NDJSON stream client), timeline, docMarkdown, diff, extract, export/*
server/
  index.ts            serves /api + the built UI on 127.0.0.1
  routes.ts           REST endpoints (projects, sources, skills, documents, versions, messages)
  ai/                 chat + generate (streams NDJSON), project context builder
  db.ts, storage.ts   PostgreSQL pool + first-run setup, uploaded files on local disk
shared/schemas.ts     doc types + JSON schemas, shared by server and UI
db/schema.sql         schema, applied automatically on every server start (idempotent)
```

## Setup (Windows)

1. **PostgreSQL** — install it (pgAdmin comes with it) and make sure the service is running. You don't need to create the database; the server creates `sa_copilot` on first start.
2. **Config** — copy `.env.example` to `.env` and set:
   - `DATABASE_URL=postgres://postgres:<your password>@localhost:5432/sa_copilot`
   - `ANTHROPIC_API_KEY` — a Claude API key, **or** a 9router key together with `ANTHROPIC_BASE_URL=http://localhost:20128` (run `9router` first).
3. **markitdown** (recommended) — `pip install "markitdown[all]"`. Uploads are converted to compact Markdown (tables and headings kept), which saves AI tokens and reads PDF/DOCX/PPTX/XLSX/HTML/EPUB/MSG. Without it, the browser's plain-text extraction is used. Set `MARKITDOWN_PYTHON` if markitdown lives in a different Python.
4. **Run** — double-click `SACopilot.bat` (or a **SACopilot** shortcut: `.bat` files can't carry an icon, so create a shortcut to it with `assets/SACopilot.ico`). It installs, builds, starts the server and opens http://localhost:3000.

**Settings** (sidebar → Settings) is the single place to configure the copilot:

- **Formats** — custom deliverable formats beyond the built-in ones, designed with an AI assistant.
- **Skills** — how the AI writes each output; an AI assistant proposes skill text.
- **AI tools** — MCP servers the AI may consult (Cekat Docs is preset). The *AI helper* tests a server's connection before suggesting it. Only read-only tools are used.
- **AI model** — every provider and model connected in 9router (from `/v1/models`), a hand-typed model id for ones it doesn't list, and the thinking effort. `ANTHROPIC_MODEL` is only the fallback. Models marked *(chat only)* can't call tools, so they can't write documents.
- **Theme** — light / dark / follow Windows, preset palettes, or a palette the AI designs (both light and dark, contrast-checked before it can be saved).

There is no login: the server only listens on `127.0.0.1`, so it is reachable from this laptop only. Uploaded files are stored in `data/uploads/`. Back up both that folder and the database (pgAdmin → Backup) together.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Build the UI and run the server on http://localhost:3000 |
| `npm run serve` | Run the server with the last build |
| `npm run dev` + `npm run dev:server` | Development: Vite on :5173 (proxies `/api`) + server with `--watch` |
| `npm test` | Vitest unit tests (UI helpers + server validation, errors, storage) |
| `npm run build` | Type-check (UI + server) + production build |

## Notes & limits

- **Long generations:** a SOW can take a couple of minutes. There is no function timeout locally; set `GENERATE_EFFORT=medium` if it is too slow.
- **Refusal fallback:** when calling the Claude API directly, requests use Claude's server-side refusal fallback (`fallbacks: "default"`). It is switched off automatically when `ANTHROPIC_BASE_URL` points at a proxy such as 9router.
- **Proxies:** generation uses structured outputs (`output_config.format`) and adaptive thinking. If your proxy or model doesn't support them, chat may work while "Draft with AI" fails with an API error.
- **Mandays:** these are the Timeline's `SLA/Days` column, which you set. SOWs read them, and a SOW shows a "timeline outdated" banner when the timeline changes after its last version.
- **DOCX export:** the file follows each template's section structure but not its exact Word styling or logo. Paste it into the branded template if you need pixel-perfect output.
- **Single-user, local only:** no auth. Don't change the server's host to `0.0.0.0` without adding a login first.
