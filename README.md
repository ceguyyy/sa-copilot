# SA Copilot

A presales Solution Architect workbench for Cekat AI. You upload the client's requirements, chat with Claude acting as your SA, and generate versioned deliverables:

**Requirement → Assessment → Knowledge → TOR → Timeline (your mandays) → SOW (Cekat / Meta CIF) → Onboarding Form**, plus Mermaid UML/flow diagrams.

- **Projects**: one workspace per client deal.
- **Sources**: PDF, DOCX, XLSX, CSV/TXT/MD, images, or pasted notes. Text is extracted in the browser. Images and scanned PDFs go to Claude natively.
- **Knowledge**: project-level, plus a global knowledge base shared by every project.
- **Chat**: streams from Claude and grounds its answers in all of the project's sources and documents.
- **Documents**: structured JSON per type, rendered by editors (tables, sections, Gantt, Mermaid). Claude writes them through JSON-schema structured outputs.
- **Version history**: versions are immutable. Every save, AI revision or restore creates a new version, and you can diff any version against the current one.
- **Skills library**: full CRUD over the instructions Claude follows per output type. The first sign-in seeds defaults built from your templates. Skills import and export as `SKILL.md`.
- **Export**: `.md` for all documents, `.docx` for SOW/onboarding/assessment/TOR/timeline, `.xlsx` for assessment/TOR/timeline (the timeline export includes Gantt week bars), and `.svg` for diagrams.

## Stack

React 19 + Vite + TypeScript + Tailwind v4 · TanStack Query · Supabase (Postgres + RLS, Storage, Auth magic link, Edge Functions) · Claude (`claude-opus-5`) via `@anthropic-ai/sdk` · mermaid · exceljs · docx · pdf.js · mammoth.

```
src/
  pages/              Projects, Project (sources + pipeline + chat), Document, Skills, Knowledge, Login
  components/         ChatPanel, SourcesPanel, AiPanel, VersionHistory, Markdown, MermaidView, ui
  components/editors/ Assessment, TOR, Timeline (Gantt), SOW, Onboarding, Diagram
  lib/                api (repository), ai (NDJSON stream client), timeline, docMarkdown, diff, extract, export/*
supabase/
  migrations/         schema + RLS + storage bucket
  functions/_shared/  schemas.ts (doc types + JSON schemas, shared with the frontend), context builder
  functions/ai/       chat + generate edge function
```

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Link and migrate:**
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
3. **Set the Edge Function secrets.** Copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill in `ANTHROPIC_API_KEY`, then run:
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy ai
   ```
4. **Configure the frontend.** Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).
5. **Configure auth.** In Supabase → Authentication → URL Configuration, add `http://localhost:5173` (and your prod URL) to the redirect URLs.
6. **Run it:** `npm install && npm run dev`

### Local Supabase (optional, needs Docker)

```bash
npx supabase start                                            # prints local URL + anon key -> .env.local
npx supabase functions serve ai --env-file supabase/functions/.env
```
Magic-link emails show up in Inbucket at http://localhost:54324.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest unit tests (timeline scheduling, markdown rendering, diff, SKILL.md parsing) |
| `npm run build` | Type-check + production build |
| `npm run check:functions` | `deno check` the edge function |

## Notes & limits

- **Function timeout:** a long SOW generation can take a couple of minutes. Supabase's wall-clock limit is 150 s on the free plan and 400 s on paid plans. If you hit it, set `GENERATE_EFFORT=medium`.
- **Refusal fallback:** requests use Claude's server-side refusal fallback (`fallbacks: "default"`), which reruns on a fallback model if the primary one declines. Remove `FALLBACK` in `supabase/functions/ai/index.ts` to turn it off.
- **Mandays:** these are the Timeline's `SLA/Days` column, which you set. SOWs read them, and a SOW shows a "timeline outdated" banner when the timeline changes after its last version.
- **DOCX export:** the file follows each template's section structure but not its exact Word styling or logo. Paste it into the branded template if you need pixel-perfect output.
- **Single-user:** every row is scoped to `auth.uid()` via RLS. To share with a team you would need a workspace table and new policies.
