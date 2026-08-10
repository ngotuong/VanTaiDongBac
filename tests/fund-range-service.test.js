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
  assert.equal(result.supabaseSyncedAt, '2026-07-29T01:00:00Z');
  assert.deepEqual(service.monthKeys('2026-07-30', '2026-09-02'), ['2026-07', '2026-08', '2026-09']);
});

test('all-year Fund ranges ignore only leading pre-data cache gaps and reject internal or trailing gaps', () => {
  const service = createFundRangeService();
  const may = { month: '2026-05' };
  const june = { month: '2026-06' };
  const july = { month: '2026-07' };

  assert.deepEqual(service.contiguousCachedRows([null, null, null, null, may, june, july]), [may, june, july]);
  assert.deepEqual(service.contiguousCachedRows([null, null, may, null, july]), []);
  assert.deepEqual(service.contiguousCachedRows([null, null, may, june, null]), []);
  assert.deepEqual(service.contiguousCachedRows([null, null]), []);
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
