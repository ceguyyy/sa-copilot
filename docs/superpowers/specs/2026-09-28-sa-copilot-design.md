# SA Copilot — Design

Date: 2026-09-28 · Status: implemented (v1)

## Goal
A single-user dashboard for a Cekat presales Solution Architect. The SA uploads client requirements and chats with Claude acting as their SA, and the app generates versioned deliverables in the SA's own formats: Assessment Requirement, TOR, Timeline, SOW (Cekat internal and Meta CIF), Onboarding Form, and Mermaid UML/flow diagrams. A CRUD skills library controls how Claude writes each output. All data lives in Supabase.

## Decisions
| Topic | Decision | Why |
|---|---|---|
| AI backend | Supabase Edge Function `ai` (Deno) calling Claude | Keeps the API key server-side, needs no extra infra, and RLS applies because the function uses the user's JWT |
| Model | `claude-opus-5`, adaptive thinking, env-overridable; server-side refusal fallback | Quality matters for SOWs |
| Document model | Structured JSON per type (hybrid: tables as rows, SOW as meta + markdown sections) | Editable per field, exportable to DOCX/XLSX, and mandays can be summed |
| Generation | Structured outputs (`output_config.format` JSON schema), streamed; schema shared by frontend and function | Output always matches the editor |
| File parsing | In the browser (pdf.js, mammoth, exceljs); images and scanned PDFs sent to Claude natively | Deno PDF parsing is fragile, and this keeps the function light |
| Mandays | Timeline `SLA/Days` column, entered by the SA; SOWs read it and flag when the timeline is outdated | Matches the SA's timeline template |
| Versioning | `document_versions` is insert-only (RLS has no update/delete); restore appends a copy | Full audit trail |
| Skills | `skills` table (name, output_type, instructions, is_default); seeded from templates; SKILL.md import/export | Instructions change without redeploying; JSON shape stays owned by code |
| Auth | Supabase magic link; single user; RLS `owner_id = auth.uid()` | User requirement |

## Data model
`projects`, `sources` (project_id null = global knowledge), `skills`, `documents`, `document_versions` (trigger assigns `version_no`), `messages`. Private storage bucket `sources` with a path prefix per `auth.uid()`.

## Flows
1. **Upload:** the browser extracts text, the file goes to Storage, and a `sources` row is created.
2. **Chat:** the function loads the project, sources, latest documents and the last 40 messages, puts the cached context block in the system prompt, streams NDJSON deltas, and persists both turns.
3. **Generate or revise:** the function loads the context and the chosen skill (default when none is picked) and builds a task (revise the existing version when one exists; SOWs must use the Timeline). Claude returns structured output, the function validates it, and it inserts a new version.
4. **Edit:** the client-side draft is saved as a new `manual` version. Old versions are read-only, can be diffed against the current one, and can be restored as a new version.

## Error handling
- Typed Anthropic errors are mapped to friendly messages.
- `refusal` and `max_tokens` stop reasons are surfaced.
- Invalid JSON or schema mismatches return a 502 with the reason.
- UI mutations show inline errors.
- The client detects when the stream closes early (function timeout).

## Testing
Vitest unit tests cover timeline scheduling, markdown rendering, line diff, and SKILL.md parsing. `tsc -b` and `deno check` cover types. There is no E2E yet, because it needs a Supabase project and an Anthropic key.

## Out of scope (v1)
- Multi-user workspaces.
- Pixel-identical DOCX template filling (logo and Word styles).
- Embedding diagram images into DOCX.
