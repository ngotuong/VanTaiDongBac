create table if not exists public.payroll_explanation_bundles (
  spreadsheet_id text not null,
  report_month text not null,
  employee_key text not null,
  employee_name text not null,
  payload jsonb not null,
  reconciliation_status text not null,
  source_data_version text not null,
  source_hash text not null,
  is_current boolean not null default true,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (spreadsheet_id, report_month, employee_key),
  constraint payroll_explanation_month_check check (report_month ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'),
  constraint payroll_explanation_employee_key_check check (char_length(employee_key) between 1 and 160),
  constraint payroll_explanation_status_check check (reconciliation_status in ('matched', 'pending', 'needs_review')),
  constraint payroll_explanation_source_hash_check check (source_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists payroll_explanation_bundles_synced_at_idx
  on public.payroll_explanation_bundles (synced_at desc);

create index if not exists payroll_explanation_bundles_current_lookup_idx
  on public.payroll_explanation_bundles (spreadsheet_id, report_month, employee_key)
  where is_current = true;

create or replace function public.set_payroll_explanation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payroll_explanation_bundles_updated_at on public.payroll_explanation_bundles;
create trigger payroll_explanation_bundles_updated_at
before update on public.payroll_explanation_bundles
for each row execute function public.set_payroll_explanation_updated_at();

alter table public.payroll_explanation_bundles enable row level security;

revoke all on public.payroll_explanation_bundles from public, anon, authenticated;
grant all on public.payroll_explanation_bundles to service_role;

comment on table public.payroll_explanation_bundles is
  'Server-only evidence bundles explaining one employee payroll row for one workbook month. Google Sheets remains the source of truth.';
comment on column public.payroll_explanation_bundles.payload is
  'Read-only explanation and reconciliation evidence; never an authoritative payroll calculation.';
