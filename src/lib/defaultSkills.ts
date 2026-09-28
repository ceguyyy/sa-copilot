// Default skill library, seeded on first sign-in. Distilled from the SA's templates:
// Assessment Requirement.xlsx, Template TOR.xlsx, Template Timeline Development.xlsx,
// [Cekat] Template SOW (Enterprise).docx and 2026 CIF for Meta Business Agent SOW Template.docx.
import type { SkillInput } from './types'

const chat: SkillInput = {
  name: 'Solution Architect Copilot',
  output_type: 'chat',
  is_default: true,
  description: 'Default persona for the project chat.',
  instructions: `Act as a senior presales Solution Architect for Cekat AI discussing this project with a colleague.
- Answer from the requirements, knowledge and current documents in context. Quote the source name when useful.
- Proactively point out gaps, risks, and questions that must be confirmed with the client.
- When the SA asks for a change to a document, explain the change and tell them to press "Revise with AI" on that document with a short instruction you suggest (quote it).
- For flows, you may sketch Mermaid code in a \`\`\`mermaid block.
- Keep answers tight; use tables for comparisons.`,
}

const assessment: SkillInput = {
  name: 'Assessment Requirement — Cekat standard',
  output_type: 'assessment',
  is_default: true,
  description: '12 standard business-process questions, feedback filled from client requirements.',
  instructions: `Produce the Assessment Requirement (Assesment Kebutuhan Proses Bisnis) using EXACTLY these 12 standard questions, in order (use the Indonesian wording unless the requirement is in English, then use the English wording). "topic" is a 1-3 word label.
1. Topik AI Agent (menu utama / modul FAQ) dan skenario yang dapat dihandle (contoh: Produk, Promo, Lokasi Cabang, Layanan).
2. Apakah AI Agent akan mengambil data ke sistem milik perusahaan? Untuk apa saja? (contoh: API Lokasi Cabang, API Polis).
3. Apakah perusahaan sudah punya dashboard interaksi pelanggan (omnichannel)? Jika integrasi ke omni existing: vendornya siapa, tetap pakai existing atau ganti ke Omni CRM Cekat? Jika belum: berapa id agent/user (Super Agent, SPV, Agent)?
4. Jika ganti ke Omni CRM Cekat, apakah ada kebutuhan custom workflow automation (custom id ticket, auto tagging/update status berdasarkan deadline, dll)?
5. Channel yang digunakan untuk AI Agent dan omni (Live Chat, WA Official, WA Coexistence, Facebook DM, Instagram DM).
6. Jika WA Official: sudah official atau belum? BSP siapa? Ingin migrasi atau tidak?
7. Trafik WhatsApp (Broadcast: Marketing, Utility, Authentication Conversation).
8. Estimasi trafik user per channel.
9. Server On Cloud (shared / dedicated) atau On Premise (VM / server fisik)? *On premise: source code milik Cekat, client memberi root akses.
10. RFP atau flow journey kebutuhan secara detail.
11. Marketing traffic.
12. Jumlah board yang akan di-setup pada CRM.
Rules:
- "feedback": answer from the requirements with concrete facts (numbers, systems, channels). Cite the source name in parentheses.
- status "answered" only when the requirement clearly answers it; "needs_confirmation" when partial/unknown (write what is known + what to ask); "not_applicable" when clearly irrelevant.
- You MAY append extra rows (no 13+) for important client-specific questions discovered in the requirements.
- "summary": 3-6 sentences: client goal, key scope, biggest open questions.`,
}

const tor: SkillInput = {
  name: 'TOR — Cekat package & custom scope',
  output_type: 'tor',
  is_default: true,
  description: 'Terms of Reference rows: Layanan / Sub Layanan / Deskripsi / Note / Raised By.',
  instructions: `Produce the TOR as rows with columns Layanan | Sub Layanan | Deskripsi | Note | Raised By.
Structure:
1) A header row for the chat package ("Package Chat") then the package the client needs (Business / Enterprise / Unlimited). Standard package lines:
- Business: 10.000 Maximum Active Users (Maksimal MOU 10.000 user); 7 Human Agents (id seat/akun agent 7); Unlimited AI Agents; Unlimited Inboxes (multi channel & account); 50.000 AI Responses (bubble respon); CekatAI Advanced AI Models (kalkulasi, analisa gambar, AI tools); Free Onboarding and Setup; Dedicated Support; Complete Documentation (user manual dashboard); OpenAPI Access; Free App Training (operasional dashboard).
- Enterprise: same but 30.000 MAU, 10 Human Agents, 150.000 AI Responses.
- Unlimited: Custom MAU, Unlimited AI Agents & Inboxes, Custom AI Responses (up to 500.000), Advanced AI Models, Free Onboarding, Dedicated Support, Documentation, Open API, 24/7 On Call Support, Custom Workflows, Custom Analytics.
2) If CRM is needed, "Package CRM" rows (CRM Business / CRM Enterprise): CRM Contacts and Company List, Unified Customer Data Platform, Unlimited Boards, Unlimited Views (Table, Kanban, Calendar, Gantt, Custom), Up to 50.000 Items per Board, Agents.
3) Then client-specific scope rows: AI Agent topics, each API integration (Get/Post/Update, purpose), channels (WA Official/Coexistence, IG, FB, Live Chat, Telegram, etc.), WA registration/migration, custom features, dashboard adjustments, reporting.
Rules: Put the Layanan value only on the first row of each group; following rows of the same group have Layanan "". "Note" = assumptions, dependencies or items needing confirmation. "Raised By" = "Client" when it comes from the requirement, "Cekat" when proposed by the SA, "" for standard package lines. Only include packages/features justified by the requirement or the assessment.`,
}

const timeline: SkillInput = {
  name: 'Timeline — Full implementation (AI Agent + WA + API)',
  output_type: 'timeline',
  is_default: true,
  description: 'Setup, Development & Maintenance timeline; SLA/Days are the mandays the SA will adjust.',
  instructions: `Produce the "Timeline Setup, Development, & Maintenance". Columns: No | Activity | Module | Function | PIC | SLA/Days. One row per Function; only the first row of an Activity carries "no" and "activity" (others ""). "parallel": true when the row can run at the same time as the previous row.
Reference template (adapt: drop what is out of scope, add client-specific modules; keep these default SLA/Days unless the requirement says otherwise):
1 Document Requirement — Onboarding Client: Onboarding document filling (Client, 7); Dokumentasi API: API documentation delivery by client (parallel); Knowledge Preparation: preparing and collecting knowledge sources (parallel)
2 Kickoff Implementation (Cekat & Client, 1)
3 Pendaftaran Account FB Business — Dashboard FB Business: Pembuatan & Pendaftaran Akun Business (5); Verifikasi Akun Business (5)
4 Pendaftaran Account Whatsapp — Pendaftaran nomor (4); Verifikasi Nomor (4); OTP Whatsapp (3)
5 Masking Name Whatsapp* — Pengajuan Masking Name (5)
6 AI Setting (Cekat) — Define AI Persona Profiles (3); Train AI with Knowledge Base (3); AI Connected Platforms: connect to WABA/other channels (2); Knowledge Testing (1); Review (1)
7 Integration & APIs* — API Documentation Learning (3); API Mapping: API Get/Update/Post (Cekat & Client, 7); API Connectivity Testing (2); Review before live (2)
8 Pre UAT (Cekat & Client, 1)
9 Fixing Bug (3); Sign Off UAT (1)
10 Training — Cekat CRM (1)
Go-Live (1)
11 Post-Development — Monitor and Measure Quality (5); Review: weekly/daily review during 1st week live (1)
12 Fine-tuning — Feedback Gathering (2); Feature/Flow/Additional Process enhancement (Cekat, 4)
Mark WA registration rows parallel with AI Setting when they are independent. Set "start_date" to "" unless the SA gave one.
"notes" must include: "*Masking Name WhatsApp dapat berjalan lebih cepat atau lebih lama karena keputusan masking sepenuhnya hak dari sisi WhatsApp (META)" plus any client-specific assumptions.`,
}

const timelineLite: SkillInput = {
  name: 'Timeline — WA + Cekat Dashboard only',
  output_type: 'timeline',
  is_default: false,
  description: 'Short timeline for WA onboarding + dashboard setup without AI/API work.',
  instructions: `Produce a short timeline (columns No | Activity | Module | Function | PIC | SLA/Days):
1 Document Requirement — Akun Business FB: akses dashboard FB Business menggunakan akun client (Client, 5)
2 Kickoff Implementation (Cekat & Client, 1)
3 Pendaftaran Account FB Business — Pembuatan & Pendaftaran (5); Verifikasi (5)
4 Pendaftaran Account Whatsapp — Pendaftaran nomor (3); Verifikasi (3); OTP (2)
5 Masking Name Whatsapp* (10)
6 Dashboard Cekat (Cekat, 1 day each): Chat (console, assigned/unassigned, ticket); Ticket (create ticket CRM); Analytic; Contact (custom field, upload, export); Broadcast; Connected Platform; AI Agent (bot builder); Human Agent (member/teams); Setting (ticket template, working hours, pipeline, quick replies, follow up, CSAT, flow, workflow)
7 Training — Cekat CRM (Cekat & Client, 1)
8 Go Live (1)
Include the masking-name disclaimer note.`,
}

const sowCekat: SkillInput = {
  name: 'SOW — Cekat Enterprise format',
  output_type: 'sow_cekat',
  is_default: true,
  description: 'Internal Cekat SOW (Bahasa Indonesia) following the Enterprise template.',
  instructions: `Write the Cekat Scope of Work in Bahasa Indonesia, formal, following the Cekat Enterprise template.
meta (key/value, in this order): Client Name, Project Name, Date (bulan tahun), Document Version ("1.0" unless revising), Package (Business/Enterprise/Unlimited), Partner (if any, else "-").
sections (title → markdown), in this order:
1. "Revision History" — table: Date | Revision | Description | Author.
2. "Distribution List" — table: Name | Company | Title (Client PIC, Project Manager, VP Sales, Business Development, AI Consultant — use role placeholders like "[Nama]" when names are unknown).
3. "Document Approval" — standard paragraph that the document is inseparable between Penyedia and Mitra and changes must be in writing and approved by both parties; table Company | Name | Signature | Date.
4. "Kerahasiaan Dokumen" — confidentiality paragraph (internal client & Cekat AI only, not for public, no reproduction).
5. "Pendahuluan — Latar Belakang" — client (called "Mitra") needs, Cekat AI description (AI Agent builder & Omnichannel CRM since 2024, 24/7 AI Agent across WhatsApp, IG, FB, Marketplace), project purpose. Document is part of the PKS.
6. "Pendahuluan — Ketentuan dan Ruang Lingkup Proyek" — anything not listed is a Change Request handled after the project; PKS reference.
7. "Ruang Lingkup — Deskripsi Proyek".
8. "Ruang Lingkup — Paket Layanan Cekat" — numbered list of the chosen package features (see TOR).
9. "Ruang Lingkup — Flow / Activity Diagram" — describe the main flows; if a Diagram document exists, reference it by title and include its Mermaid in a \`\`\`mermaid block.
10. "Ruang Lingkup — Scope of Work" — sub-headings: AI Agent topics & knowledge; Integrasi API Client / 3rd Party (numbered: API name → purpose); Custom Fitur / Custom Integration; Cekat AI Dashboard Adjustment. Derive strictly from TOR + assessment.
11. "Registrasi Masking/Sender ID" (only if new WA Official) — table Task | Note (Register Business Approval, Register Business Name, Registrasi & Approval Template Push Message, Approval Business Name) + FBM checklist (NPWP/SIUP/NIB, utility invoice matching legal address, website address consistency) + notes: approval is Meta's authority, rejected applications can re-apply after 30 days, improve digital footprint.
12. "Migrasi WA Official" (only if migrating from another BSP) — table Task | Keterangan (Matikan 2FA — Cloud API unregister vs On-Prem docker; Migrasi Nomor — Credit Line requires delete & re-register; Migrasi via Embedded Sign-Up with OTP; Selesai) + notes (manual backup of chat/templates/contacts; Credit Line path 2–4 days up to >1 week; otherwise ~1 hour–1 working day).
13. "Out of Scope" — bullets: issues from client/3rd-party API changes (Meta, Telegram, IP, etc.), bluetick decisions by Meta, template approval by Meta, plus project-specific exclusions.
14. "Dashboard Cekat AI" — numbered features: Chat, Ticket Eskalasi L2, Analytic, Contact, Connect Platform, AI Agent, Human Agent, Setting, Profile (short descriptions).
15. "Waktu Pengerjaan (Timeline)" — total mandays & weeks and a markdown table Activity | PIC | SLA/Days built from the Timeline document; state Cekat may deactivate custom features if there is no communication from Mitra for 1 month.
16. "Bantuan dan Dukungan" — 24/7 support chat after go-live via WhatsApp group for Enterprise/Unlimited; after-sales support in working hours; bug/error fixes caused by provider system; other support per PKS. Sub-section "Laporan dan Komunikasi" with a table Penyedia | Mitra listing Penanggung Jawab Teknis & Bisnis (Nama/Jabatan/No. HP/Email placeholders).
Use "[...]" placeholders for any unknown names, numbers or dates — never invent them.`,
}

const sowCif: SkillInput = {
  name: 'SOW — Meta CIF (Client Integration Fund) format',
  output_type: 'sow_cif',
  is_default: true,
  description: 'Statement of Work for the Meta Business Agent Client Integration Fund (English).',
  instructions: `Write the Statement of Work for "Client Integration Fund for Meta Business Agent" in English.
meta (in this order): Partner Name ("PT Teknologi Cekat Indonesia (Cekat AI)"), Client Name, Client BM ID, Client Vertical, Project Type ("Client Integration"), Project Stakeholders, Project Objective (1-3 sentences, measurable), Estimated Daily Threads, Estimated Automated Resolution Rate.
sections, in this order:
1. "2.1 Project Description" — what it takes to accomplish the objective: channels, MBA vs Cekat AI (LLM) vs Human Agent roles, data sources, reporting.
2. "2.1 Project Timeline" — state "Each Approved Project must be completed within ninety (90) days after the Start Date.", Start Date / End Date from the Timeline document, then a table Milestone | Timeline | Exit Criteria with milestones Technical Assessment, Solution Design, System Integrations, Testing and Reporting, Launch Solution. Map Timeline rows into these milestones and sum their SLA/Days into the Timeline column ("x days, dd Mon – dd Mon" when dates are known). Warn in the text if the total exceeds 90 days.
3. "2.2.1 Knowledge Sources" — table Knowledge Category | Source | Coverage.
4. "2.2.2 Connectors" — table Target Environment | Tool Description | Entities In Scope (include human handoff to Cekat Inbox when relevant).
5. "2.2.3 Agent Capabilities" — table Capability | Description | Dependencies (e.g. resolve codes, recommendations, availability checks, escalation with no-hallucination guardrail).
6. "03 Resource Breakdown" — table Phase | Roles & estimated hours (Technical Assessment, Solution Design, System Integrations, Testing and Reporting) using 8 hours per manday derived from the Timeline; rows "Total Estimated Hours" and "Total Estimated Cost" ("[to be filled]" for cost).
7. "Approval" — signature table Partner Name | Customer Name, then the note that the SOW is not legally binding, Meta plan approval is required before beginning work & submitting proof.
Never invent BM IDs, volumes or costs: use "[to be confirmed]".`,
}

const onboarding: SkillInput = {
  name: 'Onboarding Form — Cekat implementation',
  output_type: 'onboarding',
  is_default: true,
  description: 'Form the client fills before kickoff (technical & business data).',
  instructions: `Create the client onboarding form that must be completed before Kickoff Implementation. Sections (include only relevant ones):
1. Informasi Perusahaan — legal name, brand name, NPWP, NIB/SIUP, address as in legal documents, website, industry.
2. PIC — business & technical PIC (name, title, phone, email).
3. Meta / WhatsApp — Facebook Business Manager ID, FB personal admin email, WhatsApp number(s) to register, current WA status (none / WA Business App / WA Official with BSP [name]), migration needed, credit line (yes/no), display name, verification documents (file), utility invoice (file).
4. Channel — which channels to connect (checkbox options: Live Chat, WA Official, WA Coexistence, Instagram DM, Facebook DM, Telegram, Marketplace) and account handles.
5. AI Agent — persona/tone, languages, topics (from assessment), escalation rules, working hours, knowledge files (file upload), FAQ, prohibited answers.
6. Integrasi API — for each API from the TOR: base URL, auth method, sample request/response, API documentation (file), sandbox credentials delivered via secure channel (never in this form — say so in help text).
7. Human Agents & CRM — number of agents by role (Super Agent, Supervisor, Agent), teams, boards/pipelines, ticket template, custom fields.
8. Broadcast — template categories (Marketing/Utility/Authentication) and estimated monthly volume.
Pre-fill "value" with what is already known from the requirements; otherwise "". Use select/checkbox with "options" where choices are known; "options" is [] otherwise. "help" explains what to provide.`,
}

const diagram: SkillInput = {
  name: 'Diagram — Mermaid UML / flow',
  output_type: 'diagram',
  is_default: true,
  description: 'Activity, sequence, flowchart, state, class, ER, journey or gantt diagram in Mermaid.',
  instructions: `Produce one Mermaid diagram of the requested kind describing the solution for this project.
- activity → "flowchart TD" with swimlane-style subgraphs per actor (Customer, AI Agent, Human Agent, Client System/API, Cekat Dashboard); decisions as {diamond}.
- sequence → "sequenceDiagram" with participants Customer, Channel (WA/IG/...), Cekat AI Agent, Client API, Human Agent; use alt/opt blocks for escalation & errors.
- flowchart → "flowchart LR".
- state → "stateDiagram-v2" (e.g. conversation/ticket lifecycle).
- class → "classDiagram"; er → "erDiagram" (data entities from integrations); journey → "journey"; gantt → "gantt" from the Timeline document (dateFormat YYYY-MM-DD, excludes weekends).
Rules: output valid Mermaid only (no fences) in "mermaid"; quote labels containing parentheses, slashes or colons, e.g. A["Get Promo (API)"]; keep node ids alphanumeric; ≤ 40 nodes. "title" is short and specific. "explanation" is 2-5 sentences in the SA's language describing the flow.`,
}

const userJourney: SkillInput = {
  name: 'User Journey — Cekat AI Agent workflow',
  output_type: 'user_journey',
  is_default: true,
  description: 'AI Agent scripts per topic sheet in the Cekat "Template User Journey Workflows" format (.xlsx).',
  instructions: `Write the user journey the client will review before the AI Agent is built.
- Start from the use cases in the requirements/TOR and the API integrations of the POC; one sheet per menu/use case, plus "Greeting, Main Menu" and "Unknown, CSAT, Live Agent".
- For every API call cover the success reply, "not found / invalid input" and the API-error reply, and note the endpoint (GET/POST).
- Keep replies short, friendly, in the persona's voice; the main menu lists the use cases as [button] items.`,
}

export const DEFAULT_SKILLS: SkillInput[] = [
  chat,
  assessment,
  tor,
  timeline,
  timelineLite,
  sowCekat,
  sowCif,
  onboarding,
  userJourney,
  diagram,
]
