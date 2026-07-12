const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stripScript = (source) => source.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

const TRANSACTION_GLOBALS = [
  'loadFundFormOptions', 'renderFundFormOptions', 'handleFundTypeChange',
  'newBlankFundTransaction', 'renderFundTransactionRows', 'submitFundTransaction',
  'formatFundWriteRowRange', 'validateFundTransactions', 'validateFundTransaction',
  'openFundTransactionAddDrawer', 'closeFundTransactionAddDrawer',
  'loadFundTransactions', 'readFundTransactionsRangeFromSupabase',
  'getFundMonthKeysForRange', 'combineFundTransactionPayloads',
  'filterFundTransactionsPayload', 'setFundQuickDate', 'setFundCustomDate',
  'renderFundTransactions', 'renderFundTransactionsPager', 'setFundTransactionsPage'
];

test('cashflow transaction/entry globals have one frontend owner', () => {
  const files = fs.readdirSync(root).filter((file) => /^client_.*\.html$/.test(file));
  for (const functionName of TRANSACTION_GLOBALS) {
    const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const owners = files.filter((file) => pattern.test(read(file)));
    assert.deepEqual(owners, ['client_cashflow_transactions.html'], `${functionName} must have one frontend owner`);
  }
});

test('transaction module preserves direct/queued submit, voucher, and cache contracts', () => {
  const source = read('client_cashflow_transactions.html');
  assert.match(source, /callApi\('POST', 'addFundTransactions'/);
  assert.match(source, /trackPendingFundWriteJob\(res, transactions\)/);
  assert.match(source, /pollFundWriteJob\(res\.jobId\)/);
  assert.match(source, /fundSubmitRequestId/);
  assert.match(source, /readFundTransactionsFromSupabase/);
  assert.match(source, /loadFundTransactionsFromAppsScript/);
  assert.match(source, /pendingFundWriteJobs\.flatMap/);
  assert.match(source, /fundTransactionsTableBody/);
});

test('transaction month-range and payload merge helpers preserve limits and de-duplication', () => {
  const context = vm.createContext({ console, window: {}, parseFundDateValue: (value) => Date.parse(value) });
  new vm.Script(stripScript(read('client_cashflow_transactions.html')), { filename: 'client_cashflow_transactions.html' }).runInContext(context);

  assert.deepEqual(Array.from(context.getFundMonthKeysForRange('2026-05-01', '2026-07-31')), ['2026-05', '2026-06', '2026-07']);
  assert.deepEqual(Array.from(context.getFundMonthKeysForRange('2026-08-01', '2026-07-31')), []);
  const merged = context.combineFundTransactionPayloads([
    { months: [{ key: '2026-07', label: '07/2026' }], transactions: [{ rowIndex: 2, voucher: 'A', date: '2026-07-02' }] },
    { months: [{ key: '2026-06', label: '06/2026' }], transactions: [{ rowIndex: 2, voucher: 'A', date: '2026-07-02' }, { rowIndex: 1, voucher: 'B', date: '2026-06-01' }] }
  ]);
  assert.equal(merged.transactions.length, 2);
  assert.deepEqual(Array.from(merged.months, (item) => item.key), ['2026-07', '2026-06']);
});

test('cashflow transactions fragment loads after facade and overview', () => {
  const template = read('index.template.html');
  const facade = template.indexOf("include('client_cashflow')");
  const overview = template.indexOf("include('client_cashflow_overview')");
  const transactions = template.indexOf("include('client_cashflow_transactions')");
  assert.ok(facade >= 0 && overview > facade && transactions > overview);
  assert.ok(transactions < template.indexOf("include('client_manage')"));
});
