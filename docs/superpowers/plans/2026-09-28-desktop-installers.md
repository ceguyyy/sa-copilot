# Desktop Installers (Windows .exe & macOS .dmg) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package SA Copilot as an Electron desktop app with a Windows NSIS `.exe` and macOS `.dmg` that bundle and run Postgres, 9router, Python (markitdown + python-pptx) and the existing server, with a Setup/Connections screen (all former `.env` values, editable) and Backup & Restore.

**Architecture:** An Electron main process (ESM) starts embedded Postgres, the bundled 9router Next.js server and the esbuild-bundled Hono server as child processes on free loopback ports, then loads the existing UI from that server. Configuration (every former `.env` value) lives in `config.json` in the user data folder with secrets encrypted by Electron `safeStorage`; the main process turns it into the server's environment and restarts the server on change. Backup & Restore is a server feature (zip of per-table JSON + upload files) that also works in today's browser/dev mode.

**Tech Stack:** Electron 44.4.5, electron-builder 26.15.3, esbuild 0.28.2, embedded-postgres 18.4.0-beta.17 (PostgreSQL 18), 9router 0.5.91, outline-mcp-server 5.8.5, fflate 0.8.3, python-build-standalone CPython 3.12 with markitdown 0.1.7 + python-pptx 1.0.2, existing Hono/React/Vite/vitest stack.

**Spec:** `docs/superpowers/specs/2026-09-28-desktop-installers-design.md`

## Global Constraints

- Targets: Windows x64 (NSIS `.exe`), macOS arm64 + x64 (`.dmg`). No Linux.
- No code signing: Windows unsigned; macOS ad-hoc signed only (`identity: "-"`).
- `.exe` builds on Windows (`npm run dist:win`); `.dmg` builds on a Mac (`npm run dist:mac`).
- No key or secret is bundled into an installer. Every former `.env` value is set in the app (Setup screen + **Settings → Connections**) and can be changed later; secrets are encrypted with Electron `safeStorage`.
- Data folder (survives update/reinstall): Windows `%APPDATA%\SA Copilot\`, macOS `~/Library/Application Support/SA Copilot/`. Default export folder `Documents/SA Copilot`.
- All child services bind to `127.0.0.1` on free ports; never fixed 5432/20128/3000 (except reusing an already-running 9router on 20128).
- 9router data stays in its own folder (`%APPDATA%\9router` / `~/.9router`), shared with any 9router already installed on the device.
- Backup file: `.sacopilot` zip, max 2 GB, each upload file inside max 50 MB; keys/config never included; restore confirmation text is exactly `RESTORE`.
- Dev workflow unchanged: `npm run dev`, `npm run dev:server`, `npm run serve`, `SACopilot.bat` keep using `.env`.
- Python packages: `markitdown[pdf,docx,pptx,xlsx,xls,outlook]==0.1.7`, `python-pptx==1.0.2` (not `[all]`).
- Out of scope: code signing, auto-update, Linux, multi-user, cloud migration.
- Commits: this repo's owner commits only on request — each task ends with a commit step; run it only if the user has approved committing during execution, otherwise leave changes staged-ready and continue.

## Deferred POC and n8n Requirements

> Planning only. Do not implement these changes until the user explicitly gives the go-ahead. The POC Flow rules are intentionally TBD and must come from the user before its behavior is designed.

- **One n8n workflow for curl cases:** represent all supported curl cases in one n8n workflow. A workflow can contain multiple curl commands, with each case represented and routed distinctly.
- **n8n workflow skills format:** revise the n8n workflow skill format to follow the exported workflow structure in the supplied `Siloam Procurement Gateway - POC 01.json`, including its nodes, parameters, connections, and workflow metadata.
- **Zero-based select values:** for select fields in n8n skills, the first option/value is `0`; do not start select values at `1`.
- **POC Flow tab:** add a tab named `POC Flow` for non-AI workflows. It must support multiple workflows and must not invoke AI. Detailed workflow rules and behavior remain blocked on the user's forthcoming specification.
- **POC agent text limits:** enforce a maximum of 3000 characters for Labels/labels and for description.
- **Implementation gate:** keep this work documented in Markdown for now. Before implementation starts, push the approved plan changes to Git; do not include unrelated worktree changes in that push.

### Deferred acceptance criteria

- All curl cases are represented in one n8n workflow, and multiple curl commands can be included in it.
- n8n workflow skills can represent/import the supplied exported workflow format, and select option values are zero-based.
- The `POC Flow` tab supports multiple workflows without AI and follows the "POC Flow rules" section below (node types, limits, Else paths, end-node validation).
- POC agent Labels/labels and description reject values longer than 3000 characters.

### Status (2026-10-01)

Go-ahead given; implemented except the POC Flow tab. Decisions taken with the user:

- **n8n:** ONE gateway workflow per POC — one webhook, `Validate & Extract Payload` → `Is Payload Valid?` → `Switch Action` on `$json.action` → one branch per use case → shared `Respond to Webhook`. **1 use case = 1 cURL**: each workflow stores `cases: { action, title, curl }[]` (replaces `tool` + single `curl`; legacy POCs are upgraded on read by `normalizeN8n` / the `pocN8n` schema). AI writes it in one call (`draftN8nWorkflow`); every POC Agent "Copy cURL" adds `"action": "<integration name>"`.
- **Skill format:** `N8N_WORKFLOW_RULES` follows the Siloam export (node names, types/typeVersions, parameter shapes incl. `cekatCrm` `columns.column[{ columnName, valueType: "select", selectValue }]`, connections, `settings`). `completeWorkflowExport` adds `pinData`, `settings`, `active`, `tags` and webhook `webhookId`s. Importing an export reads its use cases from its Switch (v1 `value2` or v3 conditions on `$json.action`).
- **Zero-based selects:** `CEKAT_CRM_SELECT_RULE`, `selectOptionValue`, `crmN8nValueGuide` and the happy-case prompt.
- **3000 limit:** label name and label description (condition) — `POC_LABEL_MAX_CHARS` in `shared/pocLimits.ts`, used by the schema, AI mapping and the editor inputs.
- **POC Flow tab:** rules received 2026-10-02 (below); implementation still waits for the go-ahead.

### POC Flow rules (from the user, 2026-10-02)

Models the Cekat **Flow** builder: a non-AI, rule-based chat flow that runs before an agent takes over.

- **Direction:** Flow → AI Agent is allowed (a flow can hand the chat to an AI agent). AI → Flow is **not** possible.
- **Entry:** an incoming channel chat enters at the **Start point**. From Start point you can add a **Condition** or an **End Flow**.
- **Condition node** types:
  - **First Message Text**: if the customer's first message matches the trigger text, take this path.
  - **First Message Time**: a time range plus days of the week (shown as "First Message Time / Day" in the builder).
  - Each set of sibling conditions automatically gets an **Else** path ("This path will be taken if other conditions are not met").
- **After a condition**, a new node can be:
  - **Action** with one of: **Add Label** (put the chat in a label), **Add Collaborator**, **Send Message** (send a chat to the customer when the node is reached), **Webhook** (no variables can be added), **Jump** (continue at another chosen node).
  - **Message with Buttons**: message text up to **10,000** chars, an optional uploaded **image**, up to **10 buttons** of up to **20** chars each. It branches into one **Button Response** condition per button, plus an **Else** path.
  - **End Flow**.
- **End Flow** types: **Human Agent** (must select one or more human agents) or **AI Agent** (hand over to an AI agent). The usual reason to end at an AI agent: it calls an API with a customer variable (e.g. track an order by order number), which the flow itself can't do.
- **Validation** (mirrors Cekat's "Flow must end with a configured Human or AI Agent"): every leaf path, including each Else, must end in an End node (error: `<Node> (<label>) - Add An End Node`). An End Human Agent with no agents selected gives `End N (Human Agent) - Select Human Agents`.

### Answers (2026-10-02)

- **First Message Text** is **case-sensitive**. Match mode was not stated; assume **exact match** until told otherwise.
- **Chaining:** Action / Webhook nodes can be chained (Action → Action → End). **Jump** can target **any node** in the same flow.
- **Output:** no Cekat import format. The tab gives (1) a **tree visual** of each flow and (2) **copy-paste fields**: every node's field values (condition text, time/day, label, message text, button labels, webhook URL, chosen agents) with a copy button each, so the SA can rebuild the flow by hand in Cekat. Validation errors are shown as in Cekat.

## Review Focus

1. **Ports already taken** (device runs PostgreSQL on 5432, 9router tray on 20128, something on 3000) → app starts anyway: free ports for Postgres/server, reuses the running 9router. Pinned in Task 5 (`freePort`) and Task 7 (`findRunningRouter`).
2. **Previous run crashed** leaving `postmaster.pid` → next start succeeds. Pinned in Task 5 (`isStalePidFile`).
3. **Restoring a backup from an older app version** (rows missing columns that are now `NOT NULL DEFAULT`, or a table the new version dropped) → restore succeeds, defaults fill in, unknown table reported as a warning. Pinned in Task 3 integration test.
4. **Corrupt or malicious `.sacopilot`** (no manifest, `../` entry names, oversized entry, wrong format) → 400 with a clear message, nothing in the database touched. Pinned in Task 2.
5. **`config.json` copied from another device / keychain reset** (secrets cannot be decrypted) → app shows Setup instead of crashing; plaintext never written to disk. Pinned in Task 6.

---

## File Map

| File | Responsibility |
|---|---|
| `server/config.ts` (modify) | Env overrides for every path the desktop app relocates |
| `server/db.ts` (modify) | Export `applySchema()` |
| `server/exports.ts` (modify) + `server/opener.ts` (new) | Cross-platform "open folder/file" |
| `server/ai/outlineCommand.ts` (new), `server/ai/mcp.ts` (modify) | Outline MCP without `npx` when bundled |
| `server/deck/build.ts` (modify) | Deck script path from config |
| `server/backup/format.ts` (new) | `.sacopilot` zip format: pack/unpack/validate |
| `server/backup/service.ts` (new) | Create backup, restore in one transaction |
| `server/backup/routes.ts` (new), `server/index.ts` (modify) | `/api/backup*` endpoints |
| `src/pages/settings/BackupSettings.tsx` (new), `src/lib/api.ts`, `src/pages/SettingsPage.tsx` (modify) | Backup UI |
| `electron/paths.ts` | All filesystem locations (dev vs packaged) |
| `electron/ports.ts` | Free port, URL probing |
| `electron/processes.ts` | Stale pid detection, process-tree kill, logger |
| `electron/settings.ts` | Setting keys + UI-safe types (no Node imports) |
| `electron/config.ts` | `config.json` store, secret encryption, IPC patch validation, server env |
| `electron/services/postgres.ts` | Embedded Postgres start/stop |
| `electron/services/router9.ts` | Reuse or start bundled 9router |
| `electron/services/server.ts` | Server child process, health check, crash policy |
| `electron/main.ts`, `electron/preload.ts`, `electron/splash.html` | Lifecycle, window, IPC bridge, splash |
| `src/lib/desktop.ts`, `src/components/ConnectionsForm.tsx`, `src/pages/SetupPage.tsx`, `src/pages/settings/ConnectionsSettings.tsx`, `src/App.tsx` (modify) | Setup gate + Settings → Connections |
| `scripts/bundle.mjs` | esbuild: server + electron main/preload (created in Task 8) |
| `scripts/fetch-python.mjs` | Portable Python per target + pip install + deck template |
| `scripts/mac-cross-deps.mjs` | Install the other macOS arch's native packages |
| `scripts/smoke-win.ps1` | Silent install → start → health → quit → leftover check → uninstall |
| `electron-builder.yml`, `tsconfig.electron.json`, `package.json`, `vite.config.ts`, `.gitignore` | Build config |
| `docs/BUILD.md` | Build steps, Mac checklist, opening unsigned apps |

---

### Task 1: Server portability

Make every path the desktop app needs to relocate overridable by env, open folders on macOS too, run Outline MCP without `npx`, and expose `applySchema()`.

**Files:**
- Modify: `server/config.ts`, `server/db.ts:61-64`, `server/deck/build.ts:16`, `server/exports.ts:166-174`, `server/ai/mcp.ts` (the `builtinServers` function)
- Create: `server/opener.ts`, `server/ai/outlineCommand.ts`
- Test: `server/config.test.ts`, `server/opener.test.ts`, `server/ai/outlineCommand.test.ts`

**Interfaces:**
- Produces: `config.backupDir`, `config.distDir`, `config.schemaFile`, `config.deckScript`, `config.outline.mcpEntry`, `config.appVersion` (all strings); env names `BACKUP_DIR`, `DIST_DIR`, `SCHEMA_FILE`, `DECK_SCRIPT`, `OUTLINE_MCP_ENTRY`, `SA_APP_VERSION` (plus existing `UPLOAD_DIR`, `DOCS_DIR`, `DECK_TEMPLATE`, `MARKITDOWN_PYTHON`); `applySchema(): Promise<void>` from `server/db.ts`; `openCommand(platform: NodeJS.Platform, target: string): { command: string; args: string[] } | null` from `server/opener.ts`; `outlineStdio(entry: string, execPath: string): { command: string; args: string[]; env: Record<string, string> }` from `server/ai/outlineCommand.ts`.

- [ ] **Step 1: Write failing tests**

`server/config.test.ts`:

```ts
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '..')
const PATH_VARS = ['UPLOAD_DIR', 'DOCS_DIR', 'DECK_TEMPLATE', 'BACKUP_DIR', 'DIST_DIR', 'SCHEMA_FILE', 'DECK_SCRIPT', 'OUTLINE_MCP_ENTRY', 'SA_APP_VERSION']

async function load(env: Record<string, string>) {
  vi.resetModules()
  vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
  for (const name of PATH_VARS) vi.stubEnv(name, env[name] ?? '')
  return (await import('./config.ts')).config
}

afterEach(() => vi.unstubAllEnvs())

describe('config paths', () => {
  it('defaults every path inside the repo', async () => {
    const config = await load({})
    expect(config.uploadDir).toBe(path.join(ROOT, 'data', 'uploads'))
    expect(config.backupDir).toBe(path.join(ROOT, 'data', 'backups'))
    expect(config.distDir).toBe(path.join(ROOT, 'dist'))
    expect(config.schemaFile).toBe(path.join(ROOT, 'db', 'schema.sql'))
    expect(config.deckScript).toBe(path.join(ROOT, 'server', 'deck', 'build_deck.py'))
    expect(config.outline.mcpEntry).toBe('')
    expect(config.appVersion).toBe('dev')
  })

  it('takes absolute overrides from the environment', async () => {
    const abs = (p: string) => path.resolve('/sa', p)
    const config = await load({
      UPLOAD_DIR: abs('up'),
      BACKUP_DIR: abs('bk'),
      DIST_DIR: abs('ui'),
      SCHEMA_FILE: abs('schema.sql'),
      DECK_SCRIPT: abs('deck.py'),
      OUTLINE_MCP_ENTRY: abs('stdio.js'),
      SA_APP_VERSION: '1.0.0',
    })
    expect(config.uploadDir).toBe(abs('up'))
    expect(config.backupDir).toBe(abs('bk'))
    expect(config.distDir).toBe(abs('ui'))
    expect(config.schemaFile).toBe(abs('schema.sql'))
    expect(config.deckScript).toBe(abs('deck.py'))
    expect(config.outline.mcpEntry).toBe(abs('stdio.js'))
    expect(config.appVersion).toBe('1.0.0')
  })
})
```

`server/opener.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openCommand } from './opener.ts'

describe('openCommand', () => {
  it('uses Explorer on Windows and open on macOS', () => {
    expect(openCommand('win32', 'C:\\SA\\x')).toEqual({ command: 'explorer.exe', args: ['C:\\SA\\x'] })
    expect(openCommand('darwin', '/Users/a/x')).toEqual({ command: 'open', args: ['/Users/a/x'] })
  })

  it('has no opener elsewhere', () => {
    expect(openCommand('linux', '/x')).toBeNull()
  })
})
```

`server/ai/outlineCommand.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { outlineStdio } from './outlineCommand.ts'

describe('outlineStdio', () => {
  it('runs the bundled entry with the app runtime as Node', () => {
    expect(outlineStdio('/app/node_modules/outline-mcp-server/build/stdio.js', '/app/SA Copilot')).toEqual({
      command: '/app/SA Copilot',
      args: ['/app/node_modules/outline-mcp-server/build/stdio.js'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    })
  })

  it('falls back to npx when nothing is bundled', () => {
    expect(outlineStdio('', '/usr/bin/node')).toEqual({
      command: 'npx',
      args: ['-y', '--package=outline-mcp-server@latest', '-c', 'outline-mcp-server-stdio'],
      env: {},
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/config.test.ts server/opener.test.ts server/ai/outlineCommand.test.ts`
Expected: FAIL — `config.backupDir` undefined, `./opener.ts` and `./outlineCommand.ts` not found.

- [ ] **Step 3: Implement**

`server/config.ts` — replace the path lines and add the new fields (keep everything else):

```ts
const ROOT = path.resolve(import.meta.dirname, '..')

/** A path from the environment (the desktop app points these into its data/resources folders), else inside the repo. */
const fromEnv = (name: string, fallback: string) => path.resolve(ROOT, process.env[name]?.trim() || fallback)
```

In `export const config = { … }`:

```ts
  uploadDir: fromEnv('UPLOAD_DIR', 'data/uploads'),
  // Where Backup & Restore writes the automatic backup taken before a restore.
  backupDir: fromEnv('BACKUP_DIR', 'data/backups'),
  deckTemplate: fromEnv('DECK_TEMPLATE', 'data/templates/deck.pptx'),
  docsDir: fromEnv('DOCS_DIR', 'data/projects'),
  outline: {
    apiUrl: process.env.OUTLINE_API_URL?.trim() || 'https://wiki.cekat.ai/api',
    apiKey: process.env.OUTLINE_API_KEY?.trim() || '',
    // Bundled outline-mcp-server stdio entry (desktop app); empty = run it through npx.
    mcpEntry: process.env.OUTLINE_MCP_ENTRY?.trim() ? path.resolve(process.env.OUTLINE_MCP_ENTRY.trim()) : '',
  },
  distDir: fromEnv('DIST_DIR', 'dist'),
  schemaFile: fromEnv('SCHEMA_FILE', 'db/schema.sql'),
  deckScript: fromEnv('DECK_SCRIPT', 'server/deck/build_deck.py'),
  appVersion: process.env.SA_APP_VERSION?.trim() || 'dev',
```

(Remove the old `uploadDir`, `deckTemplate`, `docsDir`, `distDir`, `schemaFile` lines and the old `outline` block.)

`server/opener.ts`:

```ts
// The OS command that opens a folder, or a file with its default app, on the machine running the server.

export function openCommand(platform: NodeJS.Platform, target: string): { command: string; args: string[] } | null {
  if (platform === 'win32') return { command: 'explorer.exe', args: [target] }
  if (platform === 'darwin') return { command: 'open', args: [target] }
  return null
}
```

`server/exports.ts` — replace `revealInExplorer`:

```ts
/** Opens a folder (or a file with its default app) in Explorer / Finder on this machine. */
export async function revealInExplorer(target: string, isDir: boolean): Promise<void> {
  const opener = openCommand(process.platform, target)
  if (!opener) throw new HttpError(501, 'Opening folders is only supported on Windows and macOS')
  if (isDir) await mkdir(target, { recursive: true })
  else await stat(target).catch(() => {
    throw new HttpError(404, 'File not found')
  })
  spawn(opener.command, opener.args, { detached: true, stdio: 'ignore' }).unref()
}
```

and add `import { openCommand } from './opener.ts'` to its imports.

`server/ai/outlineCommand.ts`:

```ts
// How to start the Outline MCP server: the copy bundled with the desktop app (run by the app's own
// runtime as Node), or `npx` in a plain dev checkout.

export function outlineStdio(entry: string, execPath: string): { command: string; args: string[]; env: Record<string, string> } {
  if (entry) return { command: execPath, args: [entry], env: { ELECTRON_RUN_AS_NODE: '1' } }
  return { command: 'npx', args: ['-y', '--package=outline-mcp-server@latest', '-c', 'outline-mcp-server-stdio'], env: {} }
}
```

`server/ai/mcp.ts` — inside `builtinServers()`, replace the `stdio` object:

```ts
      stdio: (() => {
        const run = outlineStdio(config.outline.mcpEntry, process.execPath)
        return {
          command: run.command,
          args: run.args,
          env: { ...getDefaultEnvironment(), ...run.env, OUTLINE_API_KEY: config.outline.apiKey, OUTLINE_API_URL: config.outline.apiUrl },
          stderr: 'ignore' as const,
        }
      })(),
```

and add `import { outlineStdio } from './outlineCommand.ts'`.

`server/deck/build.ts` — replace line 16:

```ts
const SCRIPT = config.deckScript
```

(`config` is already imported in that file; if not, add `import { config } from '../config.ts'`.)

`server/db.ts` — replace `setupDatabase`:

```ts
/** Applies db/schema.sql (idempotent: create-if-not-exists + additive alters). */
export async function applySchema(): Promise<void> {
  await pool.query(await readFile(config.schemaFile, 'utf8'))
}

export async function setupDatabase(): Promise<void> {
  await ensureDatabase()
  await applySchema()
}
```

- [ ] **Step 4: Run tests, typecheck, full suite**

Run: `npx vitest run server/config.test.ts server/opener.test.ts server/ai/outlineCommand.test.ts && npx tsc -b && npx vitest run`
Expected: all PASS; no type errors.

- [ ] **Step 5: Commit (if approved)**

```bash
git add server/config.ts server/config.test.ts server/db.ts server/deck/build.ts server/exports.ts server/opener.ts server/opener.test.ts server/ai/outlineCommand.ts server/ai/outlineCommand.test.ts server/ai/mcp.ts
git commit -m "refactor: make server paths, folder opening and Outline MCP portable"
```

---

### Task 2: Backup file format

**Files:**
- Create: `server/backup/format.ts`
- Test: `server/backup/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `server/backup/format.ts`): `BACKUP_TABLES: readonly BackupTable[]` (parents before children), `type BackupTable`, `MAX_BACKUP_BYTES = 2 * 1024 ** 3`, `MAX_FILE_BYTES = 50 * 1024 * 1024`, `interface BackupManifest { format: 'sa-copilot-backup'; formatVersion: 1; appVersion: string; createdAt: string; tables: Record<string, number>; files: number }`, `interface BackupContents { manifest: BackupManifest; tables: Record<string, Record<string, unknown>[]>; files: Record<string, Uint8Array> }`, `class BackupError extends Error`, `isSafeFileName(name: string): boolean`, `packBackup(contents: Omit<BackupContents, 'manifest'>, appVersion: string, now?: Date): { data: Uint8Array; manifest: BackupManifest }`, `unpackBackup(data: Uint8Array): BackupContents & { warnings: string[] }`.

- [ ] **Step 1: Install fflate**

Run: `npm install fflate@0.8.3`
Expected: `package.json` dependencies gain `"fflate": "^0.8.3"`.

- [ ] **Step 2: Write the failing test**

`server/backup/format.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, BackupError, isSafeFileName, packBackup, unpackBackup } from './format.ts'

const schema = readFileSync(path.resolve(import.meta.dirname, '../../db/schema.sql'), 'utf8')

describe('BACKUP_TABLES', () => {
  it('covers exactly the tables in db/schema.sql', () => {
    const inSchema = [...schema.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1])
    expect([...BACKUP_TABLES].sort()).toEqual([...new Set(inSchema)].sort())
  })

  it('lists every referenced table before the table that references it', () => {
    const pairs: [child: string, parent: string][] = []
    for (const m of schema.matchAll(/create table if not exists (\w+) \(([\s\S]*?)\n\);/g)) {
      for (const r of m[2].matchAll(/references (\w+)/g)) pairs.push([m[1], r[1]])
    }
    for (const m of schema.matchAll(/alter table (\w+) add column[^;]*references (\w+)/g)) pairs.push([m[1], m[2]])
    const order = BACKUP_TABLES as readonly string[]
    for (const [child, parent] of pairs) {
      if (child !== parent) expect(order.indexOf(parent), `${parent} before ${child}`).toBeLessThan(order.indexOf(child))
    }
  })
})

describe('isSafeFileName', () => {
  it('accepts upload keys and rejects paths', () => {
    expect(isSafeFileName('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b-Brief_v2.pdf')).toBe(true)
    for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', 'x'.repeat(256)]) expect(isSafeFileName(bad), bad).toBe(false)
  })
})

describe('packBackup / unpackBackup', () => {
  const tables = { projects: [{ id: 'p1', name: 'Xhealth' }], documents: [] }
  const files = { 'abc-Brief.pdf': strToU8('%PDF-1.7') }

  it('round-trips tables, files and a manifest with counts', () => {
    const { data, manifest } = packBackup({ tables, files }, '1.0.0', new Date('2026-09-28T00:00:00Z'))
    expect(manifest).toEqual({
      format: 'sa-copilot-backup',
      formatVersion: 1,
      appVersion: '1.0.0',
      createdAt: '2026-09-28T00:00:00.000Z',
      tables: { projects: 1, documents: 0 },
      files: 1,
    })
    const back = unpackBackup(data)
    expect(back.manifest).toEqual(manifest)
    expect(back.tables.projects).toEqual([{ id: 'p1', name: 'Xhealth' }])
    expect(new TextDecoder().decode(back.files['abc-Brief.pdf'])).toBe('%PDF-1.7')
    expect(back.warnings).toEqual([])
  })

  it('warns about tables this version does not know and drops them', () => {
    const { data } = packBackup({ tables: { ...tables, old_table: [{ x: 1 }] }, files: {} }, '0.9.0')
    const back = unpackBackup(data)
    expect(back.tables).not.toHaveProperty('old_table')
    expect(back.warnings).toEqual(['Skipped unknown table "old_table" (1 rows)'])
  })

  it('rejects a zip without a manifest', () => {
    expect(() => unpackBackup(zipSync({ 'db/projects.json': strToU8('[]') }))).toThrow(new BackupError('Not an SA Copilot backup (manifest.json missing)'))
  })

  it('rejects another format or a newer format version', () => {
    const manifest = (m: object) => zipSync({ 'manifest.json': strToU8(JSON.stringify(m)) })
    expect(() => unpackBackup(manifest({ format: 'other', formatVersion: 1 }))).toThrow(BackupError)
    expect(() => unpackBackup(manifest({ format: 'sa-copilot-backup', formatVersion: 2 }))).toThrow(/newer version/)
  })

  it('rejects file names that could escape the upload folder', () => {
    const { data } = packBackup({ tables, files: {} }, '1.0.0')
    const tampered = zipSync({ ...unzipAll(data), 'files/../evil.js': strToU8('x') })
    expect(() => unpackBackup(tampered)).toThrow(/Unsafe file name/)
  })

  it('rejects an upload larger than 50 MB', () => {
    const { data } = packBackup({ tables, files: {} }, '1.0.0')
    const big = new Uint8Array(50 * 1024 * 1024 + 1)
    expect(() => unpackBackup(zipSync({ ...unzipAll(data), 'files/big.bin': big }, { level: 1 }))).toThrow(/larger than 50 MB/)
  })

  it('rejects anything that is not a zip', () => {
    expect(() => unpackBackup(strToU8('hello'))).toThrow(BackupError)
  })
})

function unzipAll(data: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(data)
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/backup/format.test.ts`
Expected: FAIL — `./format.ts` not found.

- [ ] **Step 4: Implement `server/backup/format.ts`**

```ts
// The .sacopilot backup file: a zip with manifest.json, db/<table>.json (all rows) and files/<upload key>.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'

export const BACKUP_FORMAT = 'sa-copilot-backup'
export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 2 * 1024 ** 3
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** Every table in db/schema.sql, parents before children (the restore order). */
export const BACKUP_TABLES = [
  'projects',
  'skills',
  'doc_templates',
  'app_settings',
  'mcp_servers',
  'n8n_node_skills',
  'sources',
  'documents',
  'document_versions',
  'pocs',
  'poc_versions',
  'messages',
  'attachments',
  'audit_log',
  'open_questions',
  'consistency_checks',
  'demo_scenarios',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  formatVersion: typeof BACKUP_FORMAT_VERSION
  appVersion: string
  createdAt: string
  tables: Record<string, number>
  files: number
}

export interface BackupContents {
  manifest: BackupManifest
  tables: Record<string, Record<string, unknown>[]>
  files: Record<string, Uint8Array>
}

export class BackupError extends Error {}

/** Upload keys are flat "<uuid>-<safe name>" file names; anything path-like is refused. */
export function isSafeFileName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !name.startsWith('.') && /^[\w.-]+$/.test(name)
}

export function packBackup(contents: Omit<BackupContents, 'manifest'>, appVersion: string, now = new Date()): { data: Uint8Array; manifest: BackupManifest } {
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    createdAt: now.toISOString(),
    tables: Object.fromEntries(Object.entries(contents.tables).map(([t, rows]) => [t, rows.length])),
    files: Object.keys(contents.files).length,
  }
  const zip: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)) }
  for (const [table, rows] of Object.entries(contents.tables)) zip[`db/${table}.json`] = strToU8(JSON.stringify(rows))
  for (const [name, bytes] of Object.entries(contents.files)) {
    if (!isSafeFileName(name)) throw new BackupError(`Unsafe file name "${name}"`)
    // Most uploads (PDF, DOCX, images) are already compressed.
    zip[`files/${name}`] = [bytes, { level: 0 }]
  }
  return { data: zipSync(zip, { level: 6 }), manifest }
}

function readManifest(entry: Uint8Array | undefined): BackupManifest {
  if (!entry) throw new BackupError('Not an SA Copilot backup (manifest.json missing)')
  let manifest: Partial<BackupManifest>
  try {
    manifest = JSON.parse(strFromU8(entry))
  } catch {
    throw new BackupError('manifest.json is not valid JSON')
  }
  if (manifest.format !== BACKUP_FORMAT) throw new BackupError('Not an SA Copilot backup (unknown format)')
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError('This backup was made by a newer version of SA Copilot — update the app first')
  }
  return manifest as BackupManifest
}

export function unpackBackup(data: Uint8Array): BackupContents & { warnings: string[] } {
  if (data.byteLength > MAX_BACKUP_BYTES) throw new BackupError('Backup is larger than 2 GB')
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        if (file.name.startsWith('files/') && file.originalSize > MAX_FILE_BYTES) throw new BackupError(`"${file.name.slice(6)}" is larger than 50 MB`)
        return !file.name.endsWith('/')
      },
    })
  } catch (e) {
    if (e instanceof BackupError) throw e
    throw new BackupError('Not a valid backup file (cannot read the zip)')
  }

  const manifest = readManifest(entries['manifest.json'])
  const known = new Set<string>(BACKUP_TABLES)
  const tables: BackupContents['tables'] = {}
  const files: BackupContents['files'] = {}
  const warnings: string[] = []

  for (const [name, bytes] of Object.entries(entries)) {
    if (name.startsWith('db/') && name.endsWith('.json')) {
      const table = name.slice(3, -5)
      let rows: unknown
      try {
        rows = JSON.parse(strFromU8(bytes))
      } catch {
        throw new BackupError(`${name} is not valid JSON`)
      }
      if (!Array.isArray(rows)) throw new BackupError(`${name} is not a list of rows`)
      if (!known.has(table)) warnings.push(`Skipped unknown table "${table}" (${rows.length} rows)`)
      else tables[table] = rows as Record<string, unknown>[]
    } else if (name.startsWith('files/')) {
      const file = name.slice(6)
      if (!isSafeFileName(file)) throw new BackupError(`Unsafe file name "${file}" in backup`)
      files[file] = bytes
    }
  }
  return { manifest, tables, files, warnings }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/backup/format.test.ts`
Expected: PASS (8 tests). If the FK-order test fails, reorder `BACKUP_TABLES` so the named parent comes first.

- [ ] **Step 6: Commit (if approved)**

```bash
git add package.json package-lock.json server/backup/format.ts server/backup/format.test.ts
git commit -m "feat: add .sacopilot backup file format"
```

---

### Task 3: Backup service & API

**Files:**
- Create: `server/backup/service.ts`, `server/backup/routes.ts`
- Modify: `server/index.ts` (mount routes)
- Test: `server/backup/service.test.ts` (integration, needs `TEST_DATABASE_URL`)

**Interfaces:**
- Consumes: `packBackup`, `unpackBackup`, `BACKUP_TABLES`, `BackupError`, `isSafeFileName`, `MAX_BACKUP_BYTES`, `BackupManifest` (Task 2); `applySchema`, `setupDatabase`, `query`, `withTransaction` (`server/db.ts`); `config.uploadDir`, `config.backupDir`, `config.appVersion` (Task 1).
- Produces: `createBackup(): Promise<{ data: Uint8Array; manifest: BackupManifest }>`, `restoreBackup(data: Uint8Array): Promise<{ manifest: BackupManifest; warnings: string[]; safetyBackup: string }>`, `summarize(manifest: BackupManifest): { projects: number; documents: number; files: number }`; HTTP: `GET /api/backup` (zip download), `POST /api/backup/inspect` (multipart `file`) → `{ manifest, summary, warnings }`, `POST /api/backup/restore` (multipart `file`, `confirm=RESTORE`) → `{ manifest, summary, warnings, safetyBackup }`.

- [ ] **Step 1: Write the failing integration test**

`server/backup/service.test.ts`:

```ts
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const url = process.env.TEST_DATABASE_URL
if (url && !/_test$/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test')

describe.skipIf(!url)('backup round trip (real database)', () => {
  const uploadDir = mkdtempSync(path.join(tmpdir(), 'sa-up-'))
  const backupDir = mkdtempSync(path.join(tmpdir(), 'sa-bk-'))
  let db: typeof import('../db.ts')
  let svc: typeof import('./service.ts')
  let fmt: typeof import('./format.ts')

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!)
    vi.stubEnv('UPLOAD_DIR', uploadDir)
    vi.stubEnv('BACKUP_DIR', backupDir)
    db = await import('../db.ts')
    svc = await import('./service.ts')
    fmt = await import('./format.ts')
    await db.setupDatabase()
    await db.query(`truncate table ${fmt.BACKUP_TABLES.join(', ')} cascade`)
  })

  it('restores exactly what was backed up, without firing triggers', async () => {
    const [project] = await db.query<{ id: string }>(`insert into projects (name, client_name) values ('Xhealth Appointment', 'Xhealth') returning id`)
    const [doc] = await db.query<{ id: string }>(`insert into documents (project_id, type, title) values ($1, 'tor', 'TOR') returning id`, [project.id])
    await db.query(`insert into document_versions (document_id, content) values ($1, '{"rows":[]}'), ($1, '{"rows":[{"layanan":"AI"}]}')`, [doc.id])
    writeFileSync(path.join(uploadDir, 'k1-brief.pdf'), 'PDF')
    const auditBefore = (await db.query<{ n: number }>('select count(*)::int as n from audit_log'))[0].n

    const { data } = await svc.createBackup()

    await db.query('delete from projects')
    await db.query(`insert into projects (name, client_name) values ('Other', 'Other')`)
    writeFileSync(path.join(uploadDir, 'k2-new.pdf'), 'NEW')

    const result = await svc.restoreBackup(data)

    expect((await db.query<{ name: string }>('select name from projects')).map((r) => r.name)).toEqual(['Xhealth Appointment'])
    expect((await db.query<{ version_no: number }>('select version_no from document_versions order by version_no')).map((r) => r.version_no)).toEqual([1, 2])
    expect((await db.query<{ n: number }>('select count(*)::int as n from audit_log'))[0].n).toBe(auditBefore)
    expect(readdirSync(uploadDir).sort()).toEqual(['k1-brief.pdf'])
    expect(readFileSync(path.join(uploadDir, 'k1-brief.pdf'), 'utf8')).toBe('PDF')
    expect(readdirSync(backupDir)).toContain(path.basename(result.safetyBackup))
    expect(svc.summarize(result.manifest)).toEqual({ projects: 1, documents: 1, files: 1 })
  })

  it('restores a backup from an older version whose rows lack newer columns', async () => {
    const legacy = fmt.packBackup(
      {
        tables: {
          // No language / notion_page_id / timestamps: the column defaults must fill them in.
          projects: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Legacy', client_name: 'Old Client', status: 'discovery' }],
          retired_table: [{ id: 1 }],
        },
        files: {},
      },
      '0.9.0',
    ).data
    const result = await svc.restoreBackup(legacy)
    const [row] = await db.query<{ name: string; created_at: Date }>('select name, created_at from projects')
    expect(row.name).toBe('Legacy')
    expect(row.created_at).toBeInstanceOf(Date)
    expect(result.warnings).toEqual(['Skipped unknown table "retired_table" (1 rows)'])
  })

  it('leaves the database untouched when the backup is invalid', async () => {
    const before = await db.query('select id from projects')
    await expect(svc.restoreBackup(new TextEncoder().encode('not a zip'))).rejects.toThrow(fmt.BackupError)
    expect(await db.query('select id from projects')).toEqual(before)
  })
})
```

- [ ] **Step 2: Create the test database URL and run to verify it fails**

`TEST_DATABASE_URL` is `DATABASE_URL` from `.env` with the database name replaced by `sa_copilot_test` (it is created automatically by `setupDatabase`). Add it to `.env` (not committed):

```bash
node --env-file=.env -e "const u=new URL(process.env.DATABASE_URL);u.pathname='/sa_copilot_test';console.log('TEST_DATABASE_URL='+u)" >> .env
```

Run: `node --env-file=.env node_modules/vitest/vitest.mjs run server/backup/service.test.ts`
Expected: FAIL — `./service.ts` not found.

- [ ] **Step 3: Implement `server/backup/service.ts`**

```ts
// Backup = every table + every upload file; Restore = replace them all in one transaction.
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type pg from 'pg'
import { config } from '../config.ts'
import { applySchema, query, withTransaction } from '../db.ts'
import { HttpError } from '../http.ts'
import { BACKUP_TABLES, isSafeFileName, packBackup, unpackBackup, type BackupManifest } from './format.ts'

const INSERT_CHUNK = 500

async function uploadFileNames(): Promise<string[]> {
  try {
    return (await readdir(config.uploadDir)).filter(isSafeFileName)
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return []
    throw e
  }
}

export async function createBackup(): Promise<{ data: Uint8Array; manifest: BackupManifest }> {
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const table of BACKUP_TABLES) tables[table] = await query(`select * from ${table}`)
  const files: Record<string, Uint8Array> = {}
  for (const name of await uploadFileNames()) files[name] = await readFile(path.join(config.uploadDir, name))
  return packBackup({ tables, files }, config.appVersion)
}

export function summarize(manifest: BackupManifest): { projects: number; documents: number; files: number } {
  return { projects: manifest.tables.projects ?? 0, documents: manifest.tables.documents ?? 0, files: manifest.files }
}

async function tableColumns(tx: pg.PoolClient, table: string): Promise<Set<string>> {
  const { rows } = await tx.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table],
  )
  return new Set(rows.map((r) => r.column_name))
}

async function insertRows(tx: pg.PoolClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return
  const existing = await tableColumns(tx, table)
  // Only columns both the backup and this schema know; the rest get their column defaults.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => existing.has(c))
  if (!columns.length) return
  const list = columns.map((c) => `"${c}"`).join(', ')
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await tx.query(`insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json)`, [
      JSON.stringify(rows.slice(i, i + INSERT_CHUNK)),
    ])
  }
}

export async function restoreBackup(data: Uint8Array): Promise<{ manifest: BackupManifest; warnings: string[]; safetyBackup: string }> {
  const contents = unpackBackup(data) // validates before anything is touched

  const current = await createBackup()
  await mkdir(config.backupDir, { recursive: true })
  const safetyBackup = path.join(config.backupDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.sacopilot`)
  await writeFile(safetyBackup, current.data)

  try {
    await withTransaction(async (tx) => {
      // Replica mode: no triggers (audit log, version numbering) and no FK checks while rows are re-inserted.
      await tx.query('set local session_replication_role = replica')
      await tx.query(`truncate table ${BACKUP_TABLES.join(', ')} cascade`)
      for (const table of BACKUP_TABLES) await insertRows(tx, table, contents.tables[table] ?? [])
    })
  } catch (e) {
    if ((e as { code?: string }).code === '42501') throw new HttpError(500, 'Restore needs a superuser database role (session_replication_role)')
    throw e
  }
  await applySchema()

  for (const name of await uploadFileNames()) await unlink(path.join(config.uploadDir, name))
  await mkdir(config.uploadDir, { recursive: true })
  for (const [name, bytes] of Object.entries(contents.files)) await writeFile(path.join(config.uploadDir, name), bytes)

  return { manifest: contents.manifest, warnings: contents.warnings, safetyBackup }
}
```

`server/backup/routes.ts`:

```ts
// Settings → Backup: download a .sacopilot file, inspect one, restore one.
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HttpError } from '../http.ts'
import { BackupError, MAX_BACKUP_BYTES, unpackBackup } from './format.ts'
import { createBackup, restoreBackup, summarize } from './service.ts'

export const backup = new Hono()

const limit = bodyLimit({ maxSize: MAX_BACKUP_BYTES + 1024 * 1024, onError: (c) => c.json({ error: 'Backup is larger than 2 GB' }, 413) })

async function uploadedBackup(c: Context): Promise<{ bytes: Uint8Array; confirm: string }> {
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a .sacopilot backup file')
  return { bytes: new Uint8Array(await file.arrayBuffer()), confirm: String(form.get('confirm') ?? '') }
}

function asHttp(e: unknown): never {
  if (e instanceof BackupError) throw new HttpError(400, e.message)
  throw e
}

backup.get('/backup', async (c) => {
  const { data, manifest } = await createBackup()
  const day = manifest.createdAt.slice(0, 10)
  return c.body(Buffer.from(data), 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="SA Copilot backup ${day}.sacopilot"`,
  })
})

backup.post('/backup/inspect', limit, async (c) => {
  const { bytes } = await uploadedBackup(c)
  try {
    const { manifest, warnings } = unpackBackup(bytes)
    return c.json({ manifest, summary: summarize(manifest), warnings })
  } catch (e) {
    asHttp(e)
  }
})

backup.post('/backup/restore', limit, async (c) => {
  const { bytes, confirm } = await uploadedBackup(c)
  if (confirm !== 'RESTORE') throw new HttpError(400, 'Type RESTORE to confirm')
  try {
    const result = await restoreBackup(bytes)
    return c.json({ ...result, summary: summarize(result.manifest) })
  } catch (e) {
    asHttp(e)
  }
})
```

`server/index.ts` — add `import { backup } from './backup/routes.ts'` and, next to the other routes, `app.route('/api', backup)`.

- [ ] **Step 4: Run tests**

Run: `node --env-file=.env node_modules/vitest/vitest.mjs run server/backup && npx tsc -b && npx vitest run`
Expected: backup integration tests PASS (3); full suite PASS (integration test is skipped when `TEST_DATABASE_URL` is unset).

- [ ] **Step 5: Manual API check against the running dev server**

Run: `npm run serve` (another terminal), then `curl -s -o /tmp/b.sacopilot -w "%{http_code} %{size_download}\n" localhost:3000/api/backup && curl -s -F file=@/tmp/b.sacopilot localhost:3000/api/backup/inspect`
Expected: `200 <bytes>` then JSON with `summary.projects` ≥ 1. Do **not** call `/restore` against the real database.

- [ ] **Step 6: Commit (if approved)**

```bash
git add server/backup server/index.ts
git commit -m "feat: backup and restore API"
```

---

### Task 4: Settings → Backup UI

**Files:**
- Create: `src/pages/settings/BackupSettings.tsx`
- Modify: `src/lib/api.ts`, `src/lib/types.ts`, `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `/api/backup`, `/api/backup/inspect`, `/api/backup/restore` (Task 3).
- Produces: `backupApi.downloadUrl: string`, `backupApi.inspect(file: File): Promise<BackupInspect>`, `backupApi.restore(file: File): Promise<BackupRestoreResult>`; types `BackupInspect { manifest: { appVersion: string; createdAt: string; tables: Record<string, number>; files: number }; summary: { projects: number; documents: number; files: number }; warnings: string[] }`, `BackupRestoreResult = BackupInspect & { safetyBackup: string }`; Settings tab id `'backup'`.

- [ ] **Step 1: Add types and API client**

`src/lib/types.ts` (append):

```ts
export interface BackupInspect {
  manifest: { appVersion: string; createdAt: string; tables: Record<string, number>; files: number }
  summary: { projects: number; documents: number; files: number }
  warnings: string[]
}

export type BackupRestoreResult = BackupInspect & { safetyBackup: string }
```

`src/lib/api.ts` (append; add `BackupInspect, BackupRestoreResult` to the type import):

```ts
// ---------- backup ----------

function backupForm(file: File, confirm?: string): FormData {
  const form = new FormData()
  form.set('file', file)
  if (confirm) form.set('confirm', confirm)
  return form
}

export const backupApi = {
  downloadUrl: '/api/backup',
  inspect: (file: File) => request<BackupInspect>('Read backup', '/backup/inspect', { method: 'POST', body: backupForm(file) }),
  restore: (file: File) => request<BackupRestoreResult>('Restore backup', '/backup/restore', { method: 'POST', body: backupForm(file, 'RESTORE') }),
}
```

- [ ] **Step 2: Create `src/pages/settings/BackupSettings.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query'
import { Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Card, ErrorNote, Input } from '../../components/ui'
import { backupApi } from '../../lib/api'
import type { BackupInspect } from '../../lib/types'

/** Move all data between devices: one .sacopilot file with every project, document, POC and upload (no keys). */
export function BackupSettings() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BackupInspect | null>(null)
  const [confirm, setConfirm] = useState('')

  const inspect = useMutation({
    mutationFn: (f: File) => backupApi.inspect(f),
    onSuccess: (data) => setPreview(data),
  })
  const restore = useMutation({
    mutationFn: () => backupApi.restore(file!),
    onSuccess: () => window.setTimeout(() => window.location.assign('/'), 1500),
  })

  const pick = (f: File | undefined) => {
    setPreview(null)
    setConfirm('')
    restore.reset()
    setFile(f ?? null)
    if (f) inspect.mutate(f)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="font-display text-lg font-semibold">Backup</h3>
        <p className="text-sm text-muted">
          Downloads every project, document, POC, question, skill, format and uploaded file as one <code>.sacopilot</code> file. Keys and connections are not included.
        </p>
        <a href={backupApi.downloadUrl} download className="inline-flex items-center gap-2 rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90">
          <Download className="size-4" /> Download backup
        </a>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-display text-lg font-semibold">Restore</h3>
        <p className="text-sm text-muted">Replaces all data on this device with the backup. The current data is backed up automatically first.</p>
        <input ref={input} type="file" accept=".sacopilot,application/zip" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="outline" icon={<Upload className="size-4" />} loading={inspect.isPending} onClick={() => input.current?.click()}>
          {file ? file.name : 'Choose backup file'}
        </Button>
        <ErrorNote error={inspect.error ?? restore.error} />
        {preview && (
          <div className="space-y-3 rounded-lg border border-line bg-paper p-3 text-sm">
            <p>
              Made {new Date(preview.manifest.createdAt).toLocaleString()} (app {preview.manifest.appVersion}) —{' '}
              <strong>{preview.summary.projects}</strong> projects, <strong>{preview.summary.documents}</strong> documents, <strong>{preview.summary.files}</strong> files.
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="text-warn">{w}</p>
            ))}
            {restore.data ? (
              <p className="text-ok">Restored. Previous data saved to {restore.data.safetyBackup}. Reloading…</p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Type RESTORE to confirm</span>
                  <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" />
                </label>
                <Button variant="danger" icon={<RotateCcw className="size-4" />} loading={restore.isPending} disabled={confirm !== 'RESTORE'} onClick={() => restore.mutate()}>
                  Restore and replace all data
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Register the tab**

`src/pages/SettingsPage.tsx`: add `Archive` to the lucide import, `import { BackupSettings } from './settings/BackupSettings'`, a tab entry before `'theme'`:

```ts
  {
    id: 'backup',
    label: 'Backup',
    icon: Archive,
    intro: 'Move all your data to another device: download a backup here, restore it there.',
  },
```

and in `TabContent`: `case 'backup': return <BackupSettings />`.

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npx oxlint src && npm run build`
Expected: no errors. Then with `npm run serve` running, open `http://localhost:3000/settings/backup`, click **Download backup** (a `.sacopilot` downloads), choose it under Restore (summary shows the real project count). Do not press Restore on real data.

- [ ] **Step 5: Commit (if approved)**

```bash
git add src/pages/settings/BackupSettings.tsx src/lib/api.ts src/lib/types.ts src/pages/SettingsPage.tsx
git commit -m "feat: Settings → Backup page"
```

---

### Task 5: Electron foundation (deps, paths, ports, processes)

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`
- Create: `tsconfig.electron.json`, `electron/paths.ts`, `electron/ports.ts`, `electron/processes.ts`
- Test: `electron/paths.test.ts`, `electron/ports.test.ts`, `electron/processes.test.ts`

**Interfaces:**
- Produces:
  - `resolvePaths(input: PathInput): AppPaths` where `PathInput { isPackaged: boolean; appPath: string; resourcesPath: string; userData: string; documents: string; platform: NodeJS.Platform }` and `AppPaths { appRoot; dataDir; pgDir; uploadDir; backupDir; logsDir; configFile; defaultDocsDir; distDir; schemaFile; serverEntry; python; deckScript; defaultDeckTemplate; routerAppDir; outlineEntry }` (all strings).
  - `freePort(): Promise<number>`, `isListening(port: number): Promise<boolean>`.
  - `isStalePidFile(content: string, isAlive: (pid: number) => boolean): boolean`, `killTreeCommand(pid: number, platform: NodeJS.Platform): { command: string; args: string[] } | null`, `killTree(pid: number): Promise<void>`, `createLogger(dir: string, name: string): (line: string) => void`.

- [ ] **Step 1: Install dependencies**

```bash
npm install embedded-postgres@18.4.0-beta.17 9router@0.5.91 outline-mcp-server@5.8.5
npm install -D electron@44.4.5 electron-builder@26.15.3 esbuild@0.28.2
```

Expected: installs succeed (`embedded-postgres` runs a postinstall that creates symlinks — it must not be skipped).

- [ ] **Step 2: Config files**

`tsconfig.electron.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.electron.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["electron"]
}
```

`tsconfig.json` references: add `{ "path": "./tsconfig.electron.json" }`.

`vite.config.ts` test include: `['src/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts', 'electron/**/*.test.ts']`.

`.gitignore` (append):

```
# desktop build output
release/
server-dist/
electron-dist/
build/python/
build/cache/
build/templates/
```

- [ ] **Step 3: Write failing tests**

`electron/paths.test.ts`:

```ts
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePaths } from './paths.ts'

const base = { userData: '/data/SA Copilot', documents: '/home/u/Documents' }

describe('resolvePaths', () => {
  it('points at bundled resources in the installed Windows app', () => {
    const p = resolvePaths({ ...base, isPackaged: true, appPath: 'C:/SA/resources/app', resourcesPath: 'C:/SA/resources', platform: 'win32' })
    expect(p.python).toBe(path.join('C:/SA/resources', 'python', 'python.exe'))
    expect(p.deckScript).toBe(path.join('C:/SA/resources', 'deck', 'build_deck.py'))
    expect(p.defaultDeckTemplate).toBe(path.join('C:/SA/resources', 'templates', 'deck.pptx'))
    expect(p.serverEntry).toBe(path.join('C:/SA/resources/app', 'server-dist', 'index.mjs'))
    expect(p.routerAppDir).toBe(path.join('C:/SA/resources/app', 'node_modules', '9router', 'app'))
    expect(p.outlineEntry).toBe(path.join('C:/SA/resources/app', 'node_modules', 'outline-mcp-server', 'build', 'stdio.js'))
  })

  it('uses bin/python3 on macOS', () => {
    const p = resolvePaths({ ...base, isPackaged: true, appPath: '/A/Resources/app', resourcesPath: '/A/Resources', platform: 'darwin' })
    expect(p.python).toBe(path.join('/A/Resources', 'python', 'bin', 'python3'))
  })

  it('keeps all user data in the data folder and exports in Documents', () => {
    const p = resolvePaths({ ...base, isPackaged: true, appPath: '/a', resourcesPath: '/r', platform: 'darwin' })
    expect(p.pgDir).toBe(path.join(base.userData, 'pg'))
    expect(p.uploadDir).toBe(path.join(base.userData, 'uploads'))
    expect(p.backupDir).toBe(path.join(base.userData, 'backups'))
    expect(p.logsDir).toBe(path.join(base.userData, 'logs'))
    expect(p.configFile).toBe(path.join(base.userData, 'config.json'))
    expect(p.defaultDocsDir).toBe(path.join(base.documents, 'SA Copilot'))
  })

  it('uses the repo and system Python in dev (npm run desktop)', () => {
    const p = resolvePaths({ ...base, isPackaged: false, appPath: '/repo', resourcesPath: '/electron/resources', platform: 'win32' })
    expect(p.python).toBe('python')
    expect(p.deckScript).toBe(path.join('/repo', 'server', 'deck', 'build_deck.py'))
    expect(p.defaultDeckTemplate).toBe(path.join('/repo', 'data', 'templates', 'deck.pptx'))
  })
})
```

`electron/ports.test.ts`:

```ts
import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { freePort, isListening } from './ports.ts'

const open: net.Server[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))

function listen(port = 0): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(port, '127.0.0.1', () => resolve((s.address() as net.AddressInfo).port))
    open.push(s)
  })
}

describe('ports', () => {
  it('finds a port nobody listens on', async () => {
    const port = await freePort()
    expect(port).toBeGreaterThan(0)
    expect(await isListening(port)).toBe(false)
  })

  it('never returns a port that is taken', async () => {
    const taken = await listen()
    expect(await isListening(taken)).toBe(true)
    for (let i = 0; i < 20; i++) expect(await freePort()).not.toBe(taken)
  })
})
```

`electron/processes.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLogger, isStalePidFile, killTreeCommand } from './processes.ts'

describe('isStalePidFile', () => {
  const pidFile = (pid: number) => `${pid}\n/data/pg\n1790000000\n54329\n`
  it('is stale when the recorded postmaster is gone', () => {
    expect(isStalePidFile(pidFile(4242), () => false)).toBe(true)
  })
  it('is not stale while that process runs', () => {
    expect(isStalePidFile(pidFile(4242), (pid) => pid === 4242)).toBe(false)
  })
  it('treats an unreadable pid file as stale', () => {
    expect(isStalePidFile('', () => true)).toBe(true)
    expect(isStalePidFile('garbage', () => true)).toBe(true)
  })
})

describe('killTreeCommand', () => {
  it('uses taskkill with /T on Windows', () => {
    expect(killTreeCommand(123, 'win32')).toEqual({ command: 'taskkill', args: ['/PID', '123', '/T', '/F'] })
  })
  it('uses a process-group signal elsewhere', () => {
    expect(killTreeCommand(123, 'darwin')).toBeNull()
  })
})

describe('createLogger', () => {
  it('appends timestamped lines to <name>.log', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sa-log-'))
    const log = createLogger(dir, 'server')
    log('hello')
    log('world')
    const text = readFileSync(path.join(dir, 'server.log'), 'utf8')
    expect(text).toMatch(/^\d{4}-\d\d-\d\dT.* hello\n.* world\n$/)
  })
})
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run electron`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement**

`electron/paths.ts`:

```ts
// Every filesystem location the desktop app uses, for the installed app and for `npm run desktop` in the repo.
import path from 'node:path'

export interface PathInput {
  isPackaged: boolean
  /** Electron app.getAppPath(): resources/app when installed, the repo root in dev. */
  appPath: string
  /** process.resourcesPath: where extraResources (python, deck, templates) are installed. */
  resourcesPath: string
  userData: string
  documents: string
  platform: NodeJS.Platform
}

export interface AppPaths {
  appRoot: string
  dataDir: string
  pgDir: string
  uploadDir: string
  backupDir: string
  logsDir: string
  configFile: string
  defaultDocsDir: string
  distDir: string
  schemaFile: string
  serverEntry: string
  python: string
  deckScript: string
  defaultDeckTemplate: string
  routerAppDir: string
  outlineEntry: string
}

export function resolvePaths(input: PathInput): AppPaths {
  const root = input.appPath
  const res = input.resourcesPath
  const data = input.userData
  const pythonExe = input.platform === 'win32' ? path.join(res, 'python', 'python.exe') : path.join(res, 'python', 'bin', 'python3')
  return {
    appRoot: root,
    dataDir: data,
    pgDir: path.join(data, 'pg'),
    uploadDir: path.join(data, 'uploads'),
    backupDir: path.join(data, 'backups'),
    logsDir: path.join(data, 'logs'),
    configFile: path.join(data, 'config.json'),
    defaultDocsDir: path.join(input.documents, 'SA Copilot'),
    distDir: path.join(root, 'dist'),
    schemaFile: path.join(root, 'db', 'schema.sql'),
    serverEntry: path.join(root, 'server-dist', 'index.mjs'),
    python: input.isPackaged ? pythonExe : 'python',
    deckScript: input.isPackaged ? path.join(res, 'deck', 'build_deck.py') : path.join(root, 'server', 'deck', 'build_deck.py'),
    defaultDeckTemplate: input.isPackaged ? path.join(res, 'templates', 'deck.pptx') : path.join(root, 'data', 'templates', 'deck.pptx'),
    routerAppDir: path.join(root, 'node_modules', '9router', 'app'),
    outlineEntry: path.join(root, 'node_modules', 'outline-mcp-server', 'build', 'stdio.js'),
  }
}
```

`electron/ports.ts`:

```ts
// Loopback port helpers: the app never assumes 5432/3000 are free on a user's device.
import net from 'node:net'

/** A port on 127.0.0.1 that is free right now (the OS picks it). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/** True when something accepts TCP connections on 127.0.0.1:port. */
export function isListening(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (value: boolean) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}
```

`electron/processes.ts`:

```ts
// Child-process housekeeping: stale Postgres lock files, killing process trees, simple log files.
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

const MAX_LOG_BYTES = 5 * 1024 * 1024

/** postmaster.pid's first line is the server pid; the file is stale when that process no longer runs. */
export function isStalePidFile(content: string, isAlive: (pid: number) => boolean): boolean {
  const pid = Number.parseInt(content.split('\n')[0] ?? '', 10)
  return !Number.isInteger(pid) || pid <= 0 || !isAlive(pid)
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as { code?: string }).code === 'EPERM'
  }
}

export function killTreeCommand(pid: number, platform: NodeJS.Platform): { command: string; args: string[] } | null {
  return platform === 'win32' ? { command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] } : null
}

/** Kills a process and everything it started. On macOS the child must have been spawned with `detached: true`. */
export function killTree(pid: number): Promise<void> {
  const cmd = killTreeCommand(pid, process.platform)
  if (!cmd) {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      // already gone
    }
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const child = spawn(cmd.command, cmd.args, { stdio: 'ignore', windowsHide: true })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })
}

/** Appends "<ISO time> <line>" to <dir>/<name>.log, rolling over to <name>.log.1 at 5 MB. */
export function createLogger(dir: string, name: string): (line: string) => void {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.log`)
  return (line: string) => {
    try {
      if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES) renameSync(file, `${file}.1`)
      appendFileSync(file, `${new Date().toISOString()} ${line.replace(/\s+$/, '')}\n`)
    } catch {
      // logging must never take the app down
    }
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run electron && npx tsc -b`
Expected: PASS (paths 4, ports 2, processes 6).

- [ ] **Step 7: Commit (if approved)**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.electron.json vite.config.ts .gitignore electron/paths.ts electron/paths.test.ts electron/ports.ts electron/ports.test.ts electron/processes.ts electron/processes.test.ts
git commit -m "feat: electron foundation (paths, ports, process helpers)"
```

---

### Task 6: Desktop config store (all former .env values, editable)

**Files:**
- Create: `electron/settings.ts` (keys and types only — no Node imports, so the React app can import its types), `electron/config.ts`
- Test: `electron/config.test.ts`

**Interfaces:**
- Consumes: `AppPaths` (Task 5).
- Produces:
  - From `electron/settings.ts`: `SECRET_KEYS = ['routerApiKey', 'outlineApiKey', 'demoSupabaseKey', 'notionToken'] as const`, `VALUE_KEYS = ['aiBaseUrl', 'aiModel', 'chatEffort', 'generateEffort', 'outlineApiUrl', 'demoSupabaseUrl', 'demoAppUrl', 'notionParentPage', 'docsDir', 'deckTemplate'] as const`, types `SecretKey`, `ValueKey`, `ConfigPatch`, `PublicConfig` (re-exported by `electron/config.ts`).
  - `interface Cipher { encrypt(plain: string): string; decrypt(stored: string): string }`.
  - `interface DesktopConfig { values: Record<ValueKey, string>; secrets: Record<SecretKey, string>; pgPassword: string }`.
  - `interface ConfigPatch { values?: Partial<Record<ValueKey, string>>; secrets?: Partial<Record<SecretKey, string>> }` — secrets: `undefined` keeps, `''` clears.
  - `class ConfigStore { constructor(file: string, cipher: Cipher); read(): Promise<DesktopConfig>; save(patch: ConfigPatch): Promise<DesktopConfig>; ensurePgPassword(): Promise<DesktopConfig> }`.
  - `parsePatch(input: unknown): ConfigPatch` (throws `Error` on bad input).
  - `interface PublicConfig { configured: boolean; values: Record<ValueKey, string>; secretsSet: Record<SecretKey, boolean> }`, `publicConfig(cfg: DesktopConfig): PublicConfig`.
  - `interface Ports { postgres: number; router: number; server: number }`, `buildServerEnv(cfg: DesktopConfig, paths: AppPaths, ports: Ports, appVersion: string): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

`electron/config.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigStore, buildServerEnv, parsePatch, publicConfig, type Cipher } from './config.ts'
import { resolvePaths } from './paths.ts'

// Reversible but obviously not plaintext.
const cipher: Cipher = {
  encrypt: (s) => `enc:${Buffer.from(s).toString('base64')}`,
  decrypt: (s) => {
    if (!s.startsWith('enc:')) throw new Error('bad ciphertext')
    return Buffer.from(s.slice(4), 'base64').toString()
  },
}

const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'sa-cfg-')), 'config.json')

describe('ConfigStore', () => {
  it('starts empty and not configured', async () => {
    const cfg = await new ConfigStore(tmpFile(), cipher).read()
    expect(publicConfig(cfg).configured).toBe(false)
    expect(cfg.values.aiModel).toBe('')
    expect(cfg.secrets.routerApiKey).toBe('')
  })

  it('saves values and secrets, never writing secrets in plaintext', async () => {
    const file = tmpFile()
    const store = new ConfigStore(file, cipher)
    await store.save({ values: { outlineApiUrl: 'https://wiki.cekat.ai/api' }, secrets: { routerApiKey: 'sk-router-123', outlineApiKey: 'ol_api_abc' } })
    const onDisk = readFileSync(file, 'utf8')
    expect(onDisk).not.toContain('sk-router-123')
    expect(onDisk).not.toContain('ol_api_abc')
    const cfg = await new ConfigStore(file, cipher).read()
    expect(cfg.secrets.routerApiKey).toBe('sk-router-123')
    expect(publicConfig(cfg)).toMatchObject({ configured: true, secretsSet: { routerApiKey: true, outlineApiKey: true, notionToken: false } })
    expect(JSON.stringify(publicConfig(cfg))).not.toContain('sk-router-123')
  })

  it('keeps a secret when the patch omits it and clears it with an empty string', async () => {
    const store = new ConfigStore(tmpFile(), cipher)
    await store.save({ secrets: { routerApiKey: 'k1', notionToken: 'n1' } })
    await store.save({ values: { aiModel: 'cc/claude-opus-5-5' } })
    expect((await store.read()).secrets.routerApiKey).toBe('k1')
    await store.save({ secrets: { notionToken: '' } })
    expect((await store.read()).secrets.notionToken).toBe('')
  })

  it('shows Setup again when secrets cannot be decrypted (config from another device)', async () => {
    const file = tmpFile()
    writeFileSync(file, JSON.stringify({ version: 1, values: {}, secrets: { routerApiKey: 'foreign-blob' }, pgPassword: 'enc:cHc=' }))
    const cfg = await new ConfigStore(file, cipher).read()
    expect(cfg.secrets.routerApiKey).toBe('')
    expect(publicConfig(cfg).configured).toBe(false)
  })

  it('generates the Postgres password once and keeps it', async () => {
    const store = new ConfigStore(tmpFile(), cipher)
    const first = (await store.ensurePgPassword()).pgPassword
    expect(first).toMatch(/^[0-9a-f]{48}$/)
    expect((await store.ensurePgPassword()).pgPassword).toBe(first)
  })
})

describe('parsePatch', () => {
  it('accepts known string fields only', () => {
    expect(parsePatch({ values: { aiModel: 'x' }, secrets: { routerApiKey: 'y' } })).toEqual({ values: { aiModel: 'x' }, secrets: { routerApiKey: 'y' } })
  })
  it('rejects unknown keys, non-strings and oversized values', () => {
    expect(() => parsePatch({ values: { pgPassword: 'x' } })).toThrow()
    expect(() => parsePatch({ secrets: { routerApiKey: 5 } })).toThrow()
    expect(() => parsePatch({ values: { aiModel: 'x'.repeat(2001) } })).toThrow()
    expect(() => parsePatch('nope')).toThrow()
  })
  it('rejects efforts outside low/medium/high and non-http URLs', () => {
    expect(() => parsePatch({ values: { chatEffort: 'max' } })).toThrow()
    expect(() => parsePatch({ values: { aiBaseUrl: 'file:///etc/passwd' } })).toThrow()
    expect(parsePatch({ values: { chatEffort: '', aiBaseUrl: '' } })).toEqual({ values: { chatEffort: '', aiBaseUrl: '' } })
  })
})

describe('buildServerEnv', () => {
  const paths = resolvePaths({ isPackaged: true, appPath: '/A/app', resourcesPath: '/A', userData: '/D', documents: '/Docs', platform: 'darwin' })
  const ports = { postgres: 54329, router: 20128, server: 51234 }
  const cfg = {
    values: { aiBaseUrl: '', aiModel: '', chatEffort: '', generateEffort: 'high', outlineApiUrl: '', demoSupabaseUrl: '', demoAppUrl: '', notionParentPage: 'https://notion.so/p-1a2b', docsDir: '', deckTemplate: '' },
    secrets: { routerApiKey: 'sk-9', outlineApiKey: 'ol_1', demoSupabaseKey: '', notionToken: 'ntn_1' },
    pgPassword: 'p@ss w',
  }

  it('wires the database, 9router and every path', () => {
    const env = buildServerEnv(cfg, paths, ports, '1.0.0')
    expect(env).toMatchObject({
      DATABASE_URL: 'postgres://postgres:p%40ss%20w@127.0.0.1:54329/sa_copilot',
      PORT: '51234',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:20128',
      ANTHROPIC_API_KEY: 'sk-9',
      UPLOAD_DIR: path.join('/D', 'uploads'),
      BACKUP_DIR: path.join('/D', 'backups'),
      DOCS_DIR: path.join('/Docs', 'SA Copilot'),
      DECK_TEMPLATE: path.join('/A', 'templates', 'deck.pptx'),
      DECK_SCRIPT: path.join('/A', 'deck', 'build_deck.py'),
      MARKITDOWN_PYTHON: path.join('/A', 'python', 'bin', 'python3'),
      DIST_DIR: path.join('/A/app', 'dist'),
      SCHEMA_FILE: path.join('/A/app', 'db', 'schema.sql'),
      OUTLINE_MCP_ENTRY: path.join('/A/app', 'node_modules', 'outline-mcp-server', 'build', 'stdio.js'),
      OUTLINE_API_KEY: 'ol_1',
      NOTION_TOKEN: 'ntn_1',
      NOTION_PARENT_PAGE: 'https://notion.so/p-1a2b',
      GENERATE_EFFORT: 'high',
      SA_APP_VERSION: '1.0.0',
    })
  })

  it('leaves unset optional values out so the server defaults apply', () => {
    const env = buildServerEnv(cfg, paths, ports, '1.0.0')
    for (const name of ['OUTLINE_API_URL', 'DEMO_SUPABASE_URL', 'DEMO_SUPABASE_KEY', 'DEMO_APP_URL', 'ANTHROPIC_MODEL', 'CHAT_EFFORT']) expect(env).not.toHaveProperty(name)
  })

  it('lets the user point AI at another router or the Claude API, and override folders', () => {
    const env = buildServerEnv(
      { ...cfg, values: { ...cfg.values, aiBaseUrl: 'https://api.anthropic.com', aiModel: 'claude-opus-5-5', docsDir: '/X/exports', deckTemplate: '/X/deck.pptx' } },
      paths,
      ports,
      '1.0.0',
    )
    expect(env).toMatchObject({ ANTHROPIC_BASE_URL: 'https://api.anthropic.com', ANTHROPIC_MODEL: 'claude-opus-5-5', DOCS_DIR: '/X/exports', DECK_TEMPLATE: '/X/deck.pptx' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run electron/config.test.ts`
Expected: FAIL — `./config.ts` not found.

- [ ] **Step 3: Implement `electron/settings.ts`**

```ts
// The desktop settings (everything that used to live in .env). Types only + key lists: no Node imports,
// because the React app imports these types for Settings → Connections.

export const SECRET_KEYS = ['routerApiKey', 'outlineApiKey', 'demoSupabaseKey', 'notionToken'] as const
export const VALUE_KEYS = ['aiBaseUrl', 'aiModel', 'chatEffort', 'generateEffort', 'outlineApiUrl', 'demoSupabaseUrl', 'demoAppUrl', 'notionParentPage', 'docsDir', 'deckTemplate'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]
export type ValueKey = (typeof VALUE_KEYS)[number]

/** Secrets: undefined keeps the saved one, '' removes it. */
export interface ConfigPatch {
  values?: Partial<Record<ValueKey, string>>
  secrets?: Partial<Record<SecretKey, string>>
}

/** What the UI may see: every value, but only whether each secret is set. */
export interface PublicConfig {
  configured: boolean
  values: Record<ValueKey, string>
  secretsSet: Record<SecretKey, boolean>
}
```

- [ ] **Step 4: Implement `electron/config.ts`**

```ts
// Everything that used to live in .env, stored per device in <data>/config.json. Secrets are encrypted with the
// OS keychain (Electron safeStorage); the Postgres password is generated once and never shown.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppPaths } from './paths.ts'
import { SECRET_KEYS, VALUE_KEYS, type ConfigPatch, type PublicConfig, type SecretKey, type ValueKey } from './settings.ts'

export { SECRET_KEYS, VALUE_KEYS, type ConfigPatch, type PublicConfig, type SecretKey, type ValueKey }

const URL_KEYS = new Set<ValueKey>(['aiBaseUrl', 'outlineApiUrl', 'demoSupabaseUrl', 'demoAppUrl', 'notionParentPage'])
const EFFORT_KEYS = new Set<ValueKey>(['chatEffort', 'generateEffort'])
const MAX_LENGTH = 2000

export interface Cipher {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

export interface DesktopConfig {
  values: Record<ValueKey, string>
  secrets: Record<SecretKey, string>
  pgPassword: string
}

interface StoredConfig {
  version: 1
  values: Partial<Record<ValueKey, string>>
  secrets: Partial<Record<SecretKey, string>>
  pgPassword?: string
}

const empty = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, ''])) as Record<K, string>

export class ConfigStore {
  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {}

  private async load(): Promise<StoredConfig> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoredConfig>
      return { version: 1, values: raw.values ?? {}, secrets: raw.secrets ?? {}, pgPassword: raw.pgPassword }
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') return { version: 1, values: {}, secrets: {} }
      throw e
    }
  }

  private async write(stored: StoredConfig): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(stored, null, 2), { mode: 0o600 })
    await rename(tmp, this.file)
  }

  /** A secret that cannot be decrypted (file from another device, keychain reset) reads as unset. */
  private open(stored: string | undefined): string {
    if (!stored) return ''
    try {
      return this.cipher.decrypt(stored)
    } catch {
      return ''
    }
  }

  private decode(stored: StoredConfig): DesktopConfig {
    const values = { ...empty(VALUE_KEYS), ...pick(stored.values, VALUE_KEYS) }
    const secrets = empty(SECRET_KEYS)
    for (const key of SECRET_KEYS) secrets[key] = this.open(stored.secrets[key])
    return { values, secrets, pgPassword: this.open(stored.pgPassword) }
  }

  async read(): Promise<DesktopConfig> {
    return this.decode(await this.load())
  }

  async save(patch: ConfigPatch): Promise<DesktopConfig> {
    const stored = await this.load()
    const next: StoredConfig = { ...stored, values: { ...stored.values, ...patch.values }, secrets: { ...stored.secrets } }
    for (const [key, value] of Object.entries(patch.secrets ?? {}) as [SecretKey, string][]) {
      if (value === '') delete next.secrets[key]
      else next.secrets[key] = this.cipher.encrypt(value)
    }
    await this.write(next)
    return this.decode(next)
  }

  async ensurePgPassword(): Promise<DesktopConfig> {
    const stored = await this.load()
    if (this.open(stored.pgPassword)) return this.decode(stored)
    const next = { ...stored, pgPassword: this.cipher.encrypt(randomBytes(24).toString('hex')) }
    await this.write(next)
    return this.decode(next)
  }
}

function pick<K extends string>(source: Partial<Record<string, string>>, keys: readonly K[]): Partial<Record<K, string>> {
  return Object.fromEntries(keys.filter((k) => typeof source[k] === 'string').map((k) => [k, source[k]])) as Partial<Record<K, string>>
}

function checkGroup<K extends string>(group: unknown, keys: readonly K[], name: string, check?: (key: K, value: string) => void): Partial<Record<K, string>> | undefined {
  if (group === undefined) return undefined
  if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error(`${name} must be an object`)
  const out: Partial<Record<K, string>> = {}
  for (const [key, value] of Object.entries(group)) {
    if (!(keys as readonly string[]).includes(key)) throw new Error(`Unknown setting "${key}"`)
    if (typeof value !== 'string' || value.length > MAX_LENGTH) throw new Error(`"${key}" must be text of at most ${MAX_LENGTH} characters`)
    check?.(key as K, value.trim())
    out[key as K] = value.trim()
  }
  return out
}

/** Validates what the renderer sends over IPC before it touches the config file. */
export function parsePatch(input: unknown): ConfigPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings')
  const raw = input as { values?: unknown; secrets?: unknown }
  const values = checkGroup(raw.values, VALUE_KEYS, 'values', (key, value) => {
    if (!value) return
    if (EFFORT_KEYS.has(key) && !['low', 'medium', 'high'].includes(value)) throw new Error(`"${key}" must be low, medium or high`)
    if (URL_KEYS.has(key) && !/^https?:\/\//i.test(value)) throw new Error(`"${key}" must be an http(s) URL`)
  })
  const secrets = checkGroup(raw.secrets, SECRET_KEYS, 'secrets')
  return { ...(values ? { values } : {}), ...(secrets ? { secrets } : {}) }
}

/** What the UI may see: every value, but only whether each secret is set. */
export function publicConfig(cfg: DesktopConfig): PublicConfig {
  const secretsSet = Object.fromEntries(SECRET_KEYS.map((k) => [k, cfg.secrets[k] !== ''])) as Record<SecretKey, boolean>
  return { configured: secretsSet.routerApiKey, values: cfg.values, secretsSet }
}

export interface Ports {
  postgres: number
  router: number
  server: number
}

/** The server's environment: the same variables .env provides in dev. Empty optional values are left out. */
export function buildServerEnv(cfg: DesktopConfig, paths: AppPaths, ports: Ports, appVersion: string): Record<string, string> {
  const v = cfg.values
  const s = cfg.secrets
  const optional: Record<string, string> = {
    ANTHROPIC_MODEL: v.aiModel,
    CHAT_EFFORT: v.chatEffort,
    GENERATE_EFFORT: v.generateEffort,
    OUTLINE_API_URL: v.outlineApiUrl,
    OUTLINE_API_KEY: s.outlineApiKey,
    DEMO_SUPABASE_URL: v.demoSupabaseUrl,
    DEMO_SUPABASE_KEY: s.demoSupabaseKey,
    DEMO_APP_URL: v.demoAppUrl,
    NOTION_TOKEN: s.notionToken,
    NOTION_PARENT_PAGE: v.notionParentPage,
  }
  return {
    DATABASE_URL: `postgres://postgres:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${ports.postgres}/sa_copilot`,
    PORT: String(ports.server),
    ANTHROPIC_BASE_URL: v.aiBaseUrl || `http://127.0.0.1:${ports.router}`,
    ANTHROPIC_API_KEY: s.routerApiKey,
    UPLOAD_DIR: paths.uploadDir,
    BACKUP_DIR: paths.backupDir,
    DOCS_DIR: v.docsDir || paths.defaultDocsDir,
    DECK_TEMPLATE: v.deckTemplate || paths.defaultDeckTemplate,
    DECK_SCRIPT: paths.deckScript,
    MARKITDOWN_PYTHON: paths.python,
    DIST_DIR: paths.distDir,
    SCHEMA_FILE: paths.schemaFile,
    OUTLINE_MCP_ENTRY: paths.outlineEntry,
    SA_APP_VERSION: appVersion,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== '')),
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run electron/config.test.ts && npx tsc -b`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit (if approved)**

```bash
git add electron/settings.ts electron/config.ts electron/config.test.ts
git commit -m "feat: desktop config store with encrypted secrets"
```

---

### Task 7: Services — Postgres, 9router, server

**Files:**
- Create: `electron/services/postgres.ts`, `electron/services/router9.ts`, `electron/services/server.ts`
- Test: `electron/services/router9.test.ts`, `electron/services/server.test.ts`

**Interfaces:**
- Consumes: `isStalePidFile`, `isProcessAlive`, `killTree` (Task 5).
- Produces:
  - `startPostgres(opts: { dir: string; port: number; password: string; log: (l: string) => void }): Promise<{ stop(): Promise<void> }>`.
  - `DEFAULT_ROUTER_PORT = 20128`, `findRunningRouter(port?: number, fetchFn?: typeof fetch): Promise<boolean>`, `routerLaunch(opts: { execPath: string; appDir: string; port: number; baseEnv: NodeJS.ProcessEnv }): { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }`, `startRouter(opts: { execPath: string; appDir: string; port: number; log: (l: string) => void }): Promise<{ port: number; external: boolean; stop(): Promise<void> }>`.
  - `waitForHealth(url: string, timeoutMs: number, fetchFn?: typeof fetch, intervalMs?: number): Promise<void>`, `class CrashPolicy { recordCrash(now: number): 'restart' | 'fatal' }`, `class ServerSupervisor { constructor(opts: { entry: string; execPath: string; log: (l: string) => void; onFatal: (message: string) => void }); start(env: Record<string, string>, healthUrl: string): Promise<void>; restart(env: Record<string, string>, healthUrl: string): Promise<void>; stop(): Promise<void> }`.

- [ ] **Step 1: Write failing tests**

`electron/services/router9.test.ts`:

```ts
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findRunningRouter, routerLaunch } from './router9.ts'

describe('findRunningRouter', () => {
  it('reuses anything answering /v1/models (even 401 without a key)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    expect(await findRunningRouter(20128, fetchFn)).toBe(true)
    expect(fetchFn.mock.calls[0][0]).toBe('http://127.0.0.1:20128/v1/models')
  })
  it('reports no router when nothing answers', async () => {
    expect(await findRunningRouter(20128, vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))).toBe(false)
  })
})

describe('routerLaunch', () => {
  it('runs the bundled Next server with the app runtime, local-only, with its node_modules on NODE_PATH', () => {
    const run = routerLaunch({ execPath: '/A/SA Copilot', appDir: '/A/app/node_modules/9router/app', port: 51000, baseEnv: { PATH: '/bin' } })
    expect(run.command).toBe('/A/SA Copilot')
    expect(run.args).toEqual(['--dns-result-order=ipv4first', path.join('/A/app/node_modules/9router/app', 'server.js')])
    expect(run.cwd).toBe('/A/app/node_modules/9router/app')
    expect(run.env).toMatchObject({ PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', PORT: '51000', HOSTNAME: '127.0.0.1', NODE_PATH: path.join('/A/app/node_modules/9router/app', 'node_modules') })
  })
})
```

`electron/services/server.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { CrashPolicy, waitForHealth } from './server.ts'

describe('waitForHealth', () => {
  it('resolves once the server answers 200', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    await waitForHealth('http://127.0.0.1:1/api/projects', 2000, fetchFn, 10)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('fails with the last error after the timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(waitForHealth('http://127.0.0.1:1/api/projects', 50, fetchFn, 10)).rejects.toThrow(/did not become ready.*ECONNREFUSED/)
  })
})

describe('CrashPolicy', () => {
  it('restarts after the first crash and gives up on a second one within 5 minutes', () => {
    const policy = new CrashPolicy()
    expect(policy.recordCrash(0)).toBe('restart')
    expect(policy.recordCrash(60_000)).toBe('fatal')
  })
  it('restarts again when the last crash was long ago', () => {
    const policy = new CrashPolicy()
    expect(policy.recordCrash(0)).toBe('restart')
    expect(policy.recordCrash(10 * 60_000)).toBe('restart')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run electron/services`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`electron/services/postgres.ts`:

```ts
// Embedded PostgreSQL (binaries from the embedded-postgres npm packages) in <data>/pg.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import { isProcessAlive, isStalePidFile } from '../processes.ts'

export async function startPostgres(opts: { dir: string; port: number; password: string; log: (l: string) => void }): Promise<{ stop(): Promise<void> }> {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    user: 'postgres',
    password: opts.password,
    port: opts.port,
    persistent: true,
    onLog: (m) => opts.log(String(m)),
    onError: (e) => opts.log(`ERROR ${String(e)}`),
  })
  if (!existsSync(path.join(opts.dir, 'PG_VERSION'))) {
    opts.log('initialising a new database cluster')
    await pg.initialise()
  } else {
    // A crash can leave postmaster.pid behind; Postgres refuses to start while it exists.
    const pidFile = path.join(opts.dir, 'postmaster.pid')
    if (existsSync(pidFile) && isStalePidFile(readFileSync(pidFile, 'utf8'), isProcessAlive)) {
      opts.log('removing stale postmaster.pid')
      rmSync(pidFile)
    }
  }
  await pg.start()
  return { stop: () => pg.stop() }
}
```

`electron/services/router9.ts`:

```ts
// 9router: reuse one already running on the device (its default port), else run the bundled copy on a free port.
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { killTree } from '../processes.ts'

export const DEFAULT_ROUTER_PORT = 20128
const START_TIMEOUT_MS = 60_000

/** Any HTTP answer from /v1/models means a 9router is there (401 just means we sent no key). */
export async function findRunningRouter(port = DEFAULT_ROUTER_PORT, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    await fetchFn(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

export function routerLaunch(opts: { execPath: string; appDir: string; port: number; baseEnv: NodeJS.ProcessEnv }) {
  return {
    command: opts.execPath,
    args: ['--dns-result-order=ipv4first', path.join(opts.appDir, 'server.js')],
    cwd: opts.appDir,
    env: {
      ...opts.baseEnv,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(opts.port),
      HOSTNAME: '127.0.0.1',
      // sql.js ships inside 9router's own node_modules; no runtime npm install is needed.
      NODE_PATH: path.join(opts.appDir, 'node_modules'),
    },
  }
}

export async function startRouter(opts: { execPath: string; appDir: string; port: number; log: (l: string) => void }): Promise<{ port: number; external: boolean; stop(): Promise<void> }> {
  if (await findRunningRouter(DEFAULT_ROUTER_PORT)) {
    opts.log(`reusing the 9router already running on ${DEFAULT_ROUTER_PORT}`)
    return { port: DEFAULT_ROUTER_PORT, external: true, stop: async () => {} }
  }
  const run = routerLaunch({ ...opts, baseEnv: process.env })
  const child: ChildProcess = spawn(run.command, run.args, { cwd: run.cwd, env: run.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.on('data', (d) => opts.log(String(d)))
  child.stderr?.on('data', (d) => opts.log(String(d)))
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))

  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`9router exited during start (code ${child.exitCode}) — see 9router.log`)
    if (await findRunningRouter(opts.port)) {
      return {
        port: opts.port,
        external: false,
        stop: async () => {
          if (child.pid && child.exitCode === null) await killTree(child.pid)
          await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))])
        },
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (child.pid) await killTree(child.pid)
  throw new Error('9router did not start within 60 seconds — see 9router.log')
}
```

`electron/services/server.ts`:

```ts
// The SA Copilot server (server-dist/index.mjs) as a child process: start, health check, restart, crash policy.
import { spawn, type ChildProcess } from 'node:child_process'
import { killTree } from '../processes.ts'

const START_TIMEOUT_MS = 90_000
const CRASH_WINDOW_MS = 5 * 60_000

export async function waitForHealth(url: string, timeoutMs: number, fetchFn: typeof fetch = fetch, intervalMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  for (;;) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(3000) })
      if (res.status === 200) return
      last = `HTTP ${res.status}`
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
    if (Date.now() + intervalMs > deadline) throw new Error(`SA Copilot server did not become ready: ${last}`)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/** One automatic restart; a second crash within 5 minutes is fatal. */
export class CrashPolicy {
  private lastCrash: number | null = null

  recordCrash(now: number): 'restart' | 'fatal' {
    const recent = this.lastCrash !== null && now - this.lastCrash < CRASH_WINDOW_MS
    this.lastCrash = now
    return recent ? 'fatal' : 'restart'
  }
}

export class ServerSupervisor {
  private child: ChildProcess | null = null
  private stopping = false
  private readonly policy = new CrashPolicy()
  private env: Record<string, string> = {}
  private healthUrl = ''

  constructor(private readonly opts: { entry: string; execPath: string; log: (l: string) => void; onFatal: (message: string) => void }) {}

  private spawnChild(): void {
    const child = spawn(this.opts.execPath, [this.opts.entry], {
      env: { ...process.env, ...this.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (d) => this.opts.log(String(d)))
    child.stderr?.on('data', (d) => this.opts.log(String(d)))
    child.once('exit', (code) => {
      if (this.child !== child || this.stopping) return
      this.opts.log(`server exited unexpectedly (code ${code})`)
      if (this.policy.recordCrash(Date.now()) === 'fatal') {
        this.opts.onFatal('The SA Copilot server stopped twice in a few minutes.')
        return
      }
      this.spawnChild()
      waitForHealth(this.healthUrl, START_TIMEOUT_MS).catch((e) => this.opts.onFatal(e instanceof Error ? e.message : String(e)))
    })
    this.child = child
  }

  async start(env: Record<string, string>, healthUrl: string): Promise<void> {
    this.env = env
    this.healthUrl = healthUrl
    this.stopping = false
    this.spawnChild()
    await waitForHealth(healthUrl, START_TIMEOUT_MS)
  }

  async restart(env: Record<string, string>, healthUrl: string): Promise<void> {
    await this.stop()
    await this.start(env, healthUrl)
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.child = null
    if (!child?.pid || child.exitCode !== null) return
    const exited = new Promise((r) => child.once('exit', r))
    await killTree(child.pid)
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))])
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run electron && npx tsc -b`
Expected: PASS (router9 3, server 4, plus earlier electron tests).

- [ ] **Step 5: Commit (if approved)**

```bash
git add electron/services
git commit -m "feat: postgres, 9router and server services for the desktop app"
```

---

### Task 8: Main process, preload, splash

**Files:**
- Create: `electron/main.ts`, `electron/preload.ts`, `electron/splash.html`, `electron/bridge.ts`, `scripts/bundle.mjs`
- Modify: `package.json` (`main`, `version`, `bundle` + `desktop` scripts)

**Interfaces:**
- Consumes: everything from Tasks 5–7.
- Produces: IPC channels `config:get` → `DesktopStatus`, `config:save(patch)` → `DesktopStatus`, `router:restart` → `DesktopStatus`, `shell:open-external(url)`, `app:open-logs`, `splash:action('retry'|'logs'|'quit')`; `window.saDesktop: DesktopBridge` where (in `electron/bridge.ts`, shared by preload and renderer types) `DesktopStatus = PublicConfig & { routerDashboardUrl: string; routerExternal: boolean; dataDir: string; version: string }` and `DesktopBridge { getConfig(): Promise<DesktopStatus>; saveConfig(patch: ConfigPatch): Promise<DesktopStatus>; restartRouter(): Promise<DesktopStatus>; openExternal(url: string): Promise<void>; openLogs(): Promise<void>; splashAction(action: 'retry' | 'logs' | 'quit'): void }`. Env `SA_COPILOT_DATA_DIR` overrides the data folder; `SA_COPILOT_SMOKE=1` writes `<data>/logs/ready.json` (`{ server: number }`) when ready and quits 3 s later.

- [ ] **Step 1: `electron/bridge.ts`** (types only)

```ts
// The window.saDesktop API: shared between the preload script and the React app's types (no Node imports).
import type { ConfigPatch, PublicConfig } from './settings.ts'

export type DesktopStatus = PublicConfig & { routerDashboardUrl: string; routerExternal: boolean; dataDir: string; version: string }

export interface DesktopBridge {
  getConfig(): Promise<DesktopStatus>
  saveConfig(patch: ConfigPatch): Promise<DesktopStatus>
  restartRouter(): Promise<DesktopStatus>
  openExternal(url: string): Promise<void>
  openLogs(): Promise<void>
  splashAction(action: 'retry' | 'logs' | 'quit'): void
}
```

- [ ] **Step 2: `electron/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from './bridge.ts'

const bridge: DesktopBridge = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  restartRouter: () => ipcRenderer.invoke('router:restart'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  splashAction: (action) => ipcRenderer.send('splash:action', action),
}

contextBridge.exposeInMainWorld('saDesktop', bridge)
```

- [ ] **Step 3: `electron/splash.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <title>SA Copilot</title>
    <style>
      body { margin: 0; height: 100vh; display: grid; place-items: center; font-family: 'Segoe UI', -apple-system, sans-serif; background: #f3efe6; color: #1f2a24; }
      main { width: 380px; text-align: center; }
      h1 { font-size: 22px; margin: 0 0 16px; }
      #status { color: #6b6f68; font-size: 14px; min-height: 20px; }
      #error { display: none; text-align: left; background: #fdecea; border: 1px solid #f3b8b0; border-radius: 8px; padding: 12px; font-size: 13px; white-space: pre-wrap; margin-top: 16px; }
      #actions { display: none; gap: 8px; justify-content: center; margin-top: 12px; }
      button { border: 1px solid #1f3b34; background: #fff; color: #1f3b34; border-radius: 6px; padding: 6px 14px; cursor: pointer; }
      button.primary { background: #1f3b34; color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <h1>SA Copilot</h1>
      <p id="status">Starting…</p>
      <div id="error"></div>
      <div id="actions">
        <button class="primary" onclick="saDesktop.splashAction('retry')">Retry</button>
        <button onclick="saDesktop.splashAction('logs')">Open logs</button>
        <button onclick="saDesktop.splashAction('quit')">Quit</button>
      </div>
    </main>
    <script>
      function setStatus(text) {
        document.getElementById('status').textContent = text
        document.getElementById('error').style.display = 'none'
        document.getElementById('actions').style.display = 'none'
      }
      function showError(text) {
        document.getElementById('status').textContent = 'SA Copilot could not start'
        const box = document.getElementById('error')
        box.textContent = text
        box.style.display = 'block'
        document.getElementById('actions').style.display = 'flex'
      }
    </script>
  </body>
</html>
```

- [ ] **Step 4: `electron/main.ts`**

```ts
// SA Copilot desktop: starts Postgres → 9router → server, shows the UI, and shuts everything down on quit.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import type { DesktopStatus } from './bridge.ts'
import { buildServerEnv, ConfigStore, parsePatch, publicConfig, type Cipher, type DesktopConfig, type Ports } from './config.ts'
import { resolvePaths } from './paths.ts'
import { freePort } from './ports.ts'
import { createLogger } from './processes.ts'
import { startPostgres } from './services/postgres.ts'
import { startRouter } from './services/router9.ts'
import { ServerSupervisor } from './services/server.ts'

if (process.env.SA_COPILOT_DATA_DIR) app.setPath('userData', path.resolve(process.env.SA_COPILOT_DATA_DIR))
if (!app.requestSingleInstanceLock()) app.quit()

const paths = resolvePaths({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  platform: process.platform,
})
mkdirSync(paths.logsDir, { recursive: true })
const logMain = createLogger(paths.logsDir, 'main')

const cipher: Cipher = {
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
}
const store = new ConfigStore(paths.configFile, cipher)

let splash: BrowserWindow | null = null
let win: BrowserWindow | null = null
let cfg: DesktopConfig
const ports: Ports = { postgres: 0, router: 0, server: 0 }
let postgres: { stop(): Promise<void> } | null = null
let router: { port: number; external: boolean; stop(): Promise<void> } | null = null
let quitting = false

const supervisor = new ServerSupervisor({
  entry: paths.serverEntry,
  execPath: process.execPath,
  log: createLogger(paths.logsDir, 'server'),
  onFatal: (message) => showFatal(message),
})

const serverUrl = () => `http://127.0.0.1:${ports.server}`
const healthUrl = () => `${serverUrl()}/api/projects`

function secureWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const w = new BrowserWindow({
    ...options,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(serverUrl())) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl())) event.preventDefault()
  })
  return w
}

function setStatus(text: string) {
  logMain(text)
  void splash?.webContents.executeJavaScript(`setStatus(${JSON.stringify(text)})`).catch(() => {})
}

function showFatal(message: string) {
  logMain(`FATAL ${message}`)
  if (!splash || splash.isDestroyed()) {
    splash = secureWindow({ width: 460, height: 360, resizable: false, title: 'SA Copilot' })
    void splash.loadFile(path.join(import.meta.dirname, 'splash.html'))
    splash.webContents.once('did-finish-load', () => void splash?.webContents.executeJavaScript(`showError(${JSON.stringify(message)})`))
    return
  }
  void splash.webContents.executeJavaScript(`showError(${JSON.stringify(message)})`).catch(() => {})
}

async function startServices(): Promise<void> {
  cfg = await store.ensurePgPassword()

  setStatus('Menyiapkan database…')
  if (!postgres) {
    ports.postgres = await freePort()
    postgres = await startPostgres({ dir: paths.pgDir, port: ports.postgres, password: cfg.pgPassword, log: createLogger(paths.logsDir, 'postgres') })
  }

  setStatus('Menjalankan AI router…')
  if (!router) {
    try {
      router = await startRouter({ execPath: process.execPath, appDir: paths.routerAppDir, port: await freePort(), log: createLogger(paths.logsDir, '9router') })
    } catch (e) {
      // The app still works without AI; Settings → Connections can restart the router.
      logMain(`9router failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  ports.router = router?.port ?? 0

  setStatus('Menjalankan SA Copilot…')
  if (!ports.server) ports.server = await freePort()
  await supervisor.start(buildServerEnv(cfg, paths, ports, app.getVersion()), healthUrl())
}

async function boot(): Promise<void> {
  splash ??= secureWindow({ width: 460, height: 360, resizable: false, title: 'SA Copilot' })
  if (!splash.webContents.getURL()) await splash.loadFile(path.join(import.meta.dirname, 'splash.html'))
  try {
    await startServices()
  } catch (e) {
    showFatal(e instanceof Error ? e.message : String(e))
    return
  }
  win = secureWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 700, title: 'SA Copilot', show: false })
  win.once('ready-to-show', () => {
    win?.show()
    splash?.destroy()
    splash = null
  })
  await win.loadURL(`${serverUrl()}/`)

  if (process.env.SA_COPILOT_SMOKE === '1') {
    writeFileSync(path.join(paths.logsDir, 'ready.json'), JSON.stringify({ server: ports.server }))
    setTimeout(() => app.quit(), 3000)
  }
}

async function status(): Promise<DesktopStatus> {
  return {
    ...publicConfig(cfg),
    routerDashboardUrl: ports.router ? `http://127.0.0.1:${ports.router}/dashboard` : '',
    routerExternal: router?.external ?? false,
    dataDir: paths.dataDir,
    version: app.getVersion(),
  }
}

ipcMain.handle('config:get', () => status())
ipcMain.handle('config:save', async (_e, input: unknown) => {
  cfg = await store.save(parsePatch(input))
  await supervisor.restart(buildServerEnv(cfg, paths, ports, app.getVersion()), healthUrl())
  return status()
})
ipcMain.handle('router:restart', async () => {
  await router?.stop()
  router = null
  router = await startRouter({ execPath: process.execPath, appDir: paths.routerAppDir, port: await freePort(), log: createLogger(paths.logsDir, '9router') })
  ports.router = router.port
  await supervisor.restart(buildServerEnv(cfg, paths, ports, app.getVersion()), healthUrl())
  return status()
})
ipcMain.handle('shell:open-external', async (_e, url: unknown) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened')
  await shell.openExternal(url)
})
ipcMain.handle('app:open-logs', async () => {
  await shell.openPath(paths.logsDir)
})
ipcMain.on('splash:action', (_e, action: unknown) => {
  if (action === 'retry') void boot()
  else if (action === 'logs') void shell.openPath(paths.logsDir)
  else if (action === 'quit') app.quit()
})

app.on('second-instance', () => {
  const target = win ?? splash
  if (target) {
    if (target.isMinimized()) target.restore()
    target.focus()
  }
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void (async () => {
    logMain('shutting down')
    await supervisor.stop().catch((e) => logMain(`server stop: ${e}`))
    await router?.stop().catch((e) => logMain(`9router stop: ${e}`))
    await postgres?.stop().catch((e) => logMain(`postgres stop: ${e}`))
    app.exit(0)
  })()
})

void app.whenReady().then(boot)
```

- [ ] **Step 5: `scripts/bundle.mjs` and package.json**

```js
// Bundles the server and the Electron main/preload with esbuild. node_modules stay external (shipped as-is).
import { cpSync, mkdirSync } from 'node:fs'
import { build } from 'esbuild'

const node = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, logLevel: 'info' }

await build({
  ...node,
  packages: 'external',
  entryPoints: ['server/index.ts'],
  outfile: 'server-dist/index.mjs',
  format: 'esm',
  // Some dependencies still use require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
})
await build({ ...node, packages: 'external', entryPoints: ['electron/main.ts'], outfile: 'electron-dist/main.mjs', format: 'esm', external: ['electron'] })
// The preload runs sandboxed: CommonJS, and it only imports electron.
await build({ ...node, entryPoints: ['electron/preload.ts'], outfile: 'electron-dist/preload.cjs', format: 'cjs', external: ['electron'] })
mkdirSync('electron-dist', { recursive: true })
cpSync('electron/splash.html', 'electron-dist/splash.html')
```

In `package.json` set `"version": "1.0.0"`, add `"main": "electron-dist/main.mjs"`, `"description": "SA Copilot — presales Solution Architect copilot"`, `"author": "Christian Gunawan"`, and scripts:

```json
"bundle": "node scripts/bundle.mjs",
"desktop": "npm run build && node scripts/bundle.mjs && electron ."
```

- [ ] **Step 6: Run the desktop app from the repo**

Run: `npx tsc -b && npm run desktop`
Expected: splash → "Menyiapkan database…" → "Menjalankan AI router…" (reuses the 9router already running on 20128 on this laptop) → main window with the app. Because `config.json` has no router key yet, the app shows the normal UI (Setup gate comes in Task 9) and AI calls fail with 401. Close the window → within ~10 s `Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*embedded-postgres*' }` returns nothing.

- [ ] **Step 7: Commit (if approved)**

```bash
git add electron/main.ts electron/preload.ts electron/splash.html electron/bridge.ts scripts/bundle.mjs package.json
git commit -m "feat: electron main process with splash, IPC bridge and graceful shutdown"
```

---

### Task 9: Setup screen & Settings → Connections

**Files:**
- Create: `src/lib/desktop.ts`, `src/components/ConnectionsForm.tsx`, `src/pages/SetupPage.tsx`, `src/pages/settings/ConnectionsSettings.tsx`
- Modify: `src/App.tsx`, `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `window.saDesktop: DesktopBridge`, `DesktopStatus` (Task 8); `ConfigPatch`, `SecretKey`, `ValueKey` from `electron/settings.ts` (Task 6); `GET /api/ai/models` (existing, returns `{ models, selected }` or `{ error }`).
- Produces: `desktop: DesktopBridge | undefined` from `src/lib/desktop.ts`; Settings tab id `'connections'` (only in the desktop app); `<SetupPage onDone={() => void} />`.

- [ ] **Step 1: `src/lib/desktop.ts`**

```ts
// The desktop app's bridge (electron/preload.ts). Undefined in the browser / dev server, where .env is used.
import type { DesktopBridge } from '../../electron/bridge.ts'

export type { DesktopBridge, DesktopStatus } from '../../electron/bridge.ts'
export type { ConfigPatch, SecretKey, ValueKey } from '../../electron/settings.ts'

export const desktop: DesktopBridge | undefined = (window as { saDesktop?: DesktopBridge }).saDesktop
```

(Only `electron/bridge.ts` and `electron/settings.ts` are imported, and only as types — neither imports Node modules, so the app's `tsconfig.app.json` typechecks them without Node types.)

- [ ] **Step 2: `src/components/ConnectionsForm.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileText, PlugZap, RotateCw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { desktop, type ConfigPatch, type DesktopStatus, type SecretKey, type ValueKey } from '../lib/desktop'
import { Button, ErrorNote, Field, Input, Select } from './ui'

type Section = { title: string; fields: ({ kind: 'value'; key: ValueKey; label: string; placeholder?: string; hint?: string; effort?: boolean } | { kind: 'secret'; key: SecretKey; label: string; hint?: string })[] }

const SECTIONS: Section[] = [
  {
    title: 'AI',
    fields: [
      { kind: 'secret', key: 'routerApiKey', label: '9router API key (required)', hint: 'Create it in the 9router dashboard → API keys.' },
      { kind: 'value', key: 'aiBaseUrl', label: 'AI endpoint', placeholder: 'Empty = the 9router bundled with SA Copilot', hint: 'Another 9router, or https://api.anthropic.com to call Claude directly (then the key above is your Anthropic key).' },
      { kind: 'value', key: 'aiModel', label: 'Default model', placeholder: 'cc/claude-opus-5-5' },
      { kind: 'value', key: 'chatEffort', label: 'Chat effort', effort: true },
      { kind: 'value', key: 'generateEffort', label: 'Drafting effort', effort: true },
    ],
  },
  {
    title: 'Outline wiki',
    fields: [
      { kind: 'value', key: 'outlineApiUrl', label: 'Outline API URL', placeholder: 'https://wiki.cekat.ai/api' },
      { kind: 'secret', key: 'outlineApiKey', label: 'Outline API key' },
    ],
  },
  {
    title: 'Healthcare demo app',
    fields: [
      { kind: 'value', key: 'demoAppUrl', label: 'Demo app URL', placeholder: 'https://healthcare-demo-cekat.vercel.app/' },
      { kind: 'value', key: 'demoSupabaseUrl', label: 'Supabase REST URL', placeholder: 'https://<ref>.supabase.co/rest/v1' },
      { kind: 'secret', key: 'demoSupabaseKey', label: 'Supabase key' },
    ],
  },
  {
    title: 'Notion',
    fields: [
      { kind: 'secret', key: 'notionToken', label: 'Internal Integration Secret' },
      { kind: 'value', key: 'notionParentPage', label: 'Parent page link', placeholder: 'https://www.notion.so/…' },
    ],
  },
  {
    title: 'Folders',
    fields: [
      { kind: 'value', key: 'docsDir', label: 'Export folder', placeholder: 'Empty = Documents/SA Copilot' },
      { kind: 'value', key: 'deckTemplate', label: 'Pitch deck template (.pptx)', placeholder: 'Empty = bundled template' },
    ],
  },
]

/** Every former .env setting. Secrets are write-only: the field shows whether one is saved, never its value. */
export function ConnectionsForm({ requiredOnly = false, onSaved }: { requiredOnly?: boolean; onSaved?: (s: DesktopStatus) => void }) {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['desktop-config'], queryFn: () => desktop!.getConfig(), enabled: !!desktop })
  const [values, setValues] = useState<Partial<Record<ValueKey, string>>>({})
  const [secrets, setSecrets] = useState<Partial<Record<SecretKey, string>>>({})

  useEffect(() => {
    if (status.data) setValues(status.data.values)
  }, [status.data])

  const save = useMutation({
    mutationFn: () => {
      const patch: ConfigPatch = { values, secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== undefined)) }
      return desktop!.saveConfig(patch)
    },
    onSuccess: (s) => {
      setSecrets({})
      qc.setQueryData(['desktop-config'], s)
      void qc.invalidateQueries()
      onSaved?.(s)
    },
  })
  const test = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/models')
      const body = (await res.json()) as { models?: unknown[]; selected?: string; error?: string }
      if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`)
      return `${body.models?.length ?? 0} models available — selected ${body.selected}`
    },
  })
  const restartRouter = useMutation({
    mutationFn: () => desktop!.restartRouter(),
    onSuccess: (s) => qc.setQueryData(['desktop-config'], s),
  })

  if (!desktop) return null
  if (!status.data) return <ErrorNote error={status.error} />
  const s = status.data
  const sections = requiredOnly ? SECTIONS.slice(0, 1) : SECTIONS

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <fieldset key={section.title} className="space-y-3 rounded-lg border border-line bg-panel p-4">
          <legend className="px-1 font-display text-base font-semibold">{section.title}</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {section.fields.map((f) =>
              f.kind === 'secret' ? (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={secrets[f.key] ?? ''}
                    placeholder={s.secretsSet[f.key] ? '•••••• saved — type to replace' : 'Not set'}
                    onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                  />
                  {s.secretsSet[f.key] && !requiredOnly && (
                    <button type="button" className="text-xs text-bad hover:underline" onClick={() => setSecrets({ ...secrets, [f.key]: '' })}>
                      Remove saved key on save
                    </button>
                  )}
                </Field>
              ) : f.effort ? (
                <Field key={f.key} label={f.label}>
                  <Select value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                    <option value="">Default</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </Field>
              ) : (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                </Field>
              ),
            )}
          </div>
          {section.title === 'AI' && (
            <div className="flex flex-wrap gap-2">
              {s.routerDashboardUrl && (
                <Button variant="outline" icon={<ExternalLink className="size-4" />} onClick={() => void desktop!.openExternal(s.routerDashboardUrl)}>
                  Open 9router dashboard
                </Button>
              )}
              <Button variant="outline" icon={<PlugZap className="size-4" />} loading={test.isPending} onClick={() => test.mutate()}>
                Test connection
              </Button>
              {!requiredOnly && (
                <Button variant="ghost" icon={<RotateCw className="size-4" />} loading={restartRouter.isPending} onClick={() => restartRouter.mutate()}>
                  Restart AI router
                </Button>
              )}
              {test.data && <p className="w-full text-sm text-ok">{test.data}</p>}
              <ErrorNote error={test.error ?? restartRouter.error} />
            </div>
          )}
        </fieldset>
      ))}
      <ErrorNote error={save.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<Save className="size-4" />} loading={save.isPending} disabled={requiredOnly && !s.secretsSet.routerApiKey && !secrets.routerApiKey} onClick={() => save.mutate()}>
          {requiredOnly ? 'Save and continue' : 'Save'}
        </Button>
        <span className="text-xs text-muted">Saving restarts the SA Copilot server (a few seconds).</span>
        {!requiredOnly && (
          <Button variant="ghost" icon={<FileText className="size-4" />} onClick={() => void desktop!.openLogs()}>
            Open logs
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `src/pages/SetupPage.tsx`**

```tsx
import { ConnectionsForm } from '../components/ConnectionsForm'

/** First run of the desktop app: the only required setting is the 9router API key. Everything else lives in Settings → Connections. */
export function SetupPage({ onDone }: { onDone: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-ember">Welcome</p>
        <h1 className="font-display text-3xl font-semibold">Set up SA Copilot</h1>
        <p className="text-sm text-muted">
          Open the 9router dashboard, sign in to your AI provider, create an API key and paste it below. Outline, Notion, the demo app and folders can be set
          later in Settings → Connections.
        </p>
      </header>
      <ConnectionsForm requiredOnly onSaved={(s) => s.configured && onDone()} />
    </div>
  )
}
```

- [ ] **Step 4: `src/pages/settings/ConnectionsSettings.tsx`**

```tsx
import { ConnectionsForm } from '../../components/ConnectionsForm'

export function ConnectionsSettings() {
  return <ConnectionsForm />
}
```

- [ ] **Step 5: Gate the app and register the tab**

`src/App.tsx` — add imports `useQuery` (from `@tanstack/react-query`), `desktop` (from `./lib/desktop`), `SetupPage` (from `./pages/SetupPage`); inside `App()` after `const qc = useQueryClient()`:

```tsx
  const setup = useQuery({ queryKey: ['desktop-config'], queryFn: () => desktop!.getConfig(), enabled: !!desktop })
```

and before `return (`:

```tsx
  if (desktop && setup.data && !setup.data.configured) return <SetupPage onDone={() => void setup.refetch()} />
```

`src/pages/SettingsPage.tsx` — add `KeyRound` to the lucide import, `import { desktop } from '../lib/desktop'`, `import { ConnectionsSettings } from './settings/ConnectionsSettings'`; add a tab entry right after `deliverables`:

```ts
  {
    id: 'connections',
    label: 'Connections',
    icon: KeyRound,
    intro: 'Every setting that used to live in .env — AI key and endpoint, model, Outline, Notion, the demo app and folders. Saving applies it immediately.',
  },
```

filter the rendered tabs with `TABS.filter((t) => t.id !== 'connections' || desktop)` both in the nav and in `const current = …find(...)`, and add `case 'connections': return <ConnectionsSettings />` to `TabContent`.

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npx oxlint src && npm run desktop`
Expected: first start shows **Set up SA Copilot**; paste the 9router key from `.env` (`ANTHROPIC_API_KEY`) → Save and continue → app opens; **Test connection** in Settings → Connections shows "N models available". `config.json` in `%APPDATA%\SA Copilot\` contains no plaintext key (`Select-String -Path "$env:APPDATA\SA Copilot\config.json" -Pattern 'sk-'` returns nothing). In the browser (`npm run serve`, `localhost:3000/settings`) the Connections tab is absent.

- [ ] **Step 7: Commit (if approved)**

```bash
git add src/lib/desktop.ts src/components/ConnectionsForm.tsx src/pages/SetupPage.tsx src/pages/settings/ConnectionsSettings.tsx src/App.tsx src/pages/SettingsPage.tsx
git commit -m "feat: desktop Setup screen and Settings → Connections"
```

---

### Task 10: Build pipeline & docs

**Files:**
- Create: `scripts/fetch-python.mjs`, `scripts/mac-cross-deps.mjs`, `electron-builder.yml`, `docs/BUILD.md`, `build/icon.png`, `build/icon.ico`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: all previous tasks.
- Produces: `npm run dist:win` → `release/SA Copilot Setup 1.0.0.exe`; `npm run dist:mac` → `release/SA Copilot-1.0.0-arm64.dmg`, `release/SA Copilot-1.0.0-x64.dmg`; `build/python/<win|mac>-<x64|arm64>/` portable Python with packages; `build/templates/deck.pptx`.

- [ ] **Step 1: `scripts/fetch-python.mjs`**

```js
// Portable CPython (python-build-standalone) for one target, with markitdown + python-pptx installed,
// into build/python/<os>-<arch>/. Also copies the pitch deck template into build/templates/.
// Usage: node --env-file-if-exists=.env scripts/fetch-python.mjs <win|mac> <x64|arm64>
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [os, arch] = process.argv.slice(2)
const TRIPLES = { 'win-x64': 'x86_64-pc-windows-msvc', 'mac-arm64': 'aarch64-apple-darwin', 'mac-x64': 'x86_64-apple-darwin' }
const triple = TRIPLES[`${os}-${arch}`]
if (!triple) throw new Error('Usage: fetch-python.mjs <win|mac> <x64|arm64> (win supports x64 only)')
if ((os === 'win') !== (process.platform === 'win32')) throw new Error(`Build the ${os} Python on ${os === 'win' ? 'Windows' : 'macOS'}`)

const PACKAGES = ['markitdown[pdf,docx,pptx,xlsx,xls,outlook]==0.1.7', 'python-pptx==1.0.2']
const dest = path.join('build', 'python', `${os}-${arch}`)
const stamp = path.join(dest, '.complete')
const spec = JSON.stringify({ triple, PACKAGES })

if (existsSync(stamp) && readFileSync(stamp, 'utf8').startsWith(spec)) {
  console.log(`Python for ${os}-${arch} is up to date`)
} else {
  const release = await (await fetch('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest', { headers: { 'User-Agent': 'sa-copilot-build' } })).json()
  const asset = release.assets.find((a) => a.name.startsWith('cpython-3.12.') && a.name.endsWith(`-${triple}-install_only_stripped.tar.gz`))
  if (!asset) throw new Error(`No CPython 3.12 build for ${triple} in ${release.tag_name}`)
  mkdirSync(path.join('build', 'cache'), { recursive: true })
  const archive = path.join('build', 'cache', asset.name)
  if (!existsSync(archive)) {
    console.log(`Downloading ${asset.name}`)
    writeFileSync(archive, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
  }
  const tmp = `${dest}-tmp`
  rmSync(tmp, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' })
  renameSync(path.join(tmp, 'python'), dest)
  rmSync(tmp, { recursive: true, force: true })

  const py = os === 'win' ? path.join(dest, 'python.exe') : path.join(dest, 'bin', 'python3')
  // On an Apple Silicon Mac the x64 interpreter runs under Rosetta, so pip picks x86_64 wheels.
  const run = os === 'mac' && arch === 'x64' && process.arch === 'arm64' ? ['arch', ['-x86_64', py]] : [py, []]
  execFileSync(run[0], [...run[1], '-m', 'pip', 'install', '--no-warn-script-location', '--disable-pip-version-check', ...PACKAGES], { stdio: 'inherit' })
  const freeze = execFileSync(run[0], [...run[1], '-m', 'pip', 'freeze'], { encoding: 'utf8' })
  writeFileSync(stamp, `${spec}\n${release.tag_name}\n${freeze}`)
  console.log(`Python ready in ${dest}`)
}

mkdirSync(path.join('build', 'templates'), { recursive: true })
const template = process.env.DECK_TEMPLATE
if (template && existsSync(template)) {
  copyFileSync(template, path.join('build', 'templates', 'deck.pptx'))
  console.log(`Deck template: ${template}`)
} else {
  console.warn('DECK_TEMPLATE not found — installers will ask for a template path in Settings → Connections')
}
```

- [ ] **Step 2: `scripts/mac-cross-deps.mjs`**

```js
// The Mac builds both arm64 and x64; npm only installed native packages for this Mac's arch. Add the other one.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (process.platform !== 'darwin') throw new Error('Run on macOS')
const optional = (pkg) => JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).optionalDependencies ?? {}
const wanted = []
for (const [owner, prefix] of [['embedded-postgres', '@embedded-postgres/darwin-'], ['@resvg/resvg-js', '@resvg/resvg-js-darwin-']]) {
  for (const [name, version] of Object.entries(optional(owner))) if (name.startsWith(prefix)) wanted.push(`${name}@${version}`)
}
console.log(`Installing ${wanted.join(', ')}`)
execFileSync('npm', ['install', '--no-save', '--force', ...wanted], { stdio: 'inherit' })
```

- [ ] **Step 3: `electron-builder.yml`**

```yaml
appId: ai.cekat.sacopilot
productName: SA Copilot
copyright: Copyright © 2026 Christian Gunawan
directories:
  output: release
  buildResources: build
# Unpacked: embedded Postgres, 9router and Python are real executables/folders that child processes run.
asar: false
files:
  - package.json
  - electron-dist/**
  - server-dist/**
  - dist/**
  - db/schema.sql
  - "!**/*.map"
extraResources:
  - from: build/python/${os}-${arch}
    to: python
  - from: build/templates
    to: templates
  - from: server/deck/build_deck.py
    to: deck/build_deck.py
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
  artifactName: ${productName} Setup ${version}.${ext}
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  category: public.app-category.productivity
  icon: build/icon.png
  # Ad-hoc signature only (no Apple Developer account); see docs/BUILD.md for opening it.
  identity: "-"
dmg:
  artifactName: ${productName}-${version}-${arch}.${ext}
```

- [ ] **Step 4: Icons and scripts**

```bash
mkdir -p build && cp assets/SACopilot.ico build/icon.ico && cp public/app-icon.png build/icon.png
node -e "const b=require('fs').readFileSync('build/icon.png');console.log('png',b.readUInt32BE(16)+'x'+b.readUInt32BE(20))"
```

Expected: PNG at least `512x512`. If smaller, export a 1024×1024 version of the app icon to `build/icon.png` before building for macOS.

`package.json` scripts (add):

```json
"dist:win": "npm run build && npm test && node scripts/bundle.mjs && node --env-file-if-exists=.env scripts/fetch-python.mjs win x64 && electron-builder --win --x64 --publish never",
"dist:mac": "npm run build && npm test && node scripts/bundle.mjs && node scripts/mac-cross-deps.mjs && node --env-file-if-exists=.env scripts/fetch-python.mjs mac arm64 && node --env-file-if-exists=.env scripts/fetch-python.mjs mac x64 && electron-builder --mac --arm64 --x64 --publish never"
```

- [ ] **Step 5: `docs/BUILD.md`**

```markdown
# Building the SA Copilot installers

## Windows (.exe) — on Windows 10/11 x64

1. Node 22+ and this repo with `npm install` done.
2. Optional: `DECK_TEMPLATE` in `.env` pointing at the pitch deck `.pptx` (bundled into the installer).
3. `npm run dist:win` → `release/SA Copilot Setup <version>.exe` (first run downloads ~30 MB of Python and pip packages).

## macOS (.dmg) — on a Mac

1. Install Node 22+ (`brew install node`) and Xcode command line tools (`xcode-select --install`).
2. On Apple Silicon also install Rosetta (needed to prepare the Intel build's Python): `softwareupdate --install-rosetta --agree-to-license`.
3. Copy the repo to the Mac, `npm install`, optional `DECK_TEMPLATE` in `.env`.
4. `npm run dist:mac` → `release/SA Copilot-<version>-arm64.dmg` (Apple Silicon) and `…-x64.dmg` (Intel).

## Opening the unsigned app

- **Windows:** SmartScreen says "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS:** open the DMG, drag SA Copilot to Applications. First launch: right-click the app → **Open** → **Open**. If macOS says the app "is damaged", run `xattr -dr com.apple.quarantine "/Applications/SA Copilot.app"` in Terminal and open it again.

## First start

The Setup screen asks for the 9router API key: click **Open 9router dashboard**, sign in to your provider, create a key, paste it. Everything else is in **Settings → Connections**. To move data from another device use **Settings → Backup**.

Data lives in `%APPDATA%\SA Copilot` (Windows) or `~/Library/Application Support/SA Copilot` (macOS) and is kept on uninstall/update. Logs: Settings → Connections → **Open logs**.

## macOS test checklist (after `npm run dist:mac`)

- [ ] Install the DMG for your Mac's architecture; first launch via right-click → Open works.
- [ ] Splash goes through database → AI router → SA Copilot; the Setup screen appears.
- [ ] After entering the 9router key, Settings → Connections → **Test connection** lists models.
- [ ] Upload a PDF in Requirements → it is converted (markitdown works).
- [ ] Generate the pitch deck → the `.pptx` downloads (python-pptx works).
- [ ] Settings → Backup → Download backup, then Restore it → data unchanged.
- [ ] Quit (⌘Q) → `ps aux | grep -E 'postgres|9router|server-dist' | grep -v grep` shows nothing from SA Copilot.
- [ ] Reopen → projects are still there.
```

- [ ] **Step 6: Build the Windows installer**

Run: `npm run dist:win`
Expected: ends with `release/SA Copilot Setup 1.0.0.exe`. Record its size: `ls -la release/*.exe`.

- [ ] **Step 7: Commit (if approved)**

```bash
git add scripts/fetch-python.mjs scripts/mac-cross-deps.mjs electron-builder.yml docs/BUILD.md build/icon.png build/icon.ico package.json
git commit -m "build: electron-builder pipeline for Windows and macOS installers"
```

---

### Task 11: Windows smoke test

**Files:**
- Create: `scripts/smoke-win.ps1`

**Interfaces:**
- Consumes: `release/SA Copilot Setup 1.0.0.exe` (Task 10); `SA_COPILOT_DATA_DIR`, `SA_COPILOT_SMOKE` (Task 8).

- [ ] **Step 1: `scripts/smoke-win.ps1`**

```powershell
# Installs the built .exe silently into a temp folder, starts it with a throwaway data folder, checks every
# service answered, lets it quit itself, verifies nothing is left running, then uninstalls.
$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem release -Filter 'SA Copilot Setup *.exe' | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $installer) { throw 'Run npm run dist:win first' }
$root = Join-Path $env:TEMP ("sa-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$installDir = Join-Path $root 'app'
$dataDir = Join-Path $root 'data'

Write-Host "Installing $($installer.Name) into $installDir"
Start-Process $installer.FullName -ArgumentList '/S', "/D=$installDir" -Wait

$env:SA_COPILOT_DATA_DIR = $dataDir
$env:SA_COPILOT_SMOKE = '1'
$app = Start-Process (Join-Path $installDir 'SA Copilot.exe') -PassThru
$ready = Join-Path $dataDir 'logs\ready.json'
$deadline = (Get-Date).AddMinutes(3)
while (-not (Test-Path $ready) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
if (-not (Test-Path $ready)) { throw "App did not become ready; see $dataDir\logs" }
$port = (Get-Content $ready | ConvertFrom-Json).server
$projects = Invoke-RestMethod "http://127.0.0.1:$port/api/projects"
Write-Host "Server on $port answered /api/projects ($(@($projects).Count) projects)"
Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing | Out-Null
Write-Host 'UI served'

$app.WaitForExit(60000) | Out-Null
Start-Sleep -Seconds 3
$left = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$installDir*" -or $_.CommandLine -like "*$installDir*" }
if ($left) { $left | Select-Object ProcessId, Name, CommandLine | Format-List; throw 'Processes left running after quit' }
Write-Host 'No processes left running'

Start-Process (Join-Path $installDir 'Uninstall SA Copilot.exe') -ArgumentList '/S' -Wait
Start-Sleep -Seconds 3
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'SMOKE TEST PASSED'
```

- [ ] **Step 2: Run it**

Run: `powershell -ExecutionPolicy Bypass -File scripts/smoke-win.ps1`
Expected: ends with `SMOKE TEST PASSED`. (The app window appears for a few seconds and closes itself; if 9router is already running on 20128 the log says it was reused.)

- [ ] **Step 3: Full verification**

Run: `npx tsc -b && npx oxlint && npx vitest run && node --env-file=.env node_modules/vitest/vitest.mjs run server/backup`
Expected: all pass. Report the installer size and installed size (`(Get-ChildItem -Recurse "<installDir>" | Measure-Object Length -Sum).Sum` measured during the smoke run, or install once manually).

- [ ] **Step 4: Commit (if approved)**

```bash
git add scripts/smoke-win.ps1
git commit -m "test: Windows installer smoke test"
```
