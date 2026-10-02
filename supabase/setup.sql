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

-- ---------------------------------------------------------------
-- Tester feedback and crash reports (also available alone as 003_feedback_and_errors.sql)
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null default auth.uid(),
  email       text,
  kind        text not null default 'other',
  message     text not null check (char_length(message) between 1 and 4000),
  screen      text,
  app_version text,
  device      text
);

create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null default auth.uid(),
  message     text not null check (char_length(message) <= 1000),
  stack       text check (char_length(stack) <= 4000),
  screen      text,
  app_version text,
  device      text
);

alter table public.feedback      enable row level security;
alter table public.client_errors enable row level security;

-- insert only: signed-in testers are tagged with their own id, signed-out ones send anonymously
drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "anyone can report errors" on public.client_errors;
create policy "anyone can report errors" on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- Food logging (also available alone as 004_food_entries.sql)
create table if not exists public.food_entries (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  kind       text not null default 'log',
  date       bigint not null default 0,
  updated_at bigint not null default 0,
  deleted    boolean not null default false,
  data       jsonb,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists food_entries_user_synced on public.food_entries (user_id, synced_at);

drop trigger if exists food_entries_touch on public.food_entries;
create trigger food_entries_touch before insert or update on public.food_entries
  for each row execute function public.touch_synced_at();

alter table public.food_entries enable row level security;

drop policy if exists "own food entries" on public.food_entries;
create policy "own food entries" on public.food_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
