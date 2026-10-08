-- Liftbook update: people can delete their own account from the app (Settings → Account → Delete account).
-- The App Store requires this. Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

-- Deleting the sign-in removes every row that belongs to it: user_state, workouts, body_entries and
-- food_entries all reference auth.users "on delete cascade". Feedback and error reports are kept, unlinked
-- ("on delete set null").
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- only a signed-in person can call it, and it only ever deletes that person
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
