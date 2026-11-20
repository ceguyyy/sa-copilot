# Cekat dashboard: what can be automated, and how

Findings from exploring chat.cekat.ai (business "Cekat AI Demo", role Member) on 2026-11-20, for the
"Build in Cekat" feature. The dashboard has stable `data-testid` attributes; prefer them over text.

## What goes through Cekat MCP vs the browser

| Part of the POC | How | Notes |
|---|---|---|
| SDK events, ads conversion rules | Cekat MCP (`marketing_save_custom_event`, `marketing_setup_conversions`) | Done: POC › Ads Conversion Setup › Create in Cekat |
| CRM items | Cekat MCP (`crm_create_item_with_values`, `crm_delete_items`) | Needs the board and column ids (`crm_list_board_columns`) |
| Automation flows | Cekat MCP (`automation_*`: `build_flow`, `add_step`, `add_branch`, `test_flow`, `lock_and_publish`, …) | Trigger piece `cekat`, e.g. `chat_event` |
| CRM board, columns, Select/Dropdown options | Browser (Playwright) | No MCP tool creates boards or columns |
| AI Agent (behavior, welcome, labels, knowledge, API tools, handoff) | Browser (Playwright) | Not explored yet |

## CRM: create a board from scratch

1. Open `https://chat.cekat.ai/crm`. If the left sidebar is collapsed (`aside` is `w-14`), click
   `getByRole('button', { name: 'Expand sidebar' })` first, or the add button is covered.
2. Click `crm.nav.add-board.btn` (first match). Dialog "Create New Board" with templates:
   `crm.board-create.deals.btn`, `.leads.btn`, `.projects.btn`, `.blank.btn`.
3. Click `crm.board-create.blank.btn`, then fill:
   - `crm.board-create.blank-name.input` — board name, max 100.
   - "What you're managing": `crm.board-create.blank-options.radio.N` with N = 0 Items, 1 Employees,
     2 Campaigns, 3 Leads, 4 Projects, 5 Tasks, 6 Custom (then `crm.board-create.blank-board.input`, max 100).
   - Access (required, else Create stays disabled): `crm.board-create.public.radio` or `.restricted.radio`.
4. Click `crm.board-create.create.btn`. The URL changes to `/crm?board_id=<id>&view_id=<id>`.

A blank board is **not empty**: it gets columns Person (agents), Status (select: Working on it, Stuck,
Done, Default) and Date, plus 5 sample items ("Item 1"…"Item 5"). Plan: reuse Status as the POC's kanban
Select column (rename + replace options), delete the sample items through MCP `crm_delete_items`, and
report Person/Date for manual removal unless a POC column of the same type can take them over by rename.

## CRM: add and name a column

1. Click `crm.board-table.header-add.btn`. A type picker opens with a search input
   `crm.board-table.header-add-search.input` and buttons `crm.board-table.header-add-search.btn.N`.
   Order: Text, Number, Date, Timeline, Email, Phone, Long Text, Checkbox, Select, Dropdown, References,
   Agents, Contacts, Companies, Conversation, Orders, Subscriptions, Files — the same types as
   `CRM_COLUMN_TYPES`. Pick by button text, not index.
2. The column is created at once, named "New <Type>". Its header is
   `th[data-testid="crm.board-table.header-<name>.div"]` with `data-crm-resize-col="<column id>"` and an
   inline `<input maxlength="255">`: fill it and press Enter to rename.
3. Row cells are `td[data-testid="crm.board-table.column-<name>.div"]`, but their testid keeps the old
   name until reload. Address cells by `td[data-crm-resize-col="<column id>"]` instead.

## CRM: Select / Dropdown options

1. Click a cell of the column in any row (`[data-testid="crm.board-table.row.div.0"] td[data-crm-resize-col="<id>"]`).
   Popup `crm.board-label.modal` lists `crm.board-label.menu-item.N` and `crm.board-label.edit.btn` ("Edit Options").
2. Click Edit Options: inputs `crm.board-label.edit.input.N` (one per option), `crm.board-label.edit-add-new.btn`
   (adds "New Label"), `crm.board-label.edit-apply.btn`. Each row also has two unlabelled buttons (colour, delete).
3. Fill the inputs in order, add rows as needed, Apply. A new Select column starts with Default Label, Label 1, Label 2.
   Remove an option: in its row `[data-option-item]:has([data-testid="crm.board-label.edit.input.N"]) > button`
   (the "…" button) › `getByRole('button', { name: 'Delete Label' })`, then Apply. Delete from the last row
   up so the input indexes of the rows still to keep do not shift.
4. Verify with MCP `crm_list_board_columns`: `settings.labels[]` = `{ id, name, color }`; the first option has id `default`.

**Dropdown** columns open another editor (no testids): the cell popup has a button "Edit Options" that opens
`[data-crm-cell-type-modal]` with a "Create or find options" input, one input per option and "Apply". Rename
by filling an option input; add by typing in "Create or find options" and clicking "Create as new label"
(saved at once); there is no way to delete an option; an empty option makes Apply fail with HTTP 400.
New Dropdown columns start with Label 1, Label 2, Label 3.

## Automation (Cekat MCP `automation_ckt_*`)

- Cekat Automation is Activepieces. The Cekat piece has trigger **AI Tool (Invoke)** (`ai_tool_invoked`: `agentIds`,
  `toolName`, `toolDescription`, `aiInputs[{name, description, type string|number|boolean, required, enum[{value}]}]`,
  `responseCode`) and action **AI Tool (Response)** (`ai_tool_response`: `responseType`, `fields {status, headers, body}`,
  `respond`). An AI agent's API tool can therefore live in Cekat as one flow per tool — the same shape as a POC API
  integration — instead of the n8n gateway.
- `agentIds` options resolve only with a `flowId` (`resolve_property_options`); the values are AI agent ids.
- `build_flow` works (trigger + CODE/PIECE steps; all validated). References: `{{trigger['output'].body.inputs}}`,
  `{{step_1['output'].body}}`. `test_flow` + `list_runs`/`get_run` (environment TESTING) show step outputs and errors.
- **Calling the client API is the blocker**: the HTTP piece (`send_request`) needs a connection, and this project has
  none (`list_connections pieceName=http` is empty; setup guide: Automations › Connections › HTTP). CODE steps run in
  isolated-vm without `fetch`, `URL` or npm packages (axios cannot be resolved), so they cannot call out.
  `/automations/connections` loads `automation.cekat.ai` in an iframe; as a Member its project-members API returns 404.
- The builder (`toolsBuild.ts`) runs after the agent build: one flow per POC API integration with a target URL,
  named after the tool. The steps are AI Tool (Invoke) → optional login `send_request` to `authUrl` (body to fill in;
  the token is assumed at `body.token`) → `send_request` (GET inputs go in the query, other methods send a JSON body
  `{data: …}`, failureMode `continue_all`) → AI Tool (Response) with the API body. Existing flow names are skipped.
  The flows stay drafts (not published) until the SA has checked them.
- **The HTTP step does not need an HTTP connection**: `send_request` only checks that `auth` is some active connection
  of the project. With `authType: NONE` it sends none of that connection's credentials. Verified with the Google Drive
  connection `yx1cagoXjFhAakLpPRRdQ`: the test run (`PAoD5BDyWBPO35H5x1KCA`) reached httpbin.org with the query
  input and no `Authorization` header, and AI Tool (Response) returned the API body. The builder takes an HTTP
  connection if there is one, otherwise the first active connection.
- Test leftovers: flows "[SA Copilot test] cek_jadwal" (`ChnnJxVob0rOY5ouL85TJ`, empty) and
  "[SA Copilot test] sa_copilot_test_cek_jadwal" (`tAbALwZDB1NId9DyDredc`, draft, tool for "Agent build 3", not published),
  "[SA Copilot test] http_via_gdrive_auth" (`mjuH1It9XlupwolR0Ir8E`, draft, tool `sa_copilot_test_http` for "Agent build 3").

## API Tools (Devtools › API Tools) and the agent's Integrations

- This is how an AI agent calls a webhook: create the tool in `/developers/api-tools`, then activate it on the agent in
  Integrations › AI Tools (`?tab=integrations`). Tools from Automation flows (AI Tool (Invoke)) are not listed there.
- Create form: Name, HTTP Method (GET/POST), Description, Webhook Address, Max Tool Calls, API Key (Bearer), AI Inputs
  (Simple / Custom = JSON Schema in a Monaco editor). "Create Tool" sends `POST /ai_tools`.
- **Creating ignores the method and Max Tool Calls** (saved as POST / null). "Edit Tool" › Save (`PUT /ai_tools/:id`)
  saves them. The builder leaves Max Tool Calls alone: re-filling it once saved 0.
- Monaco auto-closes brackets while text is inserted, leaving `"}` after the cursor; invalid JSON is saved as
  `schema: null`. The builder inserts one-line JSON, deletes everything after the cursor and checks the editor text,
  then checks the PUT reply (method and schema).
- Activate is one click (`PUT /ai_agents/ai_tools/assign`); an active card shows one button "Active"/"Deactivate"
  (hover). The page renders the list twice, one copy hidden, and a new tool may need a reload to appear.
- `GET /ai_tools` (the list) returns `schema: null` for some tools; the edit form shows what is saved.
- Test leftovers (all active on "Agent build 3"): `sa_copilot_test_cek_jadwal`, `sa_copilot_test_cek_slot`,
  `…_slot2` … `…_slot7` (slot2/slot3 have no AI inputs, slot7 has Max Tool Calls 0).

## The builder (server/cekat)

`selectors.ts` holds every selector, `browser.ts` the Edge/Chrome window with SA Copilot's own profile
(`data/cekat-browser`, log in once), `crmUi.ts` the dashboard steps, `crmBuild.ts` the plan, the run and the
check. Verified live on 2026-11-20 in Cekat AI Demo: board with key `Phone_number`, `Phone_number(2)` (phone),
Select `Stage` (Baru, Booking — one default option deleted), Dropdown `Prioritas` (A, B, C, D — one added),
default columns removed; MCP `crm_list_board_columns` matched. The sidebar is often collapsed: the builder
measures it and clicks "Expand sidebar" first. Board names for the duplicate check are read from the sidebar
(`crm.nav.view.div.N`, `aria-label` = name) because MCP `crm_list_boards` returns HTTP 400
"Board name is required" on this business.

## CRM: column rules

- Column 1 is the board's primary key (the item title). It cannot be deleted.
- Column 2 must duplicate column 1, named `<column 1>(2)`: e.g. `Phone_number` then `Phone_number(2)`, with
  the same value in every item. SA Copilot enforces this when the AI designs a board (`boardFromAi` in
  `shared/pocCrm.ts` inserts the duplicate if missing; its type follows the name: phone, email or text).
- Delete a column: hover the header, click `button[aria-label="Column settings for <name>"]` (hidden until
  hover), then `getByRole('button', { name: 'Delete', exact: true })`. The menu also has Rename and Hide Column.
  **Delete has no confirmation** — the column is gone at once, so check the name twice before clicking.
- Column 1 (the key) is the header whose `data-crm-resize-col` equals the board id; it has no name testid and
  no Column settings. Its name is what the board manages: choose "Custom" (`blank-options.radio.6`) and type
  the key name in `crm.board-create.blank-board.input` when creating the board (e.g. `Phone_number`).
- After a reload the header name is plain text, not an input: rename through Column settings ›
  `getByRole('button', { name: 'Rename', exact: true })`, which turns the header into a focused input with the
  old name; fill it and press Enter. Verified through MCP `crm_list_board_columns`.

## AI Agent (new agents, `/ai-agents-v2`)

No `data-testid` on these pages: use ids, roles and visible text.

1. Create: `/ai-agents-v2` › click text "Create New" › dialog "Create New AI Agent": `#create-name` (name),
   `#create-template` (only `helpdesk` = Customer Service AI) › button "Create AI Agent". Opens
   `/ai-agents-v2/<agent id>?tab=behavior`.
2. Tabs (`?tab=`): `behavior`, `knowledge-base`, `actions-routing`, `configuration`, then Followups,
   Integrations, Orchestration, Evaluation, Preview.
3. **AI Behavior**: Welcome Message, then AI Core Communication = **Communication Style**, **Conversation
   Flow**, **Rules & Restriction** (same split as the POC since the behavior segments), plus **Additional
   Instructions** with a Condition (= POC custom instructions). Each field is a rich-text editor that only
   appears after clicking the field's placeholder text: `div.rte-content[contenteditable="true"]`.
   Playwright `fill()` works. Style chips (Formal, Friendly, …), Normal Text, Message split, Optimize sit in
   the toolbar. Bottom bar: "Cancel Edit" / "Save" (`getByRole('button', { name: 'Save', exact: true })`).
   Verified: text saved and still there after a reload.
   Field area to click: `(//p[normalize-space()='<title>'])[last()]/ancestor::*[following-sibling::div][1]/following-sibling::div[1]`
   (the segments keep their title in a wrapper div, Welcome Message in a header button). `fill()` keeps line
   breaks; markdown is stored as plain text. Additional Instructions › "Condition" adds an instruction:
   title `input[maxlength="100"]` (last), a Pipeline picker (empty = all customers) and its own editor.
   Save each field on its own.
4. **AI Actions & Routing**: Agent Transfer, Conversation Label, Conversation Pipeline — each a list of
   Conditions (= POC handoff conditions, labels, pipeline). Each saved condition adds its own "Condition"
   button, so find a section's add button through its heading:
   `((//p[normalize-space()='<heading>'])[last()]/ancestor::*[.//button[normalize-space()='Condition']][1]//button[normalize-space()='Condition'])[last()]`.
   A new condition has a title `input[maxlength="100"]` (last), a trigger type (Prompt) and a description editor.
   - Transfer: title + description only.
   - Label: picker `(//*[normalize-space()='Label'])[last()]` opens `input[placeholder="Search labels"]`;
     type key by key (`pressSequentially`, `fill` does not filter), click `button:has(> span:text-is("<name>"))`.
     Labels must already exist: no create option here.
   - Pipeline: Current (optional; empty = from any status) and Target (required) pickers with
     `input[placeholder="Search pipelines"]`, same option buttons. Statuses must already exist.
   Settings › Labels (`/settings/labels`, works as Member): "Add Label" › dialog `#name` (max 100), a colour
   with a default, "Create". Pipeline statuses: `/settings/pipeline-settings` ("Pipeline Statuses") › "Add Status"
   opens an inline form: the first text input is the name, a colour (default #000000), "Add". Verified live.
   Builder: `routingUi.ts` + `routingBuild.ts`; verified live on "Agent build 3": a transfer condition, two label
   conditions (one label created) and New Leads → Qualified. Missing statuses are now created first.
5. **Knowledge Base**: sub-tabs Text, Website, File, Q&A, Product. "Q&A" also names a global shortcut to
   Settings › Quick Reply: click the sub-tab as `//button[normalize-space()='Website']/following-sibling::button[normalize-space()='Q&A'][1]`.
   - Text: one "Default" text, a Tiptap editor `.tiptap.ProseMirror`; `fill()` makes each line a paragraph; Save.
   - Q&A: "Add New Q&A" adds a row with textareas (placeholders "What is the package price?" / "Harga paketnya 100rb...");
     one Save posts each pair as a document (`type: "qna"`). The dashboard renders the Q&A list and its count
     twice; the documents behind it (`GET server.cekat.ai/documents?ai_agent_id=…`) are not duplicated.
   - Website: Batch / Single link and a "Web Link Collector" that crawls up to 300 links and trains on them —
     not automated; the builder lists the POC's websites and files for the SA.
   Builder: `kbUi.ts` + `kbBuild.ts`; verified live on "Agent build 3" (two text sections, two Q&A pairs).
6. **AI Configuration**: AI Model (Auto), Stop AI after transfer, Silent transfer, Ignore Team Handoff,
   Timezone, AI History Limit, AI Read File Limit, AI Context Limit, AI Creativity Level, Message Await,
   AI Message Limit, Session Only Memory — the same fields as the POC Additional Settings.
   Toggles are `input.peer.sr-only` checkboxes: read `isChecked()`, click the parent switch. Numbers are
   `input[type=number]` after their label (History min 10, Message Await max 1200). AI Creativity Level is a
   button with Consistent / Balanced / Creative (= POC temperature low / balanced / creative). Save at the bottom.
7. Builder: `server/cekat/agentUi.ts` + `agentBuild.ts`. Verified live on 2026-11-20 ("[SA Copilot test] Agent
   build 3", `33c950e9-…`): welcome, the three segments, one instruction and every setting saved as planned.

## Not found yet / blocked

- Board options (`getByRole('button', { name: 'Board options' })`) has "Board Settings"
  (`/crm/layouts?board_id=…`) and "Delete Board". Opening Board Settings as a Member redirected to the login
  page — probably needs an admin role. Check with an Owner/Admin account.
- Kanban view (Add view, group by a Select column) — not explored.
- AI Agent: the condition editors (labels, pipeline, transfer), knowledge base editors, Integrations (API
  tools) and connecting the agent to an inbox — not explored yet.

## Test leftovers

- Board "[SA Copilot test] Board uji" (`6224ccfb-2a54-4f7f-afd7-410355c49d44`) in Cekat AI Demo: Select
  column "Stage" (Baru, Follow Up, Deal, Lost); default column Date deleted.
- Boards "[SA Copilot test] Build uji" (`fd37c43a-…`, stopped after creating the board),
  "[SA Copilot test] Build uji 2" (`e7e9b056-…`, partial; Dropdown `Prioritas` used for the editor test) and
  "[SA Copilot test] Build uji 3" (`75dae2dc-391c-4749-8cb9-ee055240b1fd`, the full verified run).
- AI agents "[SA Copilot test] Agent build" (stopped after creating), "… Agent build 2" (stopped at the
  settings) and "… Agent build 3" (`33c950e9-2ca5-40cb-bbdb-a0ee2c1181d6`, the full verified run).
- Pipeline statuses "[SA Copilot test] Belum ada" and "[SA Copilot test] Status baru" (Settings › Pipeline Statuses).
- Labels "[SA Copilot test] Booking" and "[SA Copilot test] Komplain" (Settings › Labels); routing conditions on
  "Agent build 3" and a label condition on "Agent uji".
- AI agent "[SA Copilot test] Agent uji" (`26d741de-8ee7-4e06-b5dd-54ef40786b55`) in Cekat AI Demo, with a
  test Communication Style. Delete both when the exploration is done.
