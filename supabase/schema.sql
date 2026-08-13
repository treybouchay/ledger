-- Household Ledger — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor (New query → Run).

-- ---------------------------------------------------------------------------
-- Households & membership
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Household',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id text check (person_id in ('trevor', 'kate')),
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_id_idx
  on public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- Ledger tables (household-scoped)
-- ---------------------------------------------------------------------------

create table if not exists public.transactions (
  id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  person_id text not null check (person_id in ('trevor', 'kate')),
  month_id text not null,
  date date not null,
  amount numeric(12, 2) not null,
  merchant text not null,
  account_id text not null,
  category_id text not null,
  notes text,
  is_refund boolean not null default false,
  is_cash_in boolean not null default false,
  source text not null check (source in ('seed', 'manual', 'csv')),
  import_id text,
  source_file text,
  updated_at timestamptz not null default now(),
  primary key (id, household_id)
);

create index if not exists transactions_household_idx
  on public.transactions (household_id);

create table if not exists public.statement_imports (
  id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  file_name text not null,
  uploaded_at timestamptz not null,
  person_id text not null check (person_id in ('trevor', 'kate')),
  primary_account_id text not null,
  month_ids text[] not null default '{}',
  transaction_count integer not null default 0,
  net_amount numeric(12, 2) not null default 0,
  has_stored_file boolean not null default false,
  mime_type text,
  source_kind text check (source_kind in ('statement', 'screenshot')),
  storage_path text,
  updated_at timestamptz not null default now(),
  primary key (id, household_id)
);

create index if not exists statement_imports_household_idx
  on public.statement_imports (household_id);

create table if not exists public.custom_categories (
  id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  label text not null,
  icon text not null,
  kind text not null check (kind in ('fixed', 'variable')),
  ledger_tracked boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (id, household_id)
);

create table if not exists public.custom_accounts (
  id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  label text not null,
  icon text not null,
  owner text not null check (owner in ('trevor', 'kate', 'shared')),
  updated_at timestamptz not null default now(),
  primary key (id, household_id)
);

create table if not exists public.budget_overrides (
  household_id uuid not null references public.households (id) on delete cascade,
  person_id text not null check (person_id in ('trevor', 'kate')),
  category_id text not null,
  amount numeric(12, 2) not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, person_id, category_id)
);

create table if not exists public.income_overrides (
  household_id uuid not null references public.households (id) on delete cascade,
  person_id text not null check (person_id in ('trevor', 'kate')),
  amount numeric(12, 2) not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, person_id)
);

create table if not exists public.learned_rules (
  id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  pattern text not null,
  category_id text not null,
  account_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (id, household_id)
);

create table if not exists public.gear_state (
  household_id uuid primary key references public.households (id) on delete cascade,
  opening_balance numeric(12, 2) not null default 0,
  months jsonb not null default '[]',
  cash jsonb not null default '[]',
  keep_list jsonb not null default '[]',
  projected_targets jsonb not null default '{}',
  projected_manual_rows jsonb not null default '[]',
  projected_attached_buys jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Point-in-time ledger JSON after explicit Save / Upload (keep last 10 in app).
create table if not exists public.ledger_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  label text,
  device_label text,
  transaction_count integer not null default 0,
  import_count integer not null default 0,
  payload jsonb not null
);

create index if not exists ledger_snapshots_household_created_idx
  on public.ledger_snapshots (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS helper
-- ---------------------------------------------------------------------------

create or replace function public.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

-- Create household + membership in one step (avoids RLS chicken-and-egg on insert…select).
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
  -- Reuse existing membership if any
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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions enable row level security;
alter table public.statement_imports enable row level security;
alter table public.custom_categories enable row level security;
alter table public.custom_accounts enable row level security;
alter table public.budget_overrides enable row level security;
alter table public.income_overrides enable row level security;
alter table public.learned_rules enable row level security;
alter table public.gear_state enable row level security;
alter table public.ledger_snapshots enable row level security;

-- Households: members can read; authenticated users can create
create policy households_select on public.households
  for select using (id in (select public.user_household_ids()));

create policy households_insert on public.households
  for insert to authenticated with check (true);

-- Members: read own rows; insert self into a household
create policy members_select on public.household_members
  for select using (household_id in (select public.user_household_ids()));

create policy members_insert on public.household_members
  for insert to authenticated with check (user_id = auth.uid());

-- Generic household-scoped policies
create policy transactions_all on public.transactions
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy statement_imports_all on public.statement_imports
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy custom_categories_all on public.custom_categories
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy custom_accounts_all on public.custom_accounts
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy budget_overrides_all on public.budget_overrides
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy income_overrides_all on public.income_overrides
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy learned_rules_all on public.learned_rules
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy gear_state_all on public.gear_state
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

create policy ledger_snapshots_all on public.ledger_snapshots
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

-- ---------------------------------------------------------------------------
-- Storage bucket for statement PDFs / screenshots
-- Create bucket in Dashboard → Storage → New bucket: statement-files (private)
-- Then run the policies below.
-- ---------------------------------------------------------------------------

-- insert into storage.buckets (id, name, public) values ('statement-files', 'statement-files', false);

-- create policy "statement files read"
-- on storage.objects for select to authenticated
-- using (
--   bucket_id = 'statement-files'
--   and (storage.foldername(name))[1]::uuid in (select public.user_household_ids())
-- );

-- create policy "statement files write"
-- on storage.objects for insert to authenticated
-- with check (
--   bucket_id = 'statement-files'
--   and (storage.foldername(name))[1]::uuid in (select public.user_household_ids())
-- );

-- create policy "statement files delete"
-- on storage.objects for delete to authenticated
-- using (
--   bucket_id = 'statement-files'
--   and (storage.foldername(name))[1]::uuid in (select public.user_household_ids())
-- );
