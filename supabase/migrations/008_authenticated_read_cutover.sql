-- Cut cache/queue reads over from anon to authenticated allowlisted users.
-- Apply only after migration 007, at least one allowlisted email, OAuth, proxy and frontend are ready.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'report_bundles',
    'fund_overview_bundles',
    'fund_transaction_bundles',
    'fund_loan_bundles',
    'sync_status',
    'startup_bundles',
    'catalog_bundles',
    'manage_data_bundles',
    'write_jobs',
    'write_job_logs'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', 'Authenticated internal read', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_app_user())',
      'Authenticated internal read',
      target_table
    );
    execute format('revoke all on public.%I from anon', target_table);
    execute format('grant select on public.%I to authenticated', target_table);
  end loop;
end $$;

drop policy if exists "Allow public read report bundles" on public.report_bundles;
drop policy if exists "Allow public read fund overview bundles" on public.fund_overview_bundles;
drop policy if exists "Allow public read fund transaction bundles" on public.fund_transaction_bundles;
drop policy if exists "Allow public read fund loan bundles" on public.fund_loan_bundles;
drop policy if exists "Allow public read sync status" on public.sync_status;
drop policy if exists "Allow public read startup bundles" on public.startup_bundles;
drop policy if exists "Allow public read catalog bundles" on public.catalog_bundles;
drop policy if exists "Allow public read manage data bundles" on public.manage_data_bundles;
drop policy if exists "Allow public read write jobs" on public.write_jobs;
drop policy if exists "Allow public read write job logs" on public.write_job_logs;
