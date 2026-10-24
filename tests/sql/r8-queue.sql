-- Disposable local PostgreSQL only. Runner has no network and no live credentials.
begin;
insert into write_jobs(id,module,action,status,payload,attempts,max_attempts,claimed_at) values
 ('exhausted','fund','addFundLoan','processing','{}',3,3,now()-interval '16 minutes'),
 ('pending-exhausted','fund','addFundLoan','pending','{}',3,3,null),
 ('live-lease','fund','addFundLoan','processing','{}',3,3,now()),
 ('stale-retry','fund','addFundLoan','processing','{}',1,3,now()-interval '16 minutes'),
 ('not-stale','fund','addFundLoan','processing','{}',1,3,now()-interval '5 minutes');
do $$ declare n integer; begin
 select count(*) into n from claim_write_jobs(20,'r8-worker',60);
 if n <> 1 then raise exception 'expected only stale-retry claim, got %',n; end if;
 if (select attempts from write_jobs where id='stale-retry') <> 2 then raise exception 'attempt not incremented'; end if;
 if (select count(*) from write_jobs where id in ('exhausted','pending-exhausted') and status='failed' and last_error like 'REQUIRES_RECONCILIATION:%') <> 2 then raise exception 'exhausted lease must terminate'; end if;
 if (select count(*) from write_job_logs where job_id in ('exhausted','pending-exhausted') and status='failed') <> 2 then raise exception 'terminal audit logs missing'; end if;
 if (select status from write_jobs where id='live-lease') <> 'processing' then raise exception 'active lease changed'; end if;
 if (select worker_id from write_jobs where id='not-stale') is not null then raise exception '900-second minimum ignored'; end if;
 if has_function_privilege('anon','claim_write_jobs(integer,text,integer)','execute') or has_function_privilege('authenticated','claim_write_jobs(integer,text,integer)','execute') then raise exception 'browser role can claim'; end if;
 if not has_function_privilege('service_role','claim_write_jobs(integer,text,integer)','execute') then raise exception 'service cannot claim'; end if;
 if has_table_privilege('authenticated','write_jobs','select') or has_table_privilege('anon','write_jobs','select') then raise exception 'queue readable by browser'; end if;
 if has_table_privilege('authenticated','payroll_explanation_bundles','select') then raise exception 'payroll accessible to browser'; end if;
 perform * from claim_write_jobs(20,'r8-repeat',900);
 if (select count(*) from write_job_logs where job_id in ('exhausted','pending-exhausted')) <> 2 then raise exception 'reaper duplicated logs'; end if;
end $$;
rollback;
