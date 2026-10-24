const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadService(overrides = {}) {
  const vmContext = vm.createContext({});
  new vm.Script(read('FundSyncService.gs'), { filename: 'FundSyncService.gs#test' }).runInContext(vmContext);
  const calls = { reads: [], upserts: [], deletes: [], statuses: [] };
  const syncTime = '2026-07-11T17:00:00.000Z';
  const context = {
    clean(value) { return value === null || value === undefined ? '' : String(value).trim(); },
    nowISOString() { return syncTime; },
    encodeSearch(value) { return Buffer.from(String(value), 'utf8').toString('base64url'); },
    getFundOverview(year, filter) {
      calls.reads.push(['overview', year, filter]);
      return { kind: 'overview', year, filter, months: [{ key: '2026-06' }, { key: '2026-07' }] };
    },
    getFundTransactions(year, filter) { calls.reads.push(['transactions', year, filter]); return { kind: 'transactions', year, filter }; },
    getFundLoanOverview(year, filter) { calls.reads.push(['loans', year, filter]); return { kind: 'loans', year, filter }; },
    getFundFormOptions(year, forceRefresh) { calls.reads.push(['formOptions', year, forceRefresh]); return { kind: 'formOptions', year }; },
    getFundCatalog(year, group, forceRefresh) { calls.reads.push(['catalog', year, group, forceRefresh]); return { kind: 'catalog', year, group }; },
    parseDateValue(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    },
    formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; },
    upsertRows(tableName, rows, onConflict) { calls.upserts.push({ tableName, rows, onConflict }); },
    deleteRows(tableName, filters) { calls.deletes.push({ tableName, filters }); },
    writeSyncStatus(...args) { calls.statuses.push(args); },
    runSyncStep(results, errors, name, fn) {
      try { results.push({ name, result: fn() }); } catch (error) { errors.push({ name, error: error.message }); }
    },
    ...overrides
  };
  return { service: vmContext.FundSyncService, context, calls, syncTime };
}

test('fund overview, transaction, and loan sync preserve tables, keys, rows, and statuses', () => {
  const { service, context, calls, syncTime } = loadService();
  const overview = service.syncFundOverview('2026', '07/2026', context);
  const transactions = service.syncFundTransactions('2026', { month: '2026-07', limit: 1000 }, context);
  const loans = service.syncFundLoanOverview('2026', '', context);
  assert.deepEqual(JSON.parse(JSON.stringify([overview, transactions, loans])), [
    { ok: true, table: 'fund_overview_bundles', year: '2026', monthKey: '2026-07', syncedAt: syncTime },
    { ok: true, table: 'fund_transaction_bundles', year: '2026', filterKey: 'month:2026-07:recent_1000', syncedAt: syncTime },
    { ok: true, table: 'fund_loan_bundles', year: '2026', monthKey: '', syncedAt: syncTime }
  ]);
  assert.deepEqual(calls.upserts.map((call) => [call.tableName, call.onConflict]), [
    ['fund_overview_bundles', 'year,month_key'],
    ['fund_transaction_bundles', 'year,filter_key'],
    ['fund_loan_bundles', 'year,month_key']
  ]);
  assert.deepEqual(calls.statuses.map((row) => row[0]), [
    'fund_overview:2026:2026-07', 'fund_transactions:2026:month:2026-07:recent_1000', 'fund_loans:2026:latest'
  ]);
});

test('complete monthly capture publishes immutable pages before the canonical manifest', () => {
  const rows = Array.from({ length: 405 }, (_, index) => ({ rowIndex: index + 2, voucher: `V${index}`, date: '2026-07-01', amount: index }));
  const { service, context, calls } = loadService({
    getFundTransactions() {
      return { ok: true, selectedMonth: '2026-07', transactions: rows, totalRows: rows.length, completeCapture: true, cacheVersion: 'version-1', months: [{ key: '2026-07' }] };
    }
  });
  const result = service.syncFundTransactions('2026', { month: '2026-07', limit: 1000 }, context);
  assert.equal(result.pageCount, 3);
  assert.equal(calls.upserts.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.upserts[0].rows.map((row) => row.filter_key))), [
    'month:2026-07:version:version-1:page:1',
    'month:2026-07:version:version-1:page:2',
    'month:2026-07:version:version-1:page:3'
  ]);
  const publishedManifest = calls.upserts[1].rows[0];
  assert.equal(publishedManifest.filter_key, 'month:2026-07');
  assert.equal(publishedManifest.payload.transactions.length, 200);
  assert.equal(publishedManifest.payload.totalRows, 405);
  assert.deepEqual(JSON.parse(JSON.stringify(publishedManifest.payload.pagination)), { version: 'version-1', cachePageSize: 200, pageCount: 3, totalRows: 405 });
  assert.equal(publishedManifest.payload.completeCapture, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.deletes)), [{ tableName: 'fund_transaction_bundles', filters: {
    year: 'eq.2026',
    and: '(filter_key.like.month:2026-07:version:*,filter_key.not.like.month:2026-07:version:version-1:*)'
  } }]);
});

test('fund catalog sync preserves six targets and stable catalog keys', () => {
  const { service, context, calls } = loadService();
  const result = service.syncAllFundCatalogBundles('2026', context);
  assert.equal(result.ok, true);
  assert.equal(result.synced, 6);
  assert.deepEqual(calls.upserts.map((call) => call.rows[0].catalog_key), [
    'fund_form_options:2026',
    'fund_catalog:2026:incomeCategories', 'fund_catalog:2026:expenseCategories',
    'fund_catalog:2026:actors', 'fund_catalog:2026:partners', 'fund_catalog:2026:loanPartners'
  ]);
  assert.equal(calls.reads.every((call) => call[call.length - 1] === true), true);
});

test('full and after-write sync preserve month scope and orchestration result counts', () => {
  const full = loadService();
  const fullResult = full.service.syncAllFundBundles('2026', full.context);
  assert.deepEqual(JSON.parse(JSON.stringify(fullResult.months)), ['2026-06', '2026-07']);
  assert.equal(fullResult.synced, 10);
  assert.equal(fullResult.failed, 0);

  const afterWrite = loadService();
  const result = afterWrite.service.syncFundAfterWrite('2026', {}, afterWrite.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), ['2026-07', '2026-06']);
  assert.equal(result.synced, 9);
  const transactionResult = afterWrite.service.syncFundTransactionsAfterWrite('2026', [{ date: '2026-07-11' }], afterWrite.context);
  assert.equal(transactionResult.synced, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(transactionResult.months)), ['2026-07']);
});

test('SupabaseService retains fund facades while FundSyncService owns fund sync implementation', () => {
  const facade = read('SupabaseService.gs');
  const implementation = read('FundSyncService.gs');
  assert.match(facade, /FundSyncService\.syncFundOverview\(year, month, fundSyncContext_\(\)\)/);
  assert.match(facade, /FundSyncService\.syncAllFundBundles\(year, fundSyncContext_\(\)\)/);
  assert.match(facade, /FundSyncService\.syncFundAfterWrite\(year, input, fundSyncContext_\(\)\)/);
  assert.doesNotMatch(facade, /fund_overview:.*Fund overview cache synced/);
  assert.doesNotMatch(facade, /var explicitMonths = options\.months/);
  assert.match(implementation, /function getFundWriteMonthKeys\(year, options, context\)/);
  assert.match(implementation, /var DEFAULT_FUND_TRANSACTION_FILTER_KEY = 'recent_500'/);
});
