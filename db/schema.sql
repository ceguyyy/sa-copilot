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

create or replace trigger document_versions_number
before insert on document_versions
for each row execute function set_version_no();

create or replace function touch_document()
returns trigger language plpgsql as $$
begin
  update documents set updated_at = now() where id = new.document_id;
  return new;
end $$;

create or replace trigger document_versions_touch
after insert on document_versions
for each row execute function touch_document();

-- Versions are append-only; enforced in the DB since there is no RLS locally.
create or replace function forbid_version_change()
returns trigger language plpgsql as $$
begin
  raise exception 'document_versions is append-only';
end $$;

create or replace trigger document_versions_immutable
before update on document_versions
for each row execute function forbid_version_change();

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

alter table documents drop constraint if exists documents_type_check;
alter table documents add constraint documents_type_check
  check (type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'diagram', 'custom'));
alter table skills drop constraint if exists skills_output_type_check;
alter table skills add constraint skills_output_type_check
  check (output_type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'diagram', 'custom', 'chat'));
