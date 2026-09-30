-- Liftbook database setup. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again; it only creates what's missing.

-- One row per person: settings, program, and any workout in progress.
-- Each *_at column is the phone's timestamp (ms) of the last change, so the newest edit wins.
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  profile    jsonb,
  program    jsonb,
  active     jsonb,
  profile_at bigint not null default 0,
  program_at bigint not null default 0,
  active_at  bigint not null default 0
);

-- One row per finished workout. Deleted workouts stay as tombstones (deleted = true)
-- so other devices learn about the deletion.
create table if not exists public.workouts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  started_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted    boolean not null default false,
  data       jsonb,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists workouts_user_synced on public.workouts (user_id, synced_at);

-- Server-side stamp on every write; devices pull "everything since my last cursor".
create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists workouts_touch on public.workouts;
create trigger workouts_touch before insert or update on public.workouts
  for each row execute function public.touch_synced_at();

-- Row-level security: every person can read and write only their own rows.
alter table public.user_state enable row level security;
alter table public.workouts   enable row level security;

drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Weigh-ins and body scans (also available alone as 002_body_entries.sql)
create table if not exists public.body_entries (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  kind       text not null default 'weight',
  date       bigint not null default 0,
  updated_at bigint not null default 0,
  deleted    boolean not null default false,
  data       jsonb,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists body_entries_user_synced on public.body_entries (user_id, synced_at);

drop trigger if exists body_entries_touch on public.body_entries;
create trigger body_entries_touch before insert or update on public.body_entries
  for each row execute function public.touch_synced_at();

alter table public.body_entries enable row level security;

drop policy if exists "own body entries" on public.body_entries;
create policy "own body entries" on public.body_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
