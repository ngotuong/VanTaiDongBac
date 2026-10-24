-- Server-only registry for yearly workbook pairs and rollover audit runs.
-- Google Sheets remain the business source of truth. This registry only
-- resolves exact year/module pairs and records the administrative workflow.

create table if not exists public.workbook_contexts (
  year text primary key check (year ~ '^20[0-9]{2}$'),
  transport_spreadsheet_id text not null check (length(btrim(transport_spreadsheet_id)) >= 20),
  cashflow_spreadsheet_id text not null check (length(btrim(cashflow_spreadsheet_id)) >= 20),
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'ready', 'active', 'archived', 'failed')),
  source_year text null check (source_year is null or source_year ~ '^20[0-9]{2}$'),
  workbook_names jsonb not null default '{}'::jsonb,
  audit_summary jsonb not null default '{}'::jsonb,
  prepared_at timestamptz null,
  activated_at timestamptz null,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transport_spreadsheet_id <> cashflow_spreadsheet_id)
);

create unique index if not exists workbook_contexts_one_active_idx
  on public.workbook_contexts ((lifecycle_status))
  where lifecycle_status = 'active';

create table if not exists public.workbook_rollover_runs (
  run_id uuid primary key default gen_random_uuid(),
  source_year text not null check (source_year ~ '^20[0-9]{2}$'),
  target_year text not null check (target_year ~ '^20[0-9]{2}$'),
  status text not null default 'planned'
    check (status in ('planned', 'copying', 'auditing', 'ready', 'activating', 'active', 'failed', 'rolled_back', 'cancelled')),
  transport_target_id text null,
  cashflow_target_id text null,
  manifest_version text not null default '',
  plan jsonb not null default '{}'::jsonb,
  audit_report jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_year::integer = source_year::integer + 1),
  check (transport_target_id is null or cashflow_target_id is null or transport_target_id <> cashflow_target_id)
);

create index if not exists workbook_rollover_runs_target_updated_idx
  on public.workbook_rollover_runs (target_year, updated_at desc);

alter table public.workbook_contexts enable row level security;
alter table public.workbook_rollover_runs enable row level security;

revoke all on table public.workbook_contexts from public;
revoke all on table public.workbook_rollover_runs from public;
revoke all on table public.workbook_contexts from anon, authenticated;
revoke all on table public.workbook_rollover_runs from anon, authenticated;
grant select, insert, update, delete on table public.workbook_contexts to service_role;
grant select, insert, update, delete on table public.workbook_rollover_runs to service_role;

create or replace function public.activate_workbook_context(
  p_source_year text,
  p_target_year text,
  p_activated_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_count integer;
  target_count integer;
begin
  if p_source_year !~ '^20[0-9]{2}$' or p_target_year !~ '^20[0-9]{2}$'
     or p_target_year::integer <> p_source_year::integer + 1 then
    raise exception 'invalid workbook rollover years';
  end if;

  -- A lost HTTP response after commit is safe to retry. The exact completed
  -- transition returns successfully instead of attempting another update.
  if exists (
    select 1 from public.workbook_contexts
    where year = p_source_year and lifecycle_status = 'archived'
  ) and exists (
    select 1 from public.workbook_contexts
    where year = p_target_year
      and source_year = p_source_year
      and lifecycle_status = 'active'
  ) then
    return;
  end if;

  select count(*) into source_count
  from public.workbook_contexts
  where year = p_source_year and lifecycle_status = 'active';
  if source_count <> 1 then
    raise exception 'source workbook context is not active';
  end if;

  select count(*) into target_count
  from public.workbook_contexts
  where year = p_target_year
    and source_year = p_source_year
    and lifecycle_status = 'ready';
  if target_count <> 1 then
    raise exception 'target workbook context is not ready';
  end if;

  update public.workbook_contexts
  set lifecycle_status = 'archived', updated_at = p_activated_at
  where year = p_source_year and lifecycle_status = 'active';

  update public.workbook_contexts
  set lifecycle_status = 'active', activated_at = p_activated_at, updated_at = p_activated_at
  where year = p_target_year and lifecycle_status = 'ready';

  if not found then raise exception 'target workbook context activation failed'; end if;
end;
$$;

revoke all on function public.activate_workbook_context(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.activate_workbook_context(text, text, timestamptz) to service_role;

comment on table public.workbook_contexts is
  'Server-only exact year/module workbook registry. Spreadsheet IDs must never be returned to browsers.';
comment on table public.workbook_rollover_runs is
  'Server-only lifecycle and audit evidence for administrator-initiated yearly workbook provisioning.';
