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
    addFundTransactions(...args) { calls.writes.push(args); return { ok: true, inserted: 2 }; },
    syncFundTransactionsAfterWrite(...args) { calls.syncs.push(args); return { ok: true, synced: 4 }; },
    ...overrides
  };
  return { handler: vmContext.FundJobHandler, context, calls };
}

test('Fund handler accepts only fund/addFundTransactions jobs', () => {
  const { handler } = loadHandler();
  const clean = (value) => String(value || '').trim();
  assert.equal(handler.canHandle({ module: 'fund', action: 'addFundTransactions' }, clean), true);
  assert.equal(handler.canHandle({ module: 'transport', action: 'addFundTransactions' }, clean), false);
  assert.equal(handler.canHandle({ module: 'fund', action: 'submitRows' }, clean), false);
});

test('Fund execution preserves job replay metadata, payload, sync scope, and result mutation', () => {
  const loaded = loadHandler();
  const transactions = [{ voucher: 'synthetic-voucher' }];
  const job = {
    id: 'job-fund-1', module: 'fund', action: 'addFundTransactions', idempotency_key: 'fund-request-1',
    payload: { year: '2026', transactions }
  };
  const result = loaded.handler.execute(job, loaded.context);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.writes)), [[
    '2026', transactions, { jobId: 'job-fund-1', idempotencyKey: 'fund-request-1' }
  ]]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.syncs)), [['2026', transactions]]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, inserted: 2, supabaseSync: { ok: true, synced: 4 } });
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
