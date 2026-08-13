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
-- drop table if exists public.stats;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  picture text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  -- Usage counter plus the start of the window it belongs to. When the window
  -- rolls over, the counter resets rather than being swept by a cron job.
  scans_used integer not null default 0,
  scan_period_start timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_renews_at timestamptz,
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
create index if not exists users_stripe_customer_idx on public.users (stripe_customer_id);

-- A single-row counter of every scan ever run, shown on the landing page. The
-- `id` check constrains the table to exactly one row, so the counter can never
-- be forked by an accidental insert.
create table if not exists public.stats (
  id boolean primary key default true check (id),
  total_scans bigint not null default 0
);

insert into public.stats (id, total_scans)
values (true, 0)
on conflict (id) do nothing;

-- The API talks to these tables with the secret/service-role key, which
-- bypasses RLS. Enabling RLS with no policies means the publishable (anon) key
-- can read nothing.
alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.stats enable row level security;

-- Claims one scan against the user's allowance, rolling the counter over if the
-- billing window has changed. Done in the database under a row lock so two
-- concurrent scans cannot both slip past the limit.
create or replace function public.consume_scan(
  p_user_id uuid,
  p_limit integer,
  p_period_start timestamptz
)
returns table (allowed boolean, used integer)
language plpgsql
as $$
declare
  v_used integer;
begin
  select case
           when u.scan_period_start is distinct from p_period_start then 0
           else u.scans_used
         end
    into v_used
    from public.users u
   where u.id = p_user_id
     for update;

  if v_used is null then
    return query select false, 0;
    return;
  end if;

  if v_used >= p_limit then
    update public.users
       set scans_used = v_used, scan_period_start = p_period_start
     where id = p_user_id;
    return query select false, v_used;
    return;
  end if;

  update public.users
     set scans_used = v_used + 1,
         scan_period_start = p_period_start,
         updated_at = now()
   where id = p_user_id;

  -- Lifetime counter for the landing page. Incremented here so it can never
  -- drift from the scans that were actually allowed.
  update public.stats set total_scans = total_scans + 1 where id;

  return query select true, v_used + 1;
end;
$$;

-- Supabase stopped auto-exposing new public tables to the Data API in 2026, and
-- that removed the implicit grants for service_role too. Without these, every
-- API call fails with "permission denied for table users". BYPASSRLS does not
-- substitute for a missing GRANT.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.accounts to service_role;
grant select, insert, update on public.stats to service_role;
grant execute on function public.consume_scan(uuid, integer, timestamptz) to service_role;
