-- Phase 3 cache tables for fast initial load and catalog reads.
-- Google Sheets remain the source of truth. Apps Script writes these tables.

create table if not exists public.startup_bundles (
  form_type text primary key,
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_bundles (
  catalog_key text primary key,
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
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

drop trigger if exists set_startup_bundles_updated_at on public.startup_bundles;
create trigger set_startup_bundles_updated_at
before update on public.startup_bundles
for each row
execute function public.set_cache_updated_at();

drop trigger if exists set_catalog_bundles_updated_at on public.catalog_bundles;
create trigger set_catalog_bundles_updated_at
before update on public.catalog_bundles
for each row
execute function public.set_cache_updated_at();

alter table public.startup_bundles enable row level security;
alter table public.catalog_bundles enable row level security;

drop policy if exists "Allow public read startup bundles" on public.startup_bundles;
create policy "Allow public read startup bundles"
on public.startup_bundles
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public read catalog bundles" on public.catalog_bundles;
create policy "Allow public read catalog bundles"
on public.catalog_bundles
for select
to anon, authenticated
using (true);

grant select on public.startup_bundles to anon, authenticated;
grant select on public.catalog_bundles to anon, authenticated;
