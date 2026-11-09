import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const name = `vtdb-r8-test-${process.pid}`;
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
const sql = (input) => docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input });
try {
  docker(['run', '--detach', '--rm', '--name', name, '--network', 'none', '--env', 'POSTGRES_PASSWORD=r8-isolated-test-only', 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24']);
  for (let attempt = 0; attempt < 150; attempt++) {
    try { sql('select 1'); break; } catch (error) { if (attempt === 149) throw error; await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated, service_role;`);
  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    if (file === '019_multi_year_cache_namespace.sql') {
      sql(`insert into startup_bundles(form_type,payload) values ('vanChuyen','{"source":"legacy"}');
        insert into catalog_bundles(catalog_key,payload) values ('catalogs:all','{"source":"legacy"}'),('fund_catalog:2026:partners','{"source":"fund"}');
        insert into manage_data_bundles(sheet_name,filter_key,payload) values ('NL_Dau','recent_500','{"source":"legacy"}');`);
    }
    sql(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  assert.equal(sql("select payload->>'source' from startup_bundles where form_type='2026:vanChuyen';").trim(), 'legacy');
  assert.equal(sql("select payload->>'source' from catalog_bundles where catalog_key='transport:2026:catalogs:all';").trim(), 'legacy');
  assert.equal(sql("select payload->>'source' from manage_data_bundles where sheet_name='2026:NL_Dau' and filter_key='recent_500';").trim(), 'legacy');
  assert.equal(sql("select count(*) from catalog_bundles where catalog_key='fund_catalog:2026:partners';").trim(), '1');
  sql(fs.readFileSync(path.join(root, 'supabase/migrations/019_multi_year_cache_namespace.sql'), 'utf8'));
  assert.equal(sql("select count(*) from startup_bundles where form_type in ('vanChuyen','2026:vanChuyen');").trim(), '2');
  sql(`insert into workbook_contexts(year,transport_spreadsheet_id,cashflow_spreadsheet_id,lifecycle_status,source_year)
       values ('2026','transport-workbook-2026-id','cashflow-workbook-2026-id','active',null),
              ('2027','transport-workbook-2027-id','cashflow-workbook-2027-id','ready','2026');`);
  assert.throws(() => sql("set role service_role; select activate_workbook_context('2025','2026',now());"), /source workbook context is not active/);
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => sql(`set role ${role}; select * from workbook_contexts;`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select activate_workbook_context('2026','2027',now());`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from sync_timeline_events;`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; insert into sync_timeline_events(event_key,workbook_year,module,generation_id,event_name,event_at,build_stamp) values ('denied','2026','transport','g','signal',now(),'test');`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from sync_generations;`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from publication_invalidations;`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select nextval('public.publication_invalidations_id_seq');`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from report_bundles;`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select enqueue_sync_generation('sg_denied_000000','g','2026','transport','transport','sheet:test',array[]::text[],array[]::bigint[],array[]::text[],array[]::text[],null,null,false,false,now(),now(),now(),'','g','test');`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select request_sync_generation_dispatch('sg_denied_000000','denied');`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from claim_sync_generations(1,'denied',30,30);`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from claim_sync_generation('sg_denied_000000','denied',30,30);`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select * from publish_sync_generation_pair(
      'sg_denied_000000','lease','2026','copy-canary-sheet','10/2026','generation','source-v1','v13',now(),
      array['BC_TongQuan'],'{}'::jsonb,repeat('a',64),array['BC_TongQuan'],'{}'::jsonb,repeat('b',64),'sql-test','preview'
    );`), /permission denied/);
  }
  sql("set role service_role; insert into sync_timeline_events(event_key,workbook_year,module,generation_id,event_name,event_at,build_stamp) values ('sql-test','2026','transport','generation-sql','signal',now(),'sql-test') on conflict (event_key) do update set event_at=excluded.event_at;");
  assert.equal(sql("select count(*) from sync_timeline_events where event_key='sql-test';").trim(), '1');
  assert.throws(() => sql("set role service_role; insert into sync_generations(event_key,generation_id,workbook_year,module,queue_name,source_type,last_signal_at,semantic_build_stamp) values ('sg_direct_denied_01','g','2026','transport','transport','sheet:test',now(),'test');"), /permission denied/);
  assert.throws(() => sql("set role service_role; select nextval('public.publication_invalidations_id_seq');"), /permission denied/);
  const enqueueGeneration = "set role service_role; select (enqueue_sync_generation('sg_sql_test_00001','generation-sql','2026','transport','transport','sheet:NL_Dau:EDIT',array['NL_Dau'],array[731]::bigint[],array['731:25:1'],array['2026-10'],25,1,false,false,now(),now(),now(),'report-v1','generation-sql','sql-test')).event_key;";
  assert.equal(sql(enqueueGeneration).trim(), 'sg_sql_test_00001');
  assert.equal(sql(enqueueGeneration).trim(), 'sg_sql_test_00001');
  assert.equal(sql("select count(*) from sync_generations where event_key='sg_sql_test_00001';").trim(), '1');
  sql("set role service_role; select enqueue_sync_generation('sg_sql_signal_0001','generation-sql','2026','transport','signal','sheet-trigger:EDIT',array[]::text[],array[731]::bigint[],array['731:25:1'],array[]::text[],25,1,false,false,now(),now(),now()+interval '1 day','','generation-sql','sql-test');");
  assert.equal(sql("select count(*) from sync_generations signal join sync_generations queued using (workbook_year,module,generation_id) where signal.queue_name='signal' and queued.queue_name='transport' and signal.scope_grid_ids && queued.scope_grid_ids and signal.scope_row_ranges && queued.scope_row_ranges;").trim(), '1');
  assert.throws(() => sql("set role service_role; select enqueue_sync_generation('sg_sql_test_00001','generation-sql','2026','transport','transport','sheet:NL_Dau:EDIT',array['NL_TaiXe'],array[731]::bigint[],array['731:25:1'],array['2026-10'],25,1,false,false,now(),now(),now(),'report-v1','generation-sql','sql-test');"), /collision/);
  sql("set role service_role; select enqueue_sync_generation('sg_sql_test_00002','generation-sql-2','2026','transport','transport','sheet:NL_TaiXe:EDIT',array['NL_TaiXe'],array[732]::bigint[],array['732:26:1'],array['2026-10'],26,1,false,false,now(),now(),now(),'','generation-sql-2','sql-test');");
  sql("set role service_role; select (request_sync_generation_dispatch('sg_sql_test_00001','sql-d3')).event_key;");
  const firstGenerationClaim = sql("set role service_role; select event_key from claim_sync_generation('sg_sql_test_00001','generation-worker-a',30,30);").trim();
  assert.equal(firstGenerationClaim, 'sg_sql_test_00001');
  assert.equal(sql(`select attempts||':'||lease_owner from sync_generations where event_key='${firstGenerationClaim}';`).trim(), '1:generation-worker-a');
  assert.equal(sql(`set role service_role; select (complete_sync_generation_shadow('${firstGenerationClaim}',(select lease_token from sync_generations where event_key='${firstGenerationClaim}'),'matched',true,'10/2026',now(),'report-v1','report-v1',repeat('a',64),'dash','report','dash','report')).status;`).trim(), 'shadowed');
  sql("set role service_role; select (request_sync_generation_dispatch('sg_sql_test_00002','sql-d3')).event_key;");
  const secondGenerationClaim = sql("set role service_role; select event_key from claim_sync_generations(1,'generation-worker-b',30,30);").trim();
  assert.equal(secondGenerationClaim, 'sg_sql_test_00002');
  sql(`update sync_generations set lease_expires_at=now()-interval '1 second' where event_key='${secondGenerationClaim}';`);
  assert.equal(sql("set role service_role; select event_key from claim_sync_generations(1,'generation-worker-reclaim',30,30);").trim(), secondGenerationClaim);
  assert.equal(sql(`select attempts||':'||lease_owner from sync_generations where event_key='${secondGenerationClaim}';`).trim(), '2:generation-worker-reclaim');
  assert.equal(sql(`set role service_role; select (retry_sync_generation_shadow('${secondGenerationClaim}',(select lease_token from sync_generations where event_key='${secondGenerationClaim}'),'legacy_version_not_ready',now(),false,'not_ready','10/2026','','',repeat('b',64),'','','','')).status;`).trim(), 'retryable');
  assert.equal(sql("set role service_role; select event_key from claim_sync_generation('sg_sql_test_00002','generation-worker-final',30,30);").trim(), secondGenerationClaim);
  const publicationLease = sql(`select lease_token from sync_generations where event_key='${secondGenerationClaim}';`).trim();
  const publicationCall = `set role service_role; select status||':'||publication_id||':'||generation_id from publish_sync_generation_pair(
    '${secondGenerationClaim}','${publicationLease}','2026','copy-canary-sheet-2026','10/2026','generation-sql-2','report-v2','v13','2026-11-09T01:00:02Z',
    array['BC_TongQuan','BC_BangLuong'],'{"report":true}'::jsonb,repeat('a',64),
    array['BC_TongQuan','NL_VanChuyen'],'{"dashboard":true}'::jsonb,repeat('b',64),'sql-d4','preview'
  );`;
  assert.match(sql(publicationCall).trim(), /^published:\d+:generation-sql-2$/);
  assert.match(sql(publicationCall).trim(), /^published:\d+:generation-sql-2$/, 'ambiguous retry must be idempotent');
  assert.equal(sql(`select count(distinct generation_id)||':'||count(distinct source_data_version)||':'||count(distinct published_at)||':'||count(distinct publication_id)
    from report_bundles where spreadsheet_id='copy-canary-sheet-2026' and report_month in ('10/2026','__dashboard_latest__');`).trim(), '1:1:1:1');
  assert.equal(sql("select count(*) from publication_invalidations where spreadsheet_id='copy-canary-sheet-2026' and generation_id='generation-sql-2';").trim(), '1');
  assert.equal(sql(`select status||':'||dashboard_cache_key||':'||report_cache_key from sync_generations where event_key='${secondGenerationClaim}';`).trim(), 'published:__dashboard_latest__:10/2026');
  sql("set role service_role; select activate_workbook_context('2026','2027',now());");
  sql("set role service_role; select activate_workbook_context('2026','2027',now());");
  assert.equal(sql("select string_agg(year||':'||lifecycle_status,',' order by year) from workbook_contexts;").trim(), '2026:archived,2027:active');
  sql(fs.readFileSync(path.join(root, 'tests/sql/r8-queue.sql'), 'utf8'));
  sql(fs.readFileSync(path.join(root, 'tests/sql/r8-payroll-isolation.sql'), 'utf8'));
  sql(fs.readFileSync(path.join(root, 'tests/sql/notification-cooldown.sql'), 'utf8'));
  assert.throws(() => sql('set role anon; select * from payroll_explanation_bundles_v6;'), /permission denied/);
  assert.throws(() => sql("set role authenticated; select replace_payroll_explanation_month_v6('sheet','09/2026','[]');"), /permission denied/);
  assert.throws(() => sql("set role anon; select * from claim_write_jobs(1,'denied',900);"), /permission denied/);
  assert.throws(() => sql('set role authenticated; select * from write_jobs;'), /permission denied/);
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => sql(`set role ${role}; select nextval('public.write_job_logs_id_seq');`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select setval('public.write_job_logs_id_seq',1);`), /permission denied/);
  }
  assert.throws(() => sql("set role service_role; select setval('public.write_job_logs_id_seq',1);"), /permission denied/);
  sql("set role service_role; select * from claim_write_jobs(1,'service-test',900);");
  // Real concurrent transactions: keep A's row lock, B must claim another job.
  sql(`insert into write_jobs(id,module,action,payload) values ('concurrent-a','fund','addFundLoan','{}'),('concurrent-b','fund','addFundLoan','{}');`);
  const first = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-qAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']);
  let output = ''; let error = '';
  first.stdout.on('data', (chunk) => { output += chunk; }); first.stderr.on('data', (chunk) => { error += chunk; });
  const completed = new Promise((resolve, reject) => { first.once('error', reject); first.once('close', (code) => code === 0 ? resolve() : reject(new Error(error))); });
  first.stdin.end("begin; select id from claim_write_jobs(1,'worker-a',900); select pg_sleep(2); commit;");
  for (let attempt = 0; attempt < 100 && !output.includes('concurrent-'); attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(output, /concurrent-/);
  const other = sql("select id from claim_write_jobs(1,'worker-b',900);").trim();
  await completed;
  assert.ok(other.startsWith('concurrent-') && !output.includes(other), 'SKIP LOCKED must produce disjoint claims');
  assert.equal(sql("select count(*) from write_jobs where id like 'concurrent-%' and attempts=1 and status='processing';").trim(), '2');
  // A second delivery blocks on the same row, then rechecks the old timestamp predicate.
  sql("insert into notification_rule_states(rule_key) values ('notification-device-concurrent');");
  const fundClaim = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-qAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']);
  let fundOutput = ''; let fundError = '';
  fundClaim.stdout.on('data', chunk => { fundOutput += chunk; });
  fundClaim.stderr.on('data', chunk => { fundError += chunk; });
  const fundCompleted = new Promise((resolve, reject) => { fundClaim.once('error', reject); fundClaim.once('close', code => code === 0 ? resolve() : reject(new Error(fundError))); });
  fundClaim.stdin.end("begin; set role service_role; update notification_rule_states set last_sent_at='2026-10-14 01:00:00+00',last_result='sending:a' where rule_key='notification-device-concurrent' and last_sent_at is null returning rule_key; select pg_sleep(1); commit;");
  for (let attempt = 0; attempt < 100 && !fundOutput.includes('notification-device-concurrent'); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(fundOutput, /notification-device-concurrent/);
  const losingClaim = sql("set role service_role; update notification_rule_states set last_sent_at='2026-10-14 01:00:00+00',last_result='sending:b' where rule_key='notification-device-concurrent' and last_sent_at is null returning rule_key;").trim();
  await fundCompleted;
  assert.equal(losingClaim, '', 'only one concurrent push reservation may succeed');
  console.log('Notification cooldown SQL PASS: conditional device reservation, owned completion and concurrent exclusion.');
  // Drive the production lifecycle/repository against actual isolated SQL.
  // Sheet execution remains a synthetic boundary; this is not live Sheet E2E.
  const literal = (value) => value === null ? 'null' : `'${String(value).replace(/'/g, "''")}'`;
  const identifier = (value) => { assert.match(value, /^(write_jobs|write_job_logs|[a-z_]+)$/); return value; };
  const valueSql = (value) => typeof value === 'object' && value !== null ? `${literal(JSON.stringify(value))}::jsonb` : literal(value);
  const where = (filters) => Object.entries(filters).map(([key, value]) => {
    assert.ok(String(value).startsWith('eq.')); return `${identifier(key)}=${literal(String(value).slice(3))}`;
  }).join(' and ');
  let faulted = false;
  const sandbox = vm.createContext({ console, SupabaseHttpClient: {
    insertRows(table, rows) {
      if (table === 'write_job_logs' && rows[0]?.job_id === 'sql-worker-fault' && rows[0].status === 'processing') throw new Error('injected log persistence failure');
      for (const row of rows) sql(`set role service_role; insert into ${identifier(table)}(${Object.keys(row).map(identifier).join(',')}) values (${Object.values(row).map(valueSql).join(',')});`);
    },
    readRows(table, query) {
      const selected = query.select.split(',').map(identifier).join(',');
      return JSON.parse(sql(`set role service_role; select coalesce(json_agg(t),'[]') from (select ${selected} from ${identifier(table)} where ${where({ id: query.id })}) t;`).trim());
    },
    updateRows(table, row, filters, options) {
      if (filters.id === 'eq.sql-worker-fault' && !faulted) { faulted = true; throw new Error('injected status persistence failure'); }
      const update = `update ${identifier(table)} set ${Object.entries(row).map(([key, value]) => `${identifier(key)}=${valueSql(value)}`).join(',')} where ${where(filters)}`;
      if (options?.returnRepresentation) return JSON.parse(sql(`set role service_role; with changed as (${update} returning *) select coalesce(json_agg(changed),'[]') from changed;`).trim());
      sql(`set role service_role; ${update};`);
    }
  } });
  for (const file of ['WriteJobRepository.gs', 'WriteJobWorker.gs']) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }).runInContext(sandbox);
  sql(`insert into write_jobs(id,module,action,payload,max_attempts) values ('sql-worker-fault','fund','addFundLoan','{}',1),('sql-worker-good','fund','addFundLoan','{}',3);`);
  const executed = [];
  const workerResult = sandbox.WriteJobWorker.process(2, {
    isEnabled: () => true, createUuid: () => 'isolated-sql-worker',
    claimJobs(input) { return JSON.parse(sql(`set role service_role; select coalesce(json_agg(q),'[]'::json) from claim_write_jobs(${Number(input.p_limit)},${literal(input.p_worker_id)},${Number(input.p_stale_seconds)}) q;`).trim()); },
    repository: sandbox.WriteJobRepository,
    executeJob(job) { executed.push(job.id); return { ok: true, synthetic: true }; },
    releaseReservation() {}, clean: (value) => String(value || '').trim(), nowISOString: () => new Date().toISOString(), nextRunISOString: () => new Date().toISOString()
  });
  assert.equal(workerResult.processed, 2); assert.equal(workerResult.ok, false);
  assert.deepEqual(executed, ['sql-worker-good'], JSON.stringify(workerResult));
  assert.equal(sql("select status from write_jobs where id='sql-worker-good';").trim(), 'synced');
  assert.equal(sql("select count(*) from write_job_logs where job_id='sql-worker-good' and status in ('processing','synced');").trim(), '2');
  assert.equal(sql("select status from write_jobs where id='sql-worker-fault';").trim(), 'processing');
  sql("update write_jobs set claimed_at=now()-interval '16 minutes' where id='sql-worker-fault'; set role service_role; select * from claim_write_jobs(1,'isolated-reaper',900);");
  assert.equal(sql("select status from write_jobs where id='sql-worker-fault';").trim(), 'failed');
  assert.equal(sql("select count(*) from write_job_logs where job_id='sql-worker-fault' and status='failed';").trim(), '1');
  sql(`insert into write_jobs(id,module,action,status,payload,last_error) values ('sql-manual-retry','transport','submitRows','failed','{"year":"2027"}','temporary error');`);
  const retrySnapshot = sandbox.WriteJobRepository.get('sql-manual-retry');
  assert.equal(retrySnapshot.payload.year, '2027');
  sandbox.WriteJobRepository.retry('sql-manual-retry', new Date().toISOString(), retrySnapshot);
  sql("select * from claim_write_jobs(20,'retry-race-worker',900);");
  assert.throws(() => sandbox.WriteJobRepository.retry('sql-manual-retry', new Date().toISOString(), retrySnapshot), /trạng thái.*thay đổi/);
  assert.equal(sql("select status from write_jobs where id='sql-manual-retry';").trim(), 'processing');
  sql("update write_jobs set status='failed', last_error='REQUIRES_RECONCILIATION: uncertain' where id='sql-manual-retry';");
  assert.throws(() => sandbox.WriteJobRepository.retry('sql-manual-retry', new Date().toISOString(), retrySnapshot), /trạng thái.*thay đổi/);
  assert.equal(sql("select last_error from write_jobs where id='sql-manual-retry';").trim(), 'REQUIRES_RECONCILIATION: uncertain');
  assert.equal(sql("select count(*) from write_job_logs where job_id='sql-manual-retry' and message='Write job manually retried.';").trim(), '1');
  console.log('Audit SQL retry PASS: persisted year, exact failed snapshot, worker ownership and reconciliation ABA guard.');
  console.log('R8 SQL worker/repository PASS: real claims, owned updates, terminal logs, fault isolation and exhausted lease recovery; Sheet boundary synthetic.');
  console.log('R8 SQL PASS: migrations 001–024, multi-year cache copy/idempotency, server-only workbook registry/transactional activation, sync timeline isolation, generation outbox dispatch/lease/retry/shadow, atomic publication/invalidation/RLS, v5/v6 isolation, service-only sequence allocation, permissions, exhausted leases, stale retry, and concurrent disjoint claims.');
} finally { try { docker(['rm', '--force', name]); } catch {} }
