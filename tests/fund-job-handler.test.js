const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadHandler(overrides = {}) {
  const vmContext = vm.createContext({});
  new vm.Script(read('FundJobHandler.gs'), { filename: 'FundJobHandler.gs#test' }).runInContext(vmContext);
  const calls = { writes: [], syncs: [] };
  const context = {
    assertWorkbook() {},
    addFundTransactions(...args) { calls.writes.push(args); return { ok: true, inserted: 2 }; },
    syncFundTransactionsAfterWrite(...args) { calls.syncs.push(args); return { ok: true, synced: 4 }; },
    ...overrides
  };
  return { handler: vmContext.FundJobHandler, context, calls };
}

test('Fund handler accepts all queued Fund mutations and rejects other modules', () => {
  const { handler } = loadHandler();
  const clean = (value) => String(value || '').trim();
  for (const action of ['addFundTransactions', 'updateFundTransaction', 'deleteFundTransaction', 'addFundDebtPayment', 'addFundLoan', 'addFundLoanPayment', 'saveFundCatalogItem', 'deleteFundCatalogItem', 'updateFundSettings']) {
    assert.equal(handler.canHandle({ module: 'fund', action }, clean), true);
  }
  assert.equal(handler.canHandle({ module: 'transport', action: 'addFundTransactions' }, clean), false);
  assert.equal(handler.canHandle({ module: 'fund', action: 'submitRows' }, clean), false);
});

test('Fund handler dispatches an edit through the worker and defers cache refresh', () => {
  const calls = [];
  const loaded = loadHandler({
    updateFundTransaction(...args) { calls.push(['write', ...args]); return { ok: true, rowIndex: 9 }; },
    syncFundAfterWrite(...args) { calls.push(['sync', ...args]); return { ok: true, deferred: true }; }
  });
  const result = loaded.handler.execute({ id: 'job-edit', module: 'fund', action: 'updateFundTransaction', idempotency_key: 'edit-1', payload: { year: '2026', spreadsheetId: 'fund-2026', rowIndex: 9, transaction: { amount: '1000' } } }, loaded.context);
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ['write', '2026', 9, { amount: '1000' }]);
  assert.equal(calls[1][0], 'sync');
  assert.equal(calls[1][2].transportDownstream, true);
  assert.equal(calls[1][2].result.rowIndex, 9);
});

test('Fund handler requests downstream reports only for NHAP_THUCHI mutations', () => {
  const calls = [];
  const loaded = loadHandler({
    addFundLoan(year, loan) { return { ok: true, year, loan }; },
    syncFundAfterWrite(year, options) { calls.push([year, options]); return { ok: true }; }
  });
  loaded.handler.execute({ module: 'fund', action: 'addFundLoan', payload: { year: '2026', spreadsheetId: 'fund-2026', loan: { amount: 5000 } } }, loaded.context);
  assert.equal(calls[0][1].transportDownstream, false);
});

test('Fund execution preserves job replay metadata, payload, sync scope, and result mutation', () => {
  const loaded = loadHandler();
  const transactions = [{ voucher: 'synthetic-voucher' }];
  const job = {
    id: 'job-fund-1', module: 'fund', action: 'addFundTransactions', idempotency_key: 'fund-request-1',
    payload: { year: '2026', spreadsheetId: 'fund-2026', transactions }
  };
  const result = loaded.handler.execute(job, loaded.context);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.writes)), [[
    '2026', transactions, { jobId: 'job-fund-1', idempotencyKey: 'fund-request-1' }
  ]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.syncs)), [['2026', transactions]]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, inserted: 2, supabaseSync: { ok: true, synced: 4 } });
});

test('Fund execution verifies the queued workbook before any financial write', () => {
  let wrote = false;
  const loaded = loadHandler({
    assertWorkbook(year, spreadsheetId) {
      assert.equal(year, '2026');
      assert.equal(spreadsheetId, 'wrong-workbook');
      throw new Error('workbook mismatch');
    },
    addFundTransactions() { wrote = true; return { ok: true }; }
  });
  assert.throws(() => loaded.handler.execute({ module: 'fund', action: 'addFundTransactions', payload: {
    year: '2026', spreadsheetId: 'wrong-workbook', transactions: []
  } }, loaded.context), /workbook mismatch/);
  assert.equal(wrote, false);
});

test('Fund cache sync failure is isolated while write failure propagates to lifecycle', () => {
  const syncFailure = loadHandler({ syncFundTransactionsAfterWrite() { throw new Error('fund cache unavailable'); } });
  const result = syncFailure.handler.execute({ module: 'fund', action: 'addFundTransactions', payload: {} }, syncFailure.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.supabaseSync)), { ok: false, error: 'fund cache unavailable' });

  const writeFailure = loadHandler({ addFundTransactions() { return { ok: false, errors: ['synthetic fund validation'] }; } });
  assert.throws(
    () => writeFailure.handler.execute({ module: 'fund', action: 'addFundTransactions', payload: {} }, writeFailure.context),
    /synthetic fund validation/
  );
});

test('SupabaseService becomes dispatch-only and all Step 21 handlers have one owner', () => {
  const service = read('SupabaseService.gs');
  assert.match(service, /TransportJobHandler\.execute\(job, transportJobHandlerContext_\(\)\)/);
  assert.match(service, /FundJobHandler\.canHandle\(job, clean_\)/);
  assert.match(service, /FundJobHandler\.execute\(job, fundJobHandlerContext_\(\)\)/);
  assert.doesNotMatch(service, /FundService\.addFundTransactions\(payload\.year/);
  assert.doesNotMatch(service, /function assertWriteResultOk_/);
});
