-- Synthetic data in disposable Postgres only. Verify both cache writers coexist.
set role service_role;
select replace_payroll_explanation_month('isolation-sheet','09/2026',
 '[{"spreadsheet_id":"isolation-sheet","report_month":"09/2026","employee_key":"canary","employee_name":"Canary","payload":{"contractVersion":"payroll-explanation-v5","amount":100},"reconciliation_status":"matched","source_data_version":"same-source","source_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","synced_at":"2026-10-04T00:00:00Z"}]');
select replace_payroll_explanation_month_v6('isolation-sheet','09/2026',
 '[{"spreadsheet_id":"isolation-sheet","report_month":"09/2026","employee_key":"canary","employee_name":"Canary","payload":{"contractVersion":"payroll-explanation-v6","amount":200},"reconciliation_status":"matched","source_data_version":"same-source","source_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","synced_at":"2026-10-04T00:00:00Z"}]');
-- A later legacy refresh must not invalidate v6.
select replace_payroll_explanation_month('isolation-sheet','09/2026',
 '[{"spreadsheet_id":"isolation-sheet","report_month":"09/2026","employee_key":"canary","employee_name":"Canary","payload":{"contractVersion":"payroll-explanation-v5","amount":101},"reconciliation_status":"matched","source_data_version":"same-source","source_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","synced_at":"2026-10-04T00:01:00Z"}]');
reset role;
do $$ begin
 if not exists(select 1 from public.payroll_explanation_bundles where spreadsheet_id='isolation-sheet' and is_current and payload->>'amount'='101') then raise exception 'legacy cache changed'; end if;
 if not exists(select 1 from public.payroll_explanation_bundles_v6 where spreadsheet_id='isolation-sheet' and is_current and payload->>'amount'='200') then raise exception 'v6 cache invalidated by legacy'; end if;
 begin
  perform replace_payroll_explanation_month_v6('isolation-sheet',null,'[]');
  raise exception 'null month accepted';
 exception when others then
  if sqlerrm <> 'invalid report month' then raise; end if;
 end;
 begin
  perform replace_payroll_explanation_month_v6('isolation-sheet','09/2026','[{"spreadsheet_id":"wrong","report_month":"09/2026","payload":{"contractVersion":"payroll-explanation-v6"}}]');
  raise exception 'scope rejection missing';
 exception when others then
  if sqlerrm <> 'row scope does not match requested workbook month' then raise; end if;
 end;
 begin
  perform replace_payroll_explanation_month_v6('isolation-sheet','09/2026','[{"spreadsheet_id":"isolation-sheet","report_month":"09/2026","payload":{"contractVersion":"payroll-explanation-v5"}}]');
  raise exception 'contract rejection missing';
 exception when others then
  if sqlerrm <> 'v6 payroll payload required' then raise; end if;
 end;
 if not exists(select 1 from public.payroll_explanation_bundles_v6 where spreadsheet_id='isolation-sheet' and is_current and payload->>'amount'='200') then raise exception 'failed replacement changed current rows'; end if;
 if not (select relrowsecurity from pg_class where oid='public.payroll_explanation_bundles_v6'::regclass) then raise exception 'RLS disabled'; end if;
 if has_table_privilege('anon','public.payroll_explanation_bundles_v6','SELECT') or has_table_privilege('authenticated','public.payroll_explanation_bundles_v6','SELECT') then raise exception 'browser privilege leaked'; end if;
end $$;
