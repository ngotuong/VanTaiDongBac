const test = require('node:test');
const assert = require('node:assert/strict');
const { createFundTransactionPageService } = require('../server/services/fund-transaction-page-service.js');

const manifest = (month, version, totalRows) => ({
  selectedMonth: month,
  months: [{ key: month, label: `${month.slice(5)}/${month.slice(0, 4)}` }],
  pagination: { version, cachePageSize: 2, pageCount: 2, totalRows },
  supabaseSyncedAt: '2026-10-24T01:00:00Z'
});

test('paged transaction service filters the complete cache before returning one stable page', () => {
  const service = createFundTransactionPageService();
  const result = service.build({
    manifests: [manifest('2026-09', 'v9', 2), manifest('2026-10', 'v10', 3)],
    pageBundles: [
      { cachePage: 1, transactions: [
        { rowIndex: 5, voucher: 'T5', date: '2026-10-20', type: 'Thu', amount: 500, partner: 'B', content: 'Cước tháng mười' },
        { rowIndex: 4, voucher: 'T4', date: '2026-10-10', type: 'Chi', amount: 400, partner: 'A', content: 'Dầu' }
      ] },
      { cachePage: 2, transactions: [{ rowIndex: 3, voucher: 'T3', date: '2026-10-01', type: 'Thu', amount: 300, partner: 'A', content: 'Cước đầu tháng' }] },
      { cachePage: 1, transactions: [{ rowIndex: 2, voucher: 'T2', date: '2026-09-20', type: 'Chi', amount: 200, partner: 'B', content: 'Dầu' }] },
      { cachePage: 2, transactions: [{ rowIndex: 1, voucher: 'T1', date: '2026-09-01', type: 'Thu', amount: 100, partner: 'A', content: 'Cước cũ' }] }
    ],
    startDate: '2026-09-01', endDate: '2026-10-31', search: 'cuoc', page: 2, pageSize: 2
  });
  assert.deepEqual(result.transactions.map((row) => row.voucher), ['T1']);
  assert.equal(result.totalRows, 3);
  assert.equal(result.displayedRows, 1);
  assert.equal(result.sourceTotalRows, 5);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.limited, false);
  assert.equal(result.cacheVersion, 'v10:v9');
});

test('debt mode derives partner options and totals from all matching source pages', () => {
  const service = createFundTransactionPageService();
  const result = service.build({
    manifests: [manifest('2026-10', 'v10', 4)],
    pageBundles: [
      { cachePage: 1, transactions: [
        { rowIndex: 4, date: '2026-10-04', type: 'Thu', debt: 'Có', remainingDebt: 700, partner: 'B' },
        { rowIndex: 3, date: '2026-10-03', type: 'Chi', debt: 'Có', remainingDebt: 200, partner: 'A' }
      ] },
      { cachePage: 2, transactions: [
        { rowIndex: 2, date: '2026-10-02', type: 'Thu', debt: '', remainingDebt: 999, partner: 'C' },
        { rowIndex: 1, date: '2026-10-01', type: 'Chi', debt: true, remainingDebt: 100, partner: 'B' }
      ] }
    ],
    mode: 'debt', page: 1, pageSize: 1
  });
  assert.deepEqual(result.partners, ['A', 'B']);
  assert.deepEqual(result.debtSummary, { receivable: 700, payable: 300, net: 400 });
  assert.equal(result.totalRows, 3);
  assert.equal(result.transactions.length, 1);
});

test('paged manifest detection rejects legacy or incomplete metadata', () => {
  const service = createFundTransactionPageService();
  assert.equal(service.isPagedManifest(manifest('2026-10', 'v1', 2)), true);
  assert.equal(service.isPagedManifest({ transactions: [] }), false);
  assert.equal(service.isPagedManifest({ pagination: { version: 'v1', cachePageSize: 200, pageCount: 0 } }), false);
});

test('direct monthly page slices only the required immutable cache window', () => {
  const service = createFundTransactionPageService();
  const monthly = { ...manifest('2026-10', 'v10', 405), pagination: { version: 'v10', cachePageSize: 200, pageCount: 3, totalRows: 405 } };
  const result = service.buildDirectPage(monthly, [{ cachePage: 2, transactions: Array.from({ length: 200 }, (_, index) => ({ rowIndex: 202 + index })) }], 11, 20);
  assert.deepEqual(result.transactions.map((row) => row.rowIndex), Array.from({ length: 20 }, (_, index) => 202 + index));
  assert.equal(result.totalRows, 405);
  assert.equal(result.page, 11);
  assert.equal(result.totalPages, 21);
  assert.equal(result.cacheVersion, 'v10');
});
