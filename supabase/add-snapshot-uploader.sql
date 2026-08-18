-- Optional: show who uploaded each sync snapshot (person + login email).
-- Run in Supabase SQL Editor. The app still works without this — new saves
-- put the name and email in the snapshot label — but this maps older rows
-- and stores identity in dedicated columns.

alter table public.ledger_snapshots
  add column if not exists created_by_email text;

alter table public.ledger_snapshots
  add column if not exists person_id text;

create or replace function public.household_member_identities()
returns table (user_id uuid, person_id text, email text)
language sql
security definer
set search_path = public
stable
as $$
  select m.user_id, m.person_id, u.email::text
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id in (select public.user_household_ids());
$$;

grant execute on function public.household_member_identities() to authenticated;
