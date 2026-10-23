-- Isolate Transport read models by workbook year without changing table shapes.
-- Existing 2026 rows are copied so the application can cut over before the
-- next background refresh. Legacy rows remain available for rollback.

insert into public.startup_bundles (form_type, payload, synced_at, created_at, updated_at)
select '2026:' || form_type, payload, synced_at, created_at, updated_at
from public.startup_bundles
where form_type !~ '^20[0-9]{2}:'
on conflict (form_type) do nothing;

insert into public.catalog_bundles (catalog_key, payload, synced_at, created_at, updated_at)
select 'transport:2026:' || catalog_key, payload, synced_at, created_at, updated_at
from public.catalog_bundles
where catalog_key ~ '^(catalogs|catalog_data):'
on conflict (catalog_key) do nothing;

insert into public.manage_data_bundles (sheet_name, filter_key, payload, synced_at, created_at, updated_at)
select '2026:' || sheet_name, filter_key, payload, synced_at, created_at, updated_at
from public.manage_data_bundles
where sheet_name !~ '^20[0-9]{2}:'
on conflict (sheet_name, filter_key) do nothing;

comment on table public.startup_bundles is
  'Transport startup cache. form_type uses <year>:<form_type>.';
comment on table public.catalog_bundles is
  'Shared catalog cache. Transport keys use transport:<year>:<legacy_key>; Fund keys already contain year.';
comment on table public.manage_data_bundles is
  'Transport manage and notification cache. sheet_name uses <year>:<sheet_name>.';
