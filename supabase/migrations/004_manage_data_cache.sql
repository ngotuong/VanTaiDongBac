-- Phase 4 cache table for read-only operations/manage list views.
-- Google Sheets remain the source of truth. Apps Script writes this cache.

create table if not exists public.manage_data_bundles (
  sheet_name text not null,
  filter_key text not null,
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sheet_name, filter_key)
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

drop trigger if exists set_manage_data_bundles_updated_at on public.manage_data_bundles;
create trigger set_manage_data_bundles_updated_at
before update on public.manage_data_bundles
for each row
execute function public.set_cache_updated_at();

alter table public.manage_data_bundles enable row level security;

drop policy if exists "Allow public read manage data bundles" on public.manage_data_bundles;
create policy "Allow public read manage data bundles"
on public.manage_data_bundles
for select
to anon, authenticated
using (true);

grant select on public.manage_data_bundles to anon, authenticated;
