const test = require('node:test');
const assert = require('node:assert/strict');
const { createFundRangeService } = require('../server/services/fund-range-service.js');

test('Supabase overview range derives opening, period metrics, current balance, and categories without Apps Script', () => {
  const service = createFundRangeService();
  const payload = {
    metrics: [
      { key: 'openingBalance', value: 1000 },
      { key: 'currentBalance', value: 1350 }
    ],
    incomeCategories: [{ category: 'Cước', details: [
      { date: '2026-07-01', category: 'Cước', amount: 200 },
      { date: '2026-07-10', category: 'Cước', amount: 500 }
    ] }],
    expenseCategories: [{ category: 'Dầu', details: [
      { date: '2026-07-03', category: 'Dầu', amount: 100 },
      { date: '2026-07-12', category: 'Dầu', amount: 250 }
    ] }]
  };
  const result = service.buildOverviewRange([payload], '2026-07-08', '2026-07-15');
  const metrics = Object.fromEntries(result.metrics.map((item) => [item.key, item.value]));
  assert.deepEqual(metrics, {
    openingBalance: 1100,
    periodIncome: 500,
    periodExpense: 250,
    periodNet: 250,
    closingBalance: 1350,
    currentBalance: 1350
  });
  assert.equal(result.incomeCategories[0].count, 1);
  assert.equal(result.expenseCategories[0].count, 1);
  assert.equal(result.supabaseCached, true);
});

test('Supabase transaction range merges monthly bundles, de-duplicates rows, and sorts newest first', () => {
  const service = createFundRangeService();
  const duplicate = { rowIndex: 2, voucher: '2', date: '2026-07-31', amount: 20 };
  const result = service.mergeTransactionBundles([
    { transactions: [{ rowIndex: 1, voucher: '1', date: '2026-07-30', amount: 10 }, duplicate], supabaseSyncedAt: '2026-07-29T01:00:00Z' },
    { transactions: [duplicate, { rowIndex: 3, voucher: '3', date: '2026-08-01', amount: 30 }], supabaseSyncedAt: '2026-07-29T02:00:00Z' }
  ], '2026-07-30', '2026-08-01');
  assert.deepEqual(result.transactions.map((row) => row.voucher), ['3', '2', '1']);
  assert.equal(result.totalRows, 3);
  assert.equal(result.displayedRows, 3);
  assert.equal(result.limited, false);
  assert.equal(result.supabaseSyncedAt, '2026-07-29T01:00:00Z');
  assert.deepEqual(service.monthKeys('2026-07-30', '2026-09-02'), ['2026-07', '2026-08', '2026-09']);
});

test('all-year Fund ranges ignore leading gaps only when every bundle proves identical source-month coverage', () => {
  const service = createFundRangeService();
  const keys = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  const months = ['2026-05', '2026-06', '2026-07'].map((key) => ({ key }));
  const may = { payload: { month: '2026-05', months } };
  const june = { payload: { month: '2026-06', months } };
  const july = { payload: { month: '2026-07', months } };

  assert.deepEqual(service.contiguousCachedRows([null, null, null, null, may, june, july], keys), [may, june, july]);
  assert.deepEqual(service.contiguousCachedRows([null, null, may, null, july], keys.slice(0, 5)), []);
  assert.deepEqual(service.contiguousCachedRows([null, null, may, june, null], keys.slice(0, 5)), []);
  assert.deepEqual(service.contiguousCachedRows([null, null], keys.slice(0, 2)), []);
  assert.deepEqual(service.contiguousCachedRows([null, null, null, null, june, july], keys.slice(0, 6)), []);
  assert.deepEqual(service.contiguousCachedRows([null, null, null, null, { month: '2026-05' }, { month: '2026-06' }], keys.slice(0, 6)), []);
});

test('transaction range preserves limited and incomplete provenance from monthly bundles', () => {
  const service = createFundRangeService();
  const result = service.mergeTransactionBundles([
    { transactions: [{ rowIndex: 1, date: '2026-05-10', amount: 1 }], totalRows: 500, limited: true },
    { transactions: [{ rowIndex: 2, date: '2026-06-10', amount: 2 }], totalRows: 20 }
  ], '2026-05-01', '2026-06-30');
  assert.equal(result.displayedRows, 2);
  assert.equal(result.totalRows, 2);
  assert.equal(result.sourceTotalRows, 520);
  assert.equal(result.limited, true);
  assert.equal(result.incomplete, true);
});

test('Supabase loan range recomputes period totals and end-date outstanding from cached history', () => {
  const service = createFundRangeService();
  const payload = {
    loans: [{ code: 'V1', outstanding: 600, currentOutstanding: 600, isCurrentlySettled: false }],
    recentRows: [
      { rowIndex: 1, code: 'V1', loanKey: 'V1', date: '2026-07-01', dateText: '01/07/2026', type: 'Vay', partner: 'A', amount: 1000 },
      { rowIndex: 2, code: 'V1', loanKey: 'V1', date: '2026-07-10', type: 'Trả nợ', partner: 'A', amount: 200 },
      { rowIndex: 3, code: 'V1', loanKey: 'V1', date: '2026-07-15', type: 'Trả lãi', partner: 'A', amount: 50 },
      { rowIndex: 4, code: 'V1', loanKey: 'V1', date: '2026-07-25', type: 'Trả nợ', partner: 'A', amount: 200 }
    ]
  };
  const result = service.buildLoansRange(payload, '2026-07-08', '2026-07-20');
  const metrics = Object.fromEntries(result.metrics.map((item) => [item.key, item.value]));
  assert.deepEqual(metrics, { borrowed: 0, principalPaid: 200, interestPaid: 50, outstanding: 800 });
  assert.equal(result.recentRows.length, 2);
  assert.equal(result.loans[0].outstanding, 800);
});
