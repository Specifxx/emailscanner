-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- One `users` row per person. One `accounts` row per connected mailbox, so a
-- single person can attach several Gmail and Outlook inboxes and scan them all
-- at once.
--
-- UPGRADING? An earlier version of this file created a single-provider `users`
-- table with a `google_id` column. `create table if not exists` will NOT
-- replace it, and every sign-in then fails on the missing column. If you ran
-- that version, uncomment the next two lines to start clean. This deletes all
-- connected mailboxes — everyone just signs in again.
--
-- drop table if exists public.accounts;
-- drop table if exists public.users;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  picture text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  provider_id text not null,
  email text not null,
  name text,
  picture text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A given mailbox can only be attached to one person.
  unique (provider, provider_id)
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- The API talks to these tables with the secret/service-role key, which
-- bypasses RLS. Enabling RLS with no policies means the publishable (anon) key
-- can read nothing.
alter table public.users enable row level security;
alter table public.accounts enable row level security;

-- Supabase stopped auto-exposing new public tables to the Data API in 2026, and
-- that removed the implicit grants for service_role too. Without these, every
-- API call fails with "permission denied for table users". BYPASSRLS does not
-- substitute for a missing GRANT.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.accounts to service_role;
