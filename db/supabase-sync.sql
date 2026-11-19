-- Run in your existing Supabase project's SQL editor, using the postgres owner role.
-- Separate private schema: no changes to healthcare/demo tables, no public REST access.
create schema if not exists sa_copilot_sync;
revoke all on schema sa_copilot_sync from public, anon, authenticated;
-- v2.0 accounts: application password hashes only; never plaintext passwords.
create table if not exists sa_copilot_sync.accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
-- Single-use recovery codes: only SHA-256 digests are stored.
create table if not exists sa_copilot_sync.account_recovery (
  account_id uuid primary key references sa_copilot_sync.accounts(id) on delete cascade,
  code_hash text unique not null,
  created_at timestamptz not null default now()
);
-- v2.0 workspace IDs are account:<account UUID>; old shared workspaces remain untouched.
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
-- v2.1 snapshots list their upload files by SHA-256; each file is stored once per workspace in blobs.
-- The app creates both on the first upload when they are missing; older full snapshots keep blob_hashes null.
alter table sa_copilot_sync.snapshots add column if not exists blob_hashes text[];
create table if not exists sa_copilot_sync.blobs (
  workspace_id text not null references sa_copilot_sync.workspaces(id),
  hash text not null,
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, hash)
);
revoke all on all tables in schema sa_copilot_sync from public, anon, authenticated;
