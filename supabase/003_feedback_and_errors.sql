-- Liftbook update: tester feedback and crash reports. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again. Anyone using the app can add rows; nobody can read them from the app.
-- Read them yourself in the dashboard: Table Editor → feedback / client_errors.

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
