-- Phase 1 Supabase cache for VanTaiDongBac reports.
-- Source of truth remains Google Sheets. Apps Script writes this table manually.

create table if not exists public.report_bundles (
  spreadsheet_id text not null,
  report_month text not null,
  source_sheet_names text[] not null default array[]::text[],
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (spreadsheet_id, report_month)
);

create index if not exists report_bundles_synced_at_idx
  on public.report_bundles (synced_at desc);

create or replace function public.set_report_bundles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_report_bundles_updated_at on public.report_bundles;
create trigger set_report_bundles_updated_at
before update on public.report_bundles
for each row
execute function public.set_report_bundles_updated_at();

alter table public.report_bundles enable row level security;

drop policy if exists "Allow public read report bundles" on public.report_bundles;
create policy "Allow public read report bundles"
on public.report_bundles
for select
to anon, authenticated
using (true);

grant select on public.report_bundles to anon, authenticated;
