-- SA Copilot: projects, sources, skills, versioned documents, chat.
-- Local single-user app on plain PostgreSQL. Idempotent: the server runs this on every start.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  client_name text not null check (char_length(client_name) between 1 and 200),
  industry text,
  package text,
  status text not null default 'discovery'
    check (status in ('discovery', 'assessment', 'proposal', 'won', 'lost', 'delivery')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- project_id null = global knowledge shared across projects (e.g. Cekat product knowledge)
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  kind text not null check (kind in ('requirement', 'knowledge')),
  name text not null,
  mime_type text,
  storage_path text,
  extracted_text text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists sources_project_idx on sources (project_id, kind);

create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  output_type text not null
    check (output_type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'diagram', 'chat')),
  description text not null default '',
  instructions text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists skills_type_idx on skills (output_type);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  type text not null
    check (type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'diagram')),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_project_idx on documents (project_id, type);

create table if not exists pocs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pocs_project_idx on pocs (project_id, updated_at desc);

create table if not exists poc_versions (
  id uuid primary key default gen_random_uuid(),
  poc_id uuid not null references pocs on delete cascade,
  version_no integer not null,
  config jsonb not null,
  note text not null default '',
  origin text not null default 'manual' check (origin in ('manual', 'ai', 'restore')),
  created_at timestamptz not null default now(),
  unique (poc_id, version_no)
);
create index if not exists poc_versions_poc_idx on poc_versions (poc_id, version_no desc);

-- Immutable history: rows are only ever inserted. Restore = insert a copy.
create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents on delete cascade,
  version_no integer not null,
  content jsonb not null,
  note text not null default '',
  origin text not null default 'manual' check (origin in ('ai', 'manual', 'restore')),
  skill_id uuid references skills on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_project_idx on messages (project_id, created_at);

-- ---------- triggers ----------

create or replace function set_version_no()
returns trigger language plpgsql as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
  from document_versions where document_id = new.document_id;
  return new;
end $$;

create or replace function set_poc_version_no()
returns trigger language plpgsql as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
  from poc_versions where poc_id = new.poc_id;
  return new;
end $$;

create or replace trigger document_versions_number
before insert on document_versions
for each row execute function set_version_no();

create or replace trigger poc_versions_number
before insert on poc_versions
for each row execute function set_poc_version_no();

create or replace function touch_document()
returns trigger language plpgsql as $$
begin
  update documents set updated_at = now() where id = new.document_id;
  return new;
end $$;

create or replace function touch_poc()
returns trigger language plpgsql as $$
begin
  update pocs set updated_at = now() where id = new.poc_id;
  return new;
end $$;

create or replace trigger document_versions_touch
after insert on document_versions
for each row execute function touch_document();

create or replace trigger poc_versions_touch
after insert on poc_versions
for each row execute function touch_poc();

-- Versions are append-only; enforced in the DB since there is no RLS locally.
create or replace function forbid_version_change()
returns trigger language plpgsql as $$
begin
  raise exception 'document_versions is append-only';
end $$;

create or replace function forbid_poc_version_change()
returns trigger language plpgsql as $$
begin
  raise exception 'poc_versions is append-only';
end $$;

create or replace trigger document_versions_immutable
before update on document_versions
for each row execute function forbid_version_change();

create or replace trigger poc_versions_immutable
before update on poc_versions
for each row execute function forbid_poc_version_change();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace trigger projects_touch before update on projects
for each row execute function touch_updated_at();
create or replace trigger skills_touch before update on skills
for each row execute function touch_updated_at();
create or replace trigger documents_touch before update on documents
for each row execute function touch_updated_at();
create or replace trigger pocs_touch before update on pocs
for each row execute function touch_updated_at();

-- ---------- app settings ----------

-- Small key/value store for app-wide preferences (e.g. the selected AI model).
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- MCP tool servers (e.g. Cekat docs) the AI may call ----------

create table if not exists mcp_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  url text not null check (url ~ '^https?://'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- custom deliverable templates ----------

-- A user-defined deliverable type: Claude writes it as meta + markdown sections following `instructions`.
create table if not exists doc_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger doc_templates_touch before update on doc_templates
for each row execute function touch_updated_at();

-- ---------- upgrades to earlier tables (idempotent) ----------

-- Sources can be switched off without deleting them; the AI ignores disabled ones.
alter table sources add column if not exists enabled boolean not null default true;

-- Documents flagged as knowledge are shared with every project's AI context.
alter table documents add column if not exists is_knowledge boolean not null default false;
-- Files last auto-exported for this document (absolute paths), so renames/deletes can clean them up.
alter table documents add column if not exists export_files text[] not null default '{}';
alter table documents add column if not exists template_id uuid references doc_templates on delete set null;

-- Notion page the project was last sent to ("Send to Notion" replaces it).
alter table projects add column if not exists notion_page_id text;

alter table documents drop constraint if exists documents_type_check;
alter table documents add constraint documents_type_check
  check (type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'user_journey', 'diagram', 'custom', 'deck'));
alter table skills drop constraint if exists skills_output_type_check;
alter table skills add constraint skills_output_type_check
  check (output_type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'user_journey', 'diagram', 'custom', 'deck', 'chat'));

-- ---------- files attached to instructions ----------

-- owner_kind 'skill' / 'template': permanent reference files used every time that skill or format runs.
-- owner_kind 'request': attached to a single AI request (chat message, revise instruction, design chat);
-- removed automatically after a day.
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('skill', 'template', 'request')),
  owner_id uuid,
  name text not null,
  mime_type text,
  storage_path text not null,
  extracted_text text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  check ((owner_kind = 'request') = (owner_id is null))
);
create index if not exists attachments_owner_idx on attachments (owner_kind, owner_id);

-- ---------- audit trail (per project) ----------

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  at timestamptz not null default now(),
  -- e.g. 'document.version', 'source.upload', 'project.update'
  action text not null,
  summary text not null,
  detail jsonb not null default '{}'
);
create index if not exists audit_log_project_idx on audit_log (project_id, at desc);

-- One-time backfill so projects that predate the audit trail still show their history.
insert into audit_log (project_id, at, action, summary, detail)
select d.project_id, v.created_at, 'document.version',
       format('%s v%s (%s): %s', d.title, v.version_no, v.origin, v.note),
       jsonb_build_object('documentId', d.id, 'versionId', v.id, 'origin', v.origin)
from document_versions v join documents d on d.id = v.document_id
where not exists (select 1 from audit_log a where a.detail->>'versionId' = v.id::text);

insert into audit_log (project_id, at, action, summary, detail)
select s.project_id, s.created_at, 'source.add', format('Added %s "%s"', s.kind, s.name), jsonb_build_object('sourceId', s.id)
from sources s
where s.project_id is not null
  and not exists (select 1 from audit_log a where a.detail->>'sourceId' = s.id::text and a.action = 'source.add');

-- Audit rows are written by triggers so every path (UI, AI, split, restore) is covered.
-- The `exists (select 1 from projects …)` guards skip logging while a whole project is being deleted.
create or replace function audit(p_project uuid, p_action text, p_summary text, p_detail jsonb)
returns void language plpgsql as $$
begin
  if p_project is not null and exists (select 1 from projects where id = p_project) then
    insert into audit_log (project_id, action, summary, detail) values (p_project, p_action, p_summary, p_detail);
  end if;
end $$;

create or replace function audit_version() returns trigger language plpgsql as $$
declare d documents;
begin
  select * into d from documents where id = new.document_id;
  perform audit(d.project_id, 'document.version',
    format('%s v%s (%s): %s', d.title, new.version_no, new.origin, new.note),
    jsonb_build_object('documentId', d.id, 'versionId', new.id, 'origin', new.origin));
  return new;
end $$;
create or replace trigger document_versions_audit after insert on document_versions
for each row execute function audit_version();

create or replace function audit_poc_version() returns trigger language plpgsql as $$
declare p pocs;
begin
  select * into p from pocs where id = new.poc_id;
  perform audit(p.project_id, 'poc.version',
    format('%s v%s (%s): %s', p.name, new.version_no, new.origin, new.note),
    jsonb_build_object('pocId', p.id, 'versionId', new.id, 'origin', new.origin));
  return new;
end $$;
create or replace trigger poc_versions_audit after insert on poc_versions
for each row execute function audit_poc_version();

create or replace function audit_poc() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform audit(old.project_id, 'poc.delete', format('Deleted POC "%s"', old.name), jsonb_build_object('pocId', old.id));
    return old;
  end if;
  if new.name is distinct from old.name then
    perform audit(new.project_id, 'poc.rename', format('Renamed POC "%s" → "%s"', old.name, new.name), jsonb_build_object('pocId', new.id));
  end if;
  return new;
end $$;
create or replace trigger pocs_audit after update or delete on pocs
for each row execute function audit_poc();

create or replace function audit_document() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform audit(old.project_id, 'document.delete', format('Deleted %s "%s"', old.type, old.title), jsonb_build_object('documentId', old.id));
    return old;
  end if;
  if new.title is distinct from old.title then
    perform audit(new.project_id, 'document.rename', format('Renamed "%s" → "%s"', old.title, new.title), jsonb_build_object('documentId', new.id));
  end if;
  if new.is_knowledge is distinct from old.is_knowledge then
    perform audit(new.project_id, 'document.knowledge',
      format('%s "%s" %s knowledge', case when new.is_knowledge then 'Added' else 'Removed' end, new.title, case when new.is_knowledge then 'to' else 'from' end),
      jsonb_build_object('documentId', new.id));
  end if;
  return new;
end $$;
create or replace trigger documents_audit after update or delete on documents
for each row execute function audit_document();

create or replace function audit_source() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform audit(new.project_id, 'source.add', format('Added %s "%s"', new.kind, new.name), jsonb_build_object('sourceId', new.id));
  elsif tg_op = 'DELETE' then
    perform audit(old.project_id, 'source.delete', format('Deleted %s "%s"', old.kind, old.name), jsonb_build_object('sourceId', old.id));
    return old;
  elsif new.enabled is distinct from old.enabled then
    perform audit(new.project_id, 'source.toggle', format('%s "%s" for the AI', case when new.enabled then 'Enabled' else 'Disabled' end, new.name), jsonb_build_object('sourceId', new.id));
  end if;
  return new;
end $$;
create or replace trigger sources_audit after insert or update or delete on sources
for each row execute function audit_source();

create or replace function audit_project() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    perform audit(new.id, 'project.status', format('Status %s → %s', old.status, new.status), '{}');
  end if;
  if new.name is distinct from old.name or new.client_name is distinct from old.client_name
     or new.description is distinct from old.description or new.package is distinct from old.package
     or new.industry is distinct from old.industry then
    perform audit(new.id, 'project.update', 'Project details updated', '{}');
  end if;
  if new.language is distinct from old.language then
    perform audit(new.id, 'project.language', format('Language %s → %s', old.language, new.language), '{}');
  end if;
  return new;
end $$;
create or replace trigger projects_audit after update on projects
for each row execute function audit_project();

create or replace function audit_project_created() returns trigger language plpgsql as $$
begin
  perform audit(new.id, 'project.create', format('Project "%s" created for %s', new.name, new.client_name), '{}');
  return new;
end $$;
create or replace trigger projects_audit_create after insert on projects
for each row execute function audit_project_created();

-- Language the AI writes this project's documents and chat replies in.
alter table projects add column if not exists language text not null default 'Bahasa Indonesia'
  check (char_length(language) between 1 and 40);

-- ---------- open questions for the client ----------

create table if not exists open_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  context text not null default '',
  status text not null default 'open' check (status in ('open', 'answered', 'dropped')),
  answer text not null default '',
  -- where it came from: typed by the SA, found by the AI in the documents, or extracted from meeting notes
  origin text not null default 'manual' check (origin in ('manual', 'ai', 'meeting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists open_questions_project_idx on open_questions (project_id, status);
create or replace trigger open_questions_touch before update on open_questions
for each row execute function touch_updated_at();

create or replace function audit_question() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform audit(new.project_id, 'question.add', format('Open question (%s): %s', new.origin, left(new.question, 160)), jsonb_build_object('questionId', new.id));
  elsif new.status is distinct from old.status then
    perform audit(new.project_id, 'question.' || new.status,
      format('Question %s: %s%s', new.status, left(new.question, 120), case when new.status = 'answered' then ' → ' || left(new.answer, 120) else '' end),
      jsonb_build_object('questionId', new.id));
  end if;
  return new;
end $$;
create or replace trigger open_questions_audit after insert or update on open_questions
for each row execute function audit_question();

-- ---------- consistency checks across a project's documents ----------

create table if not exists consistency_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  created_at timestamptz not null default now(),
  model text not null default '',
  result jsonb not null
);
create index if not exists consistency_checks_project_idx on consistency_checks (project_id, created_at desc);

create or replace function audit_consistency() returns trigger language plpgsql as $$
begin
  perform audit(new.project_id, 'check.consistency',
    format('Consistency check: %s issue(s)', coalesce(jsonb_array_length(new.result->'issues'), 0)),
    jsonb_build_object('checkId', new.id));
  return new;
end $$;
create or replace trigger consistency_checks_audit after insert on consistency_checks
for each row execute function audit_consistency();

-- ---------- demo scenarios (pushed to the Healthcare demo app) ----------

-- Drafted here (AI or edited by hand), then pushed to the demo app's Supabase `scenarios` table.
create table if not exists demo_scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  -- the scenario as the demo app expects it (types/scenario.ts in the demo repo)
  payload jsonb not null,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists demo_scenarios_project_idx on demo_scenarios (project_id, created_at);
create or replace trigger demo_scenarios_touch before update on demo_scenarios
for each row execute function touch_updated_at();

create or replace function audit_demo() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform audit(new.project_id, 'demo.add', format('Demo scenario "%s" drafted', new.payload->>'title'), jsonb_build_object('scenarioId', new.id));
  elsif tg_op = 'DELETE' then
    perform audit(old.project_id, 'demo.delete', format('Demo scenario "%s" deleted', old.payload->>'title'), jsonb_build_object('scenarioId', old.id));
    return old;
  elsif new.pushed_at is distinct from old.pushed_at and new.pushed_at is not null then
    perform audit(new.project_id, 'demo.push', format('Demo scenario "%s" pushed to the demo app', new.payload->>'title'), jsonb_build_object('scenarioId', new.id));
  end if;
  return new;
end $$;
create or replace trigger demo_scenarios_audit after insert or update or delete on demo_scenarios
for each row execute function audit_demo();

-- ---------- Cekat n8n node catalog (global knowledge for n8n workflows) ----------

create table if not exists n8n_node_skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  node_type text not null check (char_length(node_type) between 1 and 200),
  kind text not null default 'action' check (kind in ('trigger', 'action')),
  description text not null default '',
  -- The node as n8n exports it (parameters, typeVersion, credential type), without ids or credential ids.
  example jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger n8n_node_skills_touch before update on n8n_node_skills
for each row execute function touch_updated_at();
