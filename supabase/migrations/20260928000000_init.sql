-- SA Copilot: projects, sources, skills, versioned documents, chat.
-- Single-user app: every row is owned by auth.uid() and protected by RLS.

create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
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
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete cascade,
  kind text not null check (kind in ('requirement', 'knowledge')),
  name text not null,
  mime_type text,
  storage_path text,
  extracted_text text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index sources_project_idx on public.sources (project_id, kind);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  output_type text not null
    check (output_type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'diagram', 'chat')),
  description text not null default '',
  instructions text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skills_type_idx on public.skills (output_type);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  type text not null
    check (type in ('assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'diagram')),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_project_idx on public.documents (project_id, type);

-- Immutable history: rows are only ever inserted. Restore = insert a copy.
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  version_no integer not null,
  content jsonb not null,
  note text not null default '',
  origin text not null default 'manual' check (origin in ('ai', 'manual', 'restore')),
  skill_id uuid references public.skills on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index messages_project_idx on public.messages (project_id, created_at);

-- ---------- triggers ----------

create or replace function public.set_version_no()
returns trigger language plpgsql as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
  from public.document_versions where document_id = new.document_id;
  return new;
end $$;

create trigger document_versions_number
before insert on public.document_versions
for each row execute function public.set_version_no();

create or replace function public.touch_document()
returns trigger language plpgsql as $$
begin
  update public.documents set updated_at = now() where id = new.document_id;
  return new;
end $$;

create trigger document_versions_touch
after insert on public.document_versions
for each row execute function public.touch_document();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
for each row execute function public.touch_updated_at();
create trigger skills_touch before update on public.skills
for each row execute function public.touch_updated_at();

-- ---------- RLS ----------

alter table public.projects enable row level security;
alter table public.sources enable row level security;
alter table public.skills enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.messages enable row level security;

create policy owner_all on public.projects for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.sources for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.skills for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.documents for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.messages for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- versions: read + insert only (no update/delete => immutable history)
create policy owner_select on public.document_versions for select
  using (owner_id = auth.uid());
create policy owner_insert on public.document_versions for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  );

-- ---------- storage ----------

insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

-- Files live under "<auth.uid()>/..." so the first folder segment is the owner.
create policy sources_owner_read on storage.objects for select
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy sources_owner_write on storage.objects for insert
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy sources_owner_delete on storage.objects for delete
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
