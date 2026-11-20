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
4. **AI Actions & Routing**: Agent Transfer, Conversation Label, Conversation Pipeline — each a list of
   Conditions (= POC handoff conditions, labels, pipeline). Not filled in yet.
5. **Knowledge Base**: sub-tabs Text, Website, File, Q&A, Product; a "Default" text section and a character count.
6. **AI Configuration**: AI Model (Auto), Stop AI after transfer, Silent transfer, Ignore Team Handoff,
   Timezone, AI History Limit, AI Read File Limit, AI Context Limit, AI Creativity Level, Message Await,
   AI Message Limit, Session Only Memory — the same fields as the POC Additional Settings.

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
- AI agent "[SA Copilot test] Agent uji" (`26d741de-8ee7-4e06-b5dd-54ef40786b55`) in Cekat AI Demo, with a
  test Communication Style. Delete both when the exploration is done.
