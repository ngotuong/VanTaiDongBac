const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createWorkbookContextService } = require('../server/services/workbook-context-service');
const { accessTokenFromRequest, refreshTokenFromRequest } = require('../server/services/session-cookie-service');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const httpError = (status, message) => Object.assign(new Error(message), { status });
const pair = (year, status) => ({ year, lifecycle_status: status, transport_spreadsheet_id: `transport-${year}`, cashflow_spreadsheet_id: `cashflow-${year}` });
function registry(rows) {
  return createWorkbookContextService({
    env: {
      DEFAULT_WORKBOOK_YEAR: '2026',
      WORKBOOK_CONTEXTS_JSON: JSON.stringify({
        2025: { transport: 'env-transport-2025', cashflow: 'env-fund-2025' },
        2026: { transport: 'env-transport-2026', cashflow: 'env-fund-2026' }
      })
    },
    httpError, config: { supabaseUrl: 'https://isolated.invalid', serviceRoleKey: 'synthetic' },
    repository: { list: async () => rows }
  });
}

test('populated registry never grants writes using an environment default without exactly one active pair', async () => {
  for (const rows of [[pair('2026', 'ready')], [pair('2026', 'archived')], [pair('2027', 'ready')], [pair('2026', 'active'), pair('2027', 'active')]]) {
    await assert.rejects(registry(rows).assertWritableAsync({ year: '2026' }), { status: 503 });
  }
});

test('invalid registered workbook pair cannot fall back to an old environment mapping', async () => {
  for (const invalid of [{ ...pair('2026', 'active'), cashflow_spreadsheet_id: '' }, { ...pair('2026', 'active'), cashflow_spreadsheet_id: 'transport-2026' }]) {
    await assert.rejects(registry([invalid]).resolveAsync({ year: '2026' }), { status: 503 });
  }
  const service = registry([pair('2027', 'active'), { ...pair('2026', 'archived'), cashflow_spreadsheet_id: '' }]);
  await assert.rejects(service.resolveAsync({ year: '2026' }), { status: 404 });
});

test('a populated registry excludes environment-only years from the public selector', async () => {
  const service = registry([pair('2026', 'active')]);
  await assert.rejects(service.resolveAsync({ module: 'transport', year: '2025' }), { status: 404 });
  assert.deepEqual((await service.publicContextAsync({ module: 'transport' })).availableYears, ['2026']);
});

test('malformed unrelated cookies do not break an otherwise valid authenticated request', () => {
  const req = { headers: { cookie: 'analytics=%E0%A4%A; vtdb_access_token=valid-access; vtdb_refresh_token=valid-refresh' } };
  assert.equal(accessTokenFromRequest(req), 'valid-access');
  assert.equal(refreshTokenFromRequest(req), 'valid-refresh');
});

test('malformed authentication cookie is treated as absent so refresh or 401 can recover', () => {
  const req = { headers: { cookie: 'vtdb_access_token=%ZZ; vtdb_refresh_token=valid-refresh' } };
  assert.equal(accessTokenFromRequest(req), '');
  assert.equal(refreshTokenFromRequest(req), 'valid-refresh');
});

function retryHarness(row, beforePatch = () => {}) {
  const state = { row: structuredClone(row), writes: 0, logs: [], queries: [] };
  const sandbox = vm.createContext({
    normalizeCleanValue_: (value) => String(value ?? '').trim(),
    APP_CONFIG: { year: '2027' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '2027' }) },
    SupabaseHttpClient: {
      readRows(_table, query) {
        state.queries.push(query);
        // Emulate PostgREST projection: a mock returning all fields hid the bug.
        return [Object.fromEntries(query.select.split(',').map((key) => [key, state.row[key]]))];
      },
      updateRows(_table, patch, filters) {
        beforePatch(state);
        if (!Object.entries(filters).every(([key, value]) => String(state.row[key]) === value.slice(3))) return [];
        state.row = { ...state.row, ...patch };
        state.writes++;
        return [state.row];
      },
      insertRows(_table, rows) { state.logs.push(...rows); }
    }
  });
  for (const file of ['WriteJobRepository.gs', 'SupabaseService.gs']) vm.runInContext(read(file), sandbox, { filename: file });
  return { state, service: sandbox.SupabaseService, repository: sandbox.WriteJobRepository };
}
const failedJob = { id: 'synthetic-job', module: 'transport', action: 'submitRows', status: 'failed', payload: { year: '2027', spreadsheetId: 'synthetic-workbook' }, updated_at: '2026-10-23T00:00:00Z', last_error: 'Temporary error', attempts: 3 };

test('manual retry reads persisted payload and rejects an archived-year job before any update', () => {
  const { state, service } = retryHarness({ ...failedJob, payload: { year: '2026' } });
  assert.throws(() => service.retryWriteJob(failedJob.id), /khóa chỉ đọc/);
  assert.equal(state.writes, 0);
});

test('manual retry cannot reset a job that another request has already retried and claimed', () => {
  const { state, service } = retryHarness(failedJob, (state) => {
    state.row = { ...state.row, status: 'processing', worker_id: 'worker-other', attempts: 1 };
  });
  assert.throws(() => service.retryWriteJob(failedJob.id), /trạng thái.*thay đổi/);
  assert.equal(state.writes, 0);
  assert.equal(state.row.worker_id, 'worker-other');
  assert.equal(state.logs.length, 0);
});

test('manual retry rejects a newer failed result requiring reconciliation (ABA race)', () => {
  const { state, service } = retryHarness(failedJob, (state) => {
    state.row = { ...state.row, updated_at: '2026-10-23T00:01:00Z', last_error: 'REQUIRES_RECONCILIATION: uncertain write' };
  });
  assert.throws(() => service.retryWriteJob(failedJob.id), /trạng thái.*thay đổi/);
  assert.equal(state.writes, 0);
  assert.match(state.row.last_error, /^REQUIRES_RECONCILIATION:/);
});

test('manual retry still accepts the exact failed active-year snapshot and records its transition', () => {
  const { state, service } = retryHarness(failedJob);
  const result = service.retryWriteJob(failedJob.id);
  assert.equal(result.status, 'pending');
  assert.equal(state.writes, 1);
  assert.equal(state.row.attempts, 0);
  assert.equal(state.logs.length, 1);
});

test('API serialization omits workbook routing metadata at every depth without mutating server intent', () => {
  const source = read('api/app.js');
  const sandbox = vm.createContext({ require: (name) => require(path.resolve(__dirname, '../api', name)) });
  // Execute the actual API serializer (and its declared response policy import).
  const imports = source.split('\n').filter((line) => /require\(.*public-api-response/.test(line)).join('\n');
  vm.runInContext(`${imports}\n${source.slice(source.indexOf('function send('), source.indexOf('function httpError('))}`, sandbox);
  const body = { ok: true, spreadsheetId: 'health-workbook', jobs: [{ jobId: 'job', payload: { year: '2027', spreadsheetId: 'persisted-workbook', rows: [{ amount: 100 }] }, result: { spreadsheet_id: 'nested-workbook' } }] };
  let serialized;
  sandbox.send({ setHeader() {}, end(value) { serialized = value; } }, 200, body);
  assert.doesNotMatch(serialized, /health-workbook|persisted-workbook|nested-workbook/);
  assert.equal(JSON.parse(serialized).jobs[0].payload.rows[0].amount, 100);
  assert.equal(body.jobs[0].payload.spreadsheetId, 'persisted-workbook');
});

function appsScriptWriteHarness() {
  const writes = [];
  const properties = { ACTIVE_WORKBOOK_YEAR: '2026', DEFAULT_WORKBOOK_YEAR: '2026', ACTIVE_SPREADSHEET_ID: 'transport-2026', SPREADSHEET_ID_2026: 'transport-2026', SPREADSHEET_ID_2027: 'transport-2027' };
  const sandbox = vm.createContext({
    normalizeCleanValue_: (value) => String(value ?? '').trim(),
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || '', getProperties: () => properties }) },
    SecurityService: { assertProxyRequest() {} },
    FundService: { addFundTransaction(year) { writes.push(year); return { ok: true }; } },
    EntryService: { releaseWriteJobReservation() {} },
    TransportJobHandler: { canHandle: () => true, execute: () => { writes.push('worker'); return { ok: true }; } },
    SheetService: {},
    WriteJobRepository: {},
    WriteJobWorker: { process: (_limit, context) => context.executeJob({ action: 'submitRows', payload: { year: '2027', spreadsheetId: 'transport-2027' } }) }
  });
  for (const file of ['AppConfig.gs', 'ApiActionRegistry.gs', 'SupabaseService.gs', 'PublicApi.gs']) vm.runInContext(read(file), sandbox, { filename: file });
  return { sandbox, writes };
}

test('legacy direct Fund API cannot write a ready future workbook while active-year behavior is unchanged', () => {
  const { sandbox, writes } = appsScriptWriteHarness();
  assert.throws(() => sandbox.invokeApi('POST', 'addFundTransaction', {}, { year: '2027' }), /chỉ đọc/);
  assert.equal(writes.length, 0);
  assert.equal(sandbox.invokeApi('POST', 'addFundTransaction', {}, { year: '2026' }).ok, true);
  assert.deepEqual(writes, ['2026']);
});

test('worker rechecks active year before activating or executing a persisted job', () => {
  const { sandbox, writes } = appsScriptWriteHarness();
  assert.throws(() => sandbox.SupabaseService.processWriteJobs(1), /chỉ đọc/);
  assert.equal(writes.length, 0);
  assert.equal(sandbox.APP_CONFIG.year, '2026');
});

test('Vercel legacy Fund write checks registry lifecycle before forwarding and preserves synchronous success', async () => {
  const forwarded = [];
  const checked = [];
  const config = { supabaseUrl: 'https://isolated.invalid', anonKey: 'synthetic', serviceRoleKey: 'synthetic', appsScriptUrl: 'https://script.invalid', proxySecret: 'synthetic' };
  const sandbox = vm.createContext({
    module: { exports: {} }, Buffer, fetch,
    require(name) {
      if (name.endsWith('/runtime-config')) return { runtimeConfig: () => config };
      if (name.endsWith('/environment-identity')) return { assertRuntimeIdentity() {}, publicEnvironmentIdentity: () => ({}) };
      if (name.endsWith('/auth-service')) return { createAuthService: () => ({ getAuthenticatedUser: async () => ({ id: 'synthetic-user', role: 'operator' }) }) };
      if (name.endsWith('/workbook-context-service')) return { createWorkbookContextService: () => ({ async assertWritableAsync(input) {
        checked.push(input);
        if (input.year !== '2026') throw httpError(409, 'Năm chỉ đọc');
        return { year: '2026' };
      } }) };
      if (name.endsWith('/apps-script-client')) return { createAppsScriptClient: () => ({ async forward(input) { forwarded.push(input); return { status: 200, body: { ok: true, inserted: 1 } }; } }) };
      return require(path.resolve(__dirname, '../api', name));
    }
  });
  vm.runInContext(read('api/app.js'), sandbox, { filename: 'api/app.js' });
  const response = () => ({ setHeader() {}, end(value) { this.body = JSON.parse(value); } });
  const denied = response();
  await sandbox.module.exports({ method: 'POST', body: { action: 'addFundTransaction', year: '2027', transaction: { amount: 100 } } }, denied);
  assert.equal(denied.statusCode, 409);
  assert.equal(forwarded.length, 0);
  const accepted = response();
  await sandbox.module.exports({ method: 'POST', body: { action: 'addFundTransaction', year: '2026', transaction: { amount: 100 } } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.inserted, 1);
  assert.equal(forwarded.length, 1);
  assert.equal(checked[0].module, 'cashflow');
});
