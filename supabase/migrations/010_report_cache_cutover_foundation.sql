-- E1.1 foundation for moving the monthly report detail cache out of Google Sheets.
-- This migration is additive: existing report_bundles rows and the current
-- (spreadsheet_id, report_month) primary key remain unchanged.

alter table public.report_bundles
  add column if not exists cache_version text,
  add column if not exists source_data_version text,
  add column if not exists details_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_bundles_details_hash_format'
      and conrelid = 'public.report_bundles'::regclass
  ) then
    alter table public.report_bundles
      add constraint report_bundles_details_hash_format
      check (details_hash is null or details_hash ~ '^[0-9a-f]{64}$')
      not valid;
  end if;
end
$$;

alter table public.report_bundles
  validate constraint report_bundles_details_hash_format;

create index if not exists report_bundles_cache_version_lookup_idx
  on public.report_bundles (
    spreadsheet_id,
    cache_version,
    source_data_version,
    report_month
  );

comment on column public.report_bundles.cache_version is
  'Apps Script report detail cache schema version, for example v13.';

comment on column public.report_bundles.source_data_version is
  'Google Sheets report data version used to build this bundle.';

comment on column public.report_bundles.details_hash is
  'Lowercase SHA-256 of the normalized overview.details matrix.';
