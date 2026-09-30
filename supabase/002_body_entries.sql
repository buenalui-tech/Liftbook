-- Liftbook update: weigh-ins and body scans. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again.

-- One row per weigh-in or body scan (kind = 'weight' or 'scan'). Deleted entries stay as tombstones.
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
