-- Run in your existing Supabase project's SQL editor, using the postgres owner role.
-- Separate private schema: no changes to healthcare/demo tables, no public REST access.
create schema if not exists sa_copilot_sync;
revoke all on schema sa_copilot_sync from public, anon, authenticated;
create table if not exists sa_copilot_sync.workspaces (
  id text primary key,
  revision integer not null default 0
);
create table if not exists sa_copilot_sync.snapshots (
  workspace_id text not null references sa_copilot_sync.workspaces(id),
  revision integer not null,
  device text not null,
  updated_at timestamptz not null default now(),
  data bytea not null,
  primary key (workspace_id, revision)
);
revoke all on all tables in schema sa_copilot_sync from public, anon, authenticated;
