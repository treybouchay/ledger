-- Run once in Supabase SQL Editor (cloud sync version history).

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

alter table public.ledger_snapshots enable row level security;

drop policy if exists ledger_snapshots_all on public.ledger_snapshots;
create policy ledger_snapshots_all on public.ledger_snapshots
  for all using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));
