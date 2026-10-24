-- Remediation R1: keep operational internals behind the service-role proxy and
-- replace one payroll explanation month atomically.

drop policy if exists "Authenticated internal read" on public.catalog_bundles;
drop policy if exists "Authenticated internal read" on public.sync_status;
drop policy if exists "Authenticated internal read" on public.write_jobs;
drop policy if exists "Authenticated internal read" on public.write_job_logs;

revoke all on public.catalog_bundles from public, anon, authenticated;
revoke all on public.sync_status from public, anon, authenticated;
revoke all on public.write_jobs from public, anon, authenticated;
revoke all on public.write_job_logs from public, anon, authenticated;

grant all on public.catalog_bundles to service_role;
grant all on public.sync_status to service_role;
grant all on public.write_jobs to service_role;
grant all on public.write_job_logs to service_role;

create or replace function public.replace_payroll_explanation_month(
  p_spreadsheet_id text,
  p_report_month text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  replaced_count integer := 0;
begin
  if coalesce(btrim(p_spreadsheet_id), '') = '' then
    raise exception 'spreadsheet id is required';
  end if;
  if p_report_month !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$' then
    raise exception 'invalid report month';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as incoming(spreadsheet_id text, report_month text)
    where incoming.spreadsheet_id is distinct from p_spreadsheet_id
       or incoming.report_month is distinct from p_report_month
  ) then
    raise exception 'row scope does not match requested workbook month';
  end if;

  update public.payroll_explanation_bundles
  set is_current = false
  where spreadsheet_id = p_spreadsheet_id
    and report_month = p_report_month
    and is_current = true;

  insert into public.payroll_explanation_bundles (
    spreadsheet_id, report_month, employee_key, employee_name, payload,
    reconciliation_status, source_data_version, source_hash, is_current, synced_at
  )
  select spreadsheet_id, report_month, employee_key, employee_name, payload,
    reconciliation_status, source_data_version, source_hash, true, synced_at
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as incoming(
    spreadsheet_id text, report_month text, employee_key text, employee_name text,
    payload jsonb, reconciliation_status text, source_data_version text,
    source_hash text, is_current boolean, synced_at timestamptz
  )
  on conflict (spreadsheet_id, report_month, employee_key) do update set
    employee_name = excluded.employee_name,
    payload = excluded.payload,
    reconciliation_status = excluded.reconciliation_status,
    source_data_version = excluded.source_data_version,
    source_hash = excluded.source_hash,
    is_current = true,
    synced_at = excluded.synced_at;

  get diagnostics replaced_count = row_count;
  return replaced_count;
end;
$$;

revoke all on function public.replace_payroll_explanation_month(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_payroll_explanation_month(text, text, jsonb) to service_role;
