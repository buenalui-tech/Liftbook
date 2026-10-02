-- Liftbook update: food logging. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again.

-- One row per logged food (kind = 'log') or saved custom food (kind = 'food'). Deleted rows stay as tombstones.
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
