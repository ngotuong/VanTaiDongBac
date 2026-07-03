-- Phase 2 cache tables for near-realtime dashboard and fund/cashflow reads.
-- Google Sheets remain the source of truth. Apps Script writes these tables.

create table if not exists public.fund_overview_bundles (
  year text not null,
  month_key text not null default '',
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (year, month_key)
);

create table if not exists public.fund_transaction_bundles (
  year text not null,
  filter_key text not null,
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (year, filter_key)
);

create table if not exists public.fund_loan_bundles (
  year text not null,
  month_key text not null default '',
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (year, month_key)
);

create table if not exists public.sync_status (
  sync_key text primary key,
  module text not null,
  status text not null,
  message text not null default '',
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_fund_overview_bundles_updated_at on public.fund_overview_bundles;
create trigger set_fund_overview_bundles_updated_at
before update on public.fund_overview_bundles
for each row
execute function public.set_cache_updated_at();

drop trigger if exists set_fund_transaction_bundles_updated_at on public.fund_transaction_bundles;
create trigger set_fund_transaction_bundles_updated_at
before update on public.fund_transaction_bundles
for each row
execute function public.set_cache_updated_at();

drop trigger if exists set_fund_loan_bundles_updated_at on public.fund_loan_bundles;
create trigger set_fund_loan_bundles_updated_at
before update on public.fund_loan_bundles
for each row
execute function public.set_cache_updated_at();

drop trigger if exists set_sync_status_updated_at on public.sync_status;
create trigger set_sync_status_updated_at
before update on public.sync_status
for each row
execute function public.set_cache_updated_at();

alter table public.fund_overview_bundles enable row level security;
alter table public.fund_transaction_bundles enable row level security;
alter table public.fund_loan_bundles enable row level security;
alter table public.sync_status enable row level security;

drop policy if exists "Allow public read fund overview bundles" on public.fund_overview_bundles;
create policy "Allow public read fund overview bundles"
on public.fund_overview_bundles
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public read fund transaction bundles" on public.fund_transaction_bundles;
create policy "Allow public read fund transaction bundles"
on public.fund_transaction_bundles
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public read fund loan bundles" on public.fund_loan_bundles;
create policy "Allow public read fund loan bundles"
on public.fund_loan_bundles
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public read sync status" on public.sync_status;
create policy "Allow public read sync status"
on public.sync_status
for select
to anon, authenticated
using (true);

grant select on public.fund_overview_bundles to anon, authenticated;
grant select on public.fund_transaction_bundles to anon, authenticated;
grant select on public.fund_loan_bundles to anon, authenticated;
grant select on public.sync_status to anon, authenticated;
