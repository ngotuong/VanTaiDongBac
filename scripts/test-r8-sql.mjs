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
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort()) sql(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
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
    updateRows(table, row, filters) {
      if (filters.id === 'eq.sql-worker-fault' && !faulted) { faulted = true; throw new Error('injected status persistence failure'); }
      sql(`set role service_role; update ${identifier(table)} set ${Object.entries(row).map(([key, value]) => `${identifier(key)}=${valueSql(value)}`).join(',')} where ${where(filters)};`);
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
  console.log('R8 SQL worker/repository PASS: real claims, owned updates, terminal logs, fault isolation and exhausted lease recovery; Sheet boundary synthetic.');
  console.log('R8 SQL PASS: migrations 001–018, v5/v6 isolation, service-only sequence allocation, permissions, exhausted leases, stale retry, and concurrent disjoint claims.');
} finally { try { docker(['rm', '--force', name]); } catch {} }
