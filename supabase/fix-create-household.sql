-- Run this once in Supabase SQL Editor if magic-link sign-in
-- still shows the email form (household create was blocked by RLS).

create or replace function public.create_household(p_name text default 'Household')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = auth.uid()
  limit 1;
  if hid is not null then
    return hid;
  end if;

  insert into public.households (name)
  values (coalesce(nullif(trim(p_name), ''), 'Household'))
  returning id into hid;

  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid());

  return hid;
end;
$$;

grant execute on function public.create_household(text) to authenticated;
