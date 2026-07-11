const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadHandler(overrides = {}) {
  const vmContext = vm.createContext({});
  new vm.Script(read('TransportJobHandler.gs'), { filename: 'TransportJobHandler.gs#test' }).runInContext(vmContext);
  const calls = { submit: [], save: [], delete: [], manage: [], dashboard: 0, reports: [] };
  const context = {
    clean: (value) => String(value || '').trim(),
    submitRows(...args) { calls.submit.push(args); return { ok: true, inserted: 2, sheetName: 'NL_VanChuyen' }; },
    saveSheetRow(...args) { calls.save.push(args); return { ok: true, saved: true }; },
    deleteSheetRow(...args) { calls.delete.push(args); return { ok: true, deleted: true }; },
    syncTransportAfterWrite(...args) { calls.manage.push(args); return { ok: true, kind: 'manage' }; },
    syncDashboard() { calls.dashboard += 1; return { ok: true, kind: 'dashboard' }; },
    syncTransportReportsAfterWrite(...args) { calls.reports.push(args); return { ok: true, kind: 'report' }; },
    ...overrides
  };
  return { handler: vmContext.TransportJobHandler, context, calls };
}

test('submitRows preserves replay metadata and all three sync scopes', () => {
  const loaded = loadHandler();
  const job = { id: 'job-1', action: 'submitRows', idempotency_key: 'request-1', payload: { formType: 'vanChuyen', rows: [{ synthetic: true }] } };
  const result = loaded.handler.execute(job, loaded.context);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.submit)), [['vanChuyen', [{ synthetic: true }], { jobId: 'job-1', idempotencyKey: 'request-1' }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.manage)), [['NL_VanChuyen', [{ synthetic: true }], { fast: true }]]);
  assert.equal(loaded.calls.dashboard, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.reports)), [['NL_VanChuyen', [{ synthetic: true }], { includeAll: true }]]);
  assert.equal(result.supabaseSync.kind, 'manage');
  assert.equal(result.dashboardSync.kind, 'dashboard');
  assert.equal(result.reportSync.kind, 'report');
});

test('saveSheetRow preserves previous/current report scope and dashboard only for trips', () => {
  const loaded = loadHandler();
  const payload = { sheetName: 'NL_VanChuyen', rowIndex: 7, previousRowData: { old: true }, rowData: { current: true } };
  loaded.handler.execute({ action: 'saveSheetRow', payload }, loaded.context);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.save)), [['NL_VanChuyen', 7, { current: true }, { old: true }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.manage)), [['NL_VanChuyen', [{ current: true }], { fast: true }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.reports)), [['NL_VanChuyen', [{ old: true }, { current: true }], { includeAll: true }]]);
  assert.equal(loaded.calls.dashboard, 1);

  const other = loadHandler();
  other.handler.execute({ action: 'saveSheetRow', payload: { sheetName: 'NL_TaiXe', rowIndex: 8, rowData: {} } }, other.context);
  assert.equal(other.calls.dashboard, 0);
});

test('deleteSheetRow blocks physical delete payload and preserves clear/sync arguments', () => {
  const loaded = loadHandler();
  assert.throws(() => loaded.handler.execute({ action: 'deleteSheetRow', payload: { sheetName: 'NL_VanChuyen' } }, loaded.context), /từ chối deleteRow/);
  const payload = { sheetName: 'NL_VanChuyen', rowIndex: 9, columnsToClear: [1, 2], rowData: { old: true } };
  loaded.handler.execute({ action: 'deleteSheetRow', payload }, loaded.context);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.delete)), [['NL_VanChuyen', 9, [1, 2], { old: true }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.manage)), [['NL_VanChuyen', [], { fast: true }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.reports)), [['NL_VanChuyen', [{ old: true }], { includeAll: true }]]);
});

test('sync failures remain isolated while write failures propagate to lifecycle wrapper', () => {
  const syncFailure = loadHandler({ syncDashboard() { throw new Error('dashboard unavailable'); } });
  const result = syncFailure.handler.execute({ action: 'submitRows', payload: { rows: [] } }, syncFailure.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.dashboardSync)), { ok: false, error: 'dashboard unavailable' });

  const writeFailure = loadHandler({ submitRows() { return { ok: false, errors: ['synthetic validation'] }; } });
  assert.throws(() => writeFailure.handler.execute({ action: 'submitRows', payload: {} }, writeFailure.context), /synthetic validation/);
});

test('SupabaseService delegates transport actions separately from Fund actions', () => {
  const source = read('SupabaseService.gs');
  const fundHandler = read('FundJobHandler.gs');
  assert.match(source, /TransportJobHandler\.canHandle\(actionName\)/);
  assert.match(source, /TransportJobHandler\.execute\(job, transportJobHandlerContext_\(\)\)/);
  assert.match(fundHandler, /context\.addFundTransactions/);
  assert.doesNotMatch(source, /if \(actionName === 'submitRows'\)/);
});
