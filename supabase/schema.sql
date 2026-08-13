-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text not null,
  name text,
  picture text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_google_id_idx on public.users (google_id);

-- The API talks to this table with the service-role key, which bypasses RLS.
-- Enabling RLS with no policies means the anon/public key can read nothing.
alter table public.users enable row level security;
