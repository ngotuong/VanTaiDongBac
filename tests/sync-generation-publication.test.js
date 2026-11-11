const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const stable = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function load(file, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  new vm.Script(read(file), { filename: `${file}#test` }).runInContext(context);
  return context;
}

function generation(overrides = {}) {
  return {
    event_key: 'sg_d4_publish_test_01', generation_id: 'generation-d4-01', lease_token: 'lease-d4',
    workbook_year: '2026', module: 'transport', structural: false, full_refresh: false,
    source_committed_at: '2026-11-09T01:00:00.000Z', last_signal_at: '2026-11-09T01:00:00.000Z',
    scope_row_ranges: ['731:25:1'], scope_grid_ids: [731], scope_start_row: 25, scope_num_rows: 1,
    scope_months: ['2026-10'], semantic_build_stamp: 'd4-test', ...overrides
  };
}

function workbook() {
  const rows = [[new Date('2026-10-31T00:00:00Z'), '10/2026', '51A']];
  return { getSheets: () => [{
    getSheetId: () => 731, getName: () => 'NL_Dau', getMaxRows: () => 1000, getLastColumn: () => 3,
    getRange: () => ({ getValues: () => rows, getDisplayValues: () => [['31/10/2026', '10/2026', '51A']] })
  }] };
}

function publicationContext(overrides = {}) {
  const calls = { published: [], legacy: 0 };
  const dashboard = { overview: { kpis: [{ month: '10/2026', final: 1 }] }, latestTrips: { trips: [] } };
  const report = { overview: { months: [['Tháng'], ['10/2026']], details: [['A', 1]] }, payroll: [], vehicles: [], projectGroups: [], projects: [] };
  const context = {
    openWorkbook: () => ({ spreadsheet: workbook(), spreadsheetId: 'copy-canary-sheet-id' }),
    getReportDataVersion: () => 'source-v1', getReportCacheVersion: () => 'v13',
    getDashboard: () => dashboard, getReportBundle: () => report,
    isPublishEnabled: (spreadsheetId) => spreadsheetId === 'copy-canary-sheet-id',
    buildReportBundleRow(options) {
      return { spreadsheet_id: options.spreadsheetId, report_month: options.reportMonth,
        source_sheet_names: options.sourceSheetNames, payload: options.bundle,
        cache_version: options.cacheVersion, source_data_version: options.dataVersion,
        details_hash: hex(stable(options.bundle?.overview?.details || [])), synced_at: options.syncedAt };
    },
    publishPair(input) { calls.published.push(input); return { publication_id: 41, status: 'published' }; },
    readLegacyRows() { calls.legacy += 1; throw new Error('legacy path must not run'); },
    stableStringify: stable, sha256Hex: hex, formatMonth: () => '2026-10',
    nowISOString: () => '2026-11-09T01:00:02.000Z', buildStamp: 'd4-test', ...overrides
  };
  return { context, calls };
}

test('D4 worker publishes the Dashboard/report pair through one owned RPC without waiting for legacy bundles', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  const harness = publicationContext();
  const result = sandbox.SyncGenerationForegroundWorker.run(generation(), harness.context);
  assert.equal(result.action, 'published');
  assert.equal(result.shadowResult, 'published_preview');
  assert.equal(harness.calls.legacy, 0);
  assert.equal(harness.calls.published.length, 1);
  const input = plain(harness.calls.published[0]);
  assert.equal(input.eventKey, 'sg_d4_publish_test_01');
  assert.equal(input.leaseToken, 'lease-d4');
  assert.equal(input.reportMonth, '10/2026');
  assert.equal(input.sourceDataVersion, 'source-v1');
  assert.equal(input.reportRow.source_data_version, input.dashboardRow.source_data_version);
  assert.equal(input.reportRow.synced_at, input.dashboardRow.synced_at);
  assert.equal(input.audience, 'preview');
  assert.match(input.reportRow.details_hash, /^[a-f0-9]{64}$/);
});

test('D5 worker passes the configured Production audience to the atomic RPC', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  const harness = publicationContext({ getPublicationAudience: () => 'production' });
  const result = sandbox.SyncGenerationForegroundWorker.run(generation(), harness.context);
  assert.equal(result.action, 'published');
  assert.equal(result.shadowResult, 'published_production');
  assert.equal(harness.calls.published[0].audience, 'production');
});

test('D5 worker fails closed when the publication audience is invalid', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  const harness = publicationContext({ getPublicationAudience: () => 'other' });
  const result = sandbox.SyncGenerationForegroundWorker.run(generation(), harness.context);
  assert.equal(result.action, 'retry');
  assert.equal(result.errorClass, 'publication_audience_invalid');
  assert.equal(harness.calls.published.length, 0);
});

test('D4 worker publishes neither row when source version changes after pair preparation', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  let reads = 0;
  const harness = publicationContext({ getReportDataVersion: () => (++reads >= 4 ? 'source-v2' : 'source-v1') });
  const result = sandbox.SyncGenerationForegroundWorker.run(generation(), harness.context);
  assert.equal(result.action, 'retry');
  assert.equal(result.errorClass, 'source_version_changed');
  assert.equal(harness.calls.published.length, 0);
});

test('D4 dispatcher treats atomic RPC completion as terminal and never sends a second shadow completion', () => {
  const sandbox = load('SyncGenerationForegroundDispatcher.gs');
  const calls = [];
  const repository = {
    requestDispatch: () => ({ not_before: '2026-11-09T01:00:00.000Z' }),
    claimOne: () => generation(),
    completeShadow: () => { calls.push('complete-shadow'); },
    retryShadow: () => { calls.push('retry-shadow'); }
  };
  const result = sandbox.SyncGenerationForegroundDispatcher.dispatchRecorded(
    { recorded: true, eventKey: 'sg_d4_publish_test_01', row: { module: 'transport' } },
    { isEnabled: () => true, repository, worker: { run: () => ({ action: 'published', publication: { publication_id: 41 } }) },
      workerContext: {}, buildStamp: 'd4', nowMillis: () => Date.parse('2026-11-09T01:00:00.000Z'), sleep: () => {}, workerId: () => 'worker' }
  );
  assert.equal(result.status, 'published');
  assert.deepEqual(calls, []);
});

test('D4 dispatcher recovers an ambiguous response from the durable publication ACK', () => {
  const sandbox = load('SyncGenerationForegroundDispatcher.gs');
  let retries = 0;
  const result = sandbox.SyncGenerationForegroundDispatcher.dispatchRecorded(
    { recorded: true, eventKey: 'sg_d4_publish_test_01', row: { module: 'transport' } },
    { isEnabled: () => true,
      repository: {
        requestDispatch: () => ({ not_before: '2026-11-09T01:00:00.000Z' }), claimOne: () => generation(),
        findByEventKey: () => ({ status: 'published', report_cache_key: '10/2026' }),
        retryShadow: () => { retries += 1; }
      },
      worker: { run: () => { throw new Error('response lost after commit'); } }, workerContext: {},
      buildStamp: 'd4', nowMillis: () => Date.parse('2026-11-09T01:00:00.000Z'), sleep: () => {}, workerId: () => 'worker' }
  );
  assert.equal(result.status, 'published');
  assert.equal(result.recovered, true);
  assert.equal(retries, 0);
});

test('D4 repository sends both payloads only to the server-only atomic publication RPC', () => {
  const calls = [];
  const sandbox = load('SupabaseSyncGenerationRepository.gs', {
    SupabaseHttpClient: { callRpc(name, payload) { calls.push({ name, payload }); return [{ status: 'published' }]; } },
    SupabaseBundleRepository: { readRows() { return []; } }
  });
  const reportRow = { source_sheet_names: ['BC_TongQuan'], payload: { report: true }, details_hash: 'a'.repeat(64) };
  const dashboardRow = { source_sheet_names: ['BC_TongQuan'], payload: { dashboard: true }, details_hash: 'b'.repeat(64) };
  sandbox.SupabaseSyncGenerationRepository.publishPair({
    eventKey: 'event', leaseToken: 'lease', workbookYear: '2026', spreadsheetId: 'copy-id',
    reportMonth: '10/2026', generationId: 'generation', sourceDataVersion: 'source', cacheVersion: 'v13',
    publishedAt: '2026-11-09T01:00:02.000Z', reportRow, dashboardRow, audience: 'production', semanticBuildStamp: 'd5'
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'publish_sync_generation_pair');
  assert.deepEqual(plain(calls[0].payload.p_report_payload), { report: true });
  assert.deepEqual(plain(calls[0].payload.p_dashboard_payload), { dashboard: true });
  assert.equal(calls[0].payload.p_audience, 'production');
});

test('D4 migration keeps invalidation metadata server-only and transactionally owns pair plus ACK', () => {
  const sql = read('supabase/migrations/024_sync_generation_atomic_publication.sql');
  assert.match(sql, /create table if not exists public\.publication_invalidations/i);
  assert.match(sql, /create or replace function public\.publish_sync_generation_pair/i);
  assert.match(sql, /insert into public\.report_bundles[\s\S]*values[\s\S]*__dashboard_latest__/i);
  assert.match(sql, /update public\.sync_generations[\s\S]*status = 'published'/i);
  assert.match(sql, /revoke all on table public\.publication_invalidations from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.report_bundles from anon, authenticated/i);
  assert.doesNotMatch(sql.match(/create table if not exists public\.publication_invalidations[\s\S]*?\);/i)[0], /payload|sheet_value|user_id/i);
});

test('D5 migration opens only the explicit Production audience and preserves RPC isolation', () => {
  const sql = read('supabase/migrations/025_sync_generation_production_publication.sql');
  assert.match(sql, /not in \('preview', 'production'\)/i);
  assert.match(sql, /shadow_result = 'published_' \|\| p_audience/i);
  assert.match(sql, /two event keys for the same generation/i);
  assert.match(sql, /if invalidation\.id is not null then[\s\S]*status = 'published'/i);
  assert.match(sql, /on conflict do nothing[\s\S]*publication conflict is missing invalidation metadata/i);
  assert.match(sql, /revoke all on function public\.publish_sync_generation_pair[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.publish_sync_generation_pair[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant .*publication_invalidations.*anon|grant .*publication_invalidations.*authenticated/i);
});

test('D4 invalidation channel is authenticated, metadata-only, and revalidates through same-origin loaders', () => {
  const route = read('next-shell/app/publication-events/route.ts');
  const repository = read('server/repositories/publication-invalidation-repository.js');
  const hook = read('next-shell/components/platform/usePublicationInvalidation.ts');
  const dashboard = read('next-shell/components/dashboard/DashboardModule.tsx');
  const report = read('next-shell/components/report/ReportModule.tsx');
  assert.match(route, /loadPlatformContext/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /event: publication/);
  assert.doesNotMatch(route, /spreadsheetId|spreadsheet_id|payload/);
  assert.match(repository, /Authorization: `Bearer \$\{config\.serviceRoleKey\}`/);
  assert.match(repository, /publicationInvalidationAudience/);
  assert.match(repository, /'preview', 'production'/);
  assert.match(hook, /new EventSource/);
  assert.match(hook, /\/publication-events\//);
  assert.match(dashboard, /usePublicationInvalidation/);
  assert.match(dashboard, /requestDashboard\(workbook\.year, false, true\)/);
  assert.match(report, /usePublicationInvalidation/);
  assert.match(report, /requestReport\(workbook\.year[\s\S]*false, true\)/);
});

test('D5 invalidation repository scopes the service-role read to configured audience, year, and cursor', async () => {
  const { createPublicationInvalidationRepository } = require('../server/repositories/publication-invalidation-repository');
  const requests = [];
  const repository = createPublicationInvalidationRepository({
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return { ok: true, json: async () => [{ id: 42, workbook_year: '2026' }] };
    }
  });
  const row = await repository.findNext({ supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', publicationInvalidationAudience: 'production' }, { year: '2026', afterId: 41 });
  assert.equal(row.id, 42);
  const request = requests[0];
  const url = new URL(request.url);
  assert.equal(url.pathname, '/rest/v1/publication_invalidations');
  assert.equal(url.searchParams.get('audience'), 'eq.production');
  assert.equal(url.searchParams.get('workbook_year'), 'eq.2026');
  assert.equal(url.searchParams.get('id'), 'gt.41');
  assert.equal(request.init.headers.Authorization, 'Bearer server-only');
});

test('D5 deployment scripts pin Preview and Production invalidation audiences', () => {
  assert.match(read('scripts/deploy-preview.mjs'), /PUBLICATION_INVALIDATION_AUDIENCE=preview/);
  assert.match(read('scripts/deploy-production.mjs'), /PUBLICATION_INVALIDATION_AUDIENCE=production/);
});

test('D5 rollout activation is exact-workbook, Production-only, expiring, and atomically reversible', () => {
  const sandbox = load('SyncGenerationRolloutService.gs');
  const values = {};
  const now = Date.parse('2026-11-09T02:00:00.000Z');
  const context = {
    resolveWorkbook: () => ({ spreadsheetId: 'canonical-transport-2026', year: '2026' }),
    nowMillis: () => now,
    reconcilerTriggerCount: () => 1,
    assertReconciler() { if (this.reconcilerTriggerCount() !== 1) throw new Error('missing reconciler'); },
    setProperties: (patch) => Object.assign(values, plain(patch)),
    getProperties: () => ({ ...values }),
    deleteProperty: (key) => { delete values[key]; }
  };
  const active = plain(sandbox.SyncGenerationRolloutService.activateProductionCanary(context));
  assert.equal(active.generationEnabled, true);
  assert.equal(active.dispatcherEnabled, true);
  assert.equal(active.publicationEnabled, true);
  assert.deepEqual(active.allowlistedSpreadsheetIds, ['canonical-transport-2026']);
  assert.equal(active.audience, 'production');
  assert.equal(active.windowActive, true);
  assert.equal(Date.parse(active.expiresAt) - now, 30 * 60 * 1000);

  const rolledBack = plain(sandbox.SyncGenerationRolloutService.rollback(context));
  assert.equal(rolledBack.generationEnabled, false);
  assert.equal(rolledBack.dispatcherEnabled, false);
  assert.equal(rolledBack.publicationEnabled, false);
  assert.deepEqual(rolledBack.allowlistedSpreadsheetIds, []);
  assert.equal(rolledBack.audience, 'preview');
  assert.equal(rolledBack.windowActive, false);
  assert.equal(values.SYNC_FOREGROUND_PUBLISH_EXPIRES_AT, undefined);
});

test('D5B rollout fails closed before setting flags unless exactly one reconciler exists', () => {
  const sandbox = load('SyncGenerationRolloutService.gs');
  for (const count of [0, 2]) {
    let writes = 0;
    const context = {
      assertReconciler() { if (count !== 1) throw new Error('reconciler count=' + count); },
      reconcilerTriggerCount: () => count,
      resolveWorkbook: () => ({ spreadsheetId: 'canonical-transport-2026', year: '2026' }),
      nowMillis: () => Date.parse('2026-11-10T01:00:00.000Z'),
      setProperties: () => { writes += 1; }, getProperties: () => ({}), deleteProperty: () => {}
    };
    assert.throws(() => sandbox.SyncGenerationRolloutService.activateProductionCanary(context), /reconciler/);
    assert.equal(writes, 0);
  }
});

test('D5B quarantine migration is exact-key, audit-preserving, server-only, and never deletes', () => {
  const sql = read('supabase/migrations/026_sync_generation_quarantine.sql');
  assert.match(sql, /status in[\s\S]*'quarantined'/i);
  assert.match(sql, /create or replace function public\.quarantine_sync_generations/i);
  assert.match(sql, /event_key = any\(p_event_keys\)/i);
  assert.match(sql, /status = 'pending'[\s\S]*dispatch_requested = false[\s\S]*attempts = 0/i);
  assert.match(sql, /get diagnostics updated_count = row_count[\s\S]*target changed concurrently/i);
  assert.match(sql, /quarantine_reason = btrim\(p_reason\)/i);
  assert.match(sql, /revoke all on function public\.quarantine_sync_generations[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.quarantine_sync_generations[\s\S]*to service_role/i);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /delete\s+from\s+public\.sync_generations/i);
});

test('D5F retryable quarantine is single-row exact-state, publication-safe, and server-only', () => {
  const sql = read('supabase/migrations/027_sync_generation_retryable_quarantine.sql');
  assert.match(sql, /create or replace function public\.quarantine_retryable_sync_generation/i);
  assert.match(sql, /event_key = btrim\(p_event_key\)[\s\S]*for update/i);
  assert.match(sql, /generation_id <> btrim\(p_generation_id\)[\s\S]*status <> 'retryable'[\s\S]*attempts <> p_expected_attempts[\s\S]*error_class <> btrim\(p_expected_error_class\)/i);
  assert.match(sql, /source_ready_at is not null[\s\S]*dashboard_published_at is not null[\s\S]*report_published_at is not null/i);
  assert.match(sql, /report_bundles[\s\S]*publication_invalidations[\s\S]*refuses published evidence/i);
  assert.match(sql, /status = 'quarantined'[\s\S]*quarantine_reason = btrim\(p_reason\)[\s\S]*quarantine_batch_key = btrim\(p_batch_key\)/i);
  assert.match(sql, /revoke all on function public\.quarantine_retryable_sync_generation[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.quarantine_retryable_sync_generation[\s\S]*to service_role/i);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /delete\s+from\s+public\.sync_generations/i);
});

test('D5 default worker refuses publication without a live rollout expiry', () => {
  const worker = read('SyncGenerationForegroundWorker.gs');
  assert.match(worker, /SYNC_FOREGROUND_PUBLISH_EXPIRES_AT/);
  assert.match(worker, /!isFinite\(expiresAt\) \|\| expiresAt <= new Date\(\)\.getTime\(\)/);
  assert.match(worker, /SYNC_FOREGROUND_PUBLISH_SPREADSHEET_IDS/);
});
