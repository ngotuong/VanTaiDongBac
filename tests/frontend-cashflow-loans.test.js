const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const LOAN_GLOBALS = [
  'loadFundLoanOverview', 'renderFundLoanOverview', 'renderFundLoanPartnerFilter',
  'renderFundLoanHistoryFilters', 'renderFundLoanHistoryPager', 'setFundLoanHistoryPage',
  'filterFundLoanHistory', 'buildFundLoanMetrics', 'renderFundLoanMonthFilter',
  'openFundLoanPayment', 'closeFundLoanPaymentDrawer', 'openFundLoanAddDrawer',
  'closeFundLoanAddDrawer', 'onLoanPaymentTypeChange', 'submitFundLoanPayment',
  'validateFundLoanPayment', 'submitFundLoan', 'validateFundLoan'
];

test('cashflow loan globals have one frontend owner', () => {
  const files = fs.readdirSync(root).filter((file) => /^client_.*\.html$/.test(file));
  for (const functionName of LOAN_GLOBALS) {
    const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const owners = files.filter((file) => pattern.test(read(file)));
    assert.deepEqual(owners, ['client_cashflow_loans.html'], `${functionName} must have one frontend owner`);
  }
});

test('loan module preserves cache fallback, history, and settlement UI contracts', () => {
  const source = read('client_cashflow_loans.html');
  assert.match(source, /readFundLoanOverviewFromSupabase\('2026', month\)/);
  assert.match(source, /callApi\('GET', 'getFundLoanOverview'/);
  assert.match(source, /FUND_LOAN_HISTORY_PAGE_SIZE/);
  assert.match(source, /Đã tất toán/);
  assert.match(source, /Number\(item\.outstanding \|\| 0\) > 0/);
  assert.match(source, /fundLoanPaymentDrawer/);
  assert.match(source, /fundLoanAddDrawer/);
});

test('loan submit and payment contracts remain direct, validated, and refresh both views', () => {
  const source = read('client_cashflow_loans.html');
  assert.match(source, /callApi\('POST', 'addFundLoanPayment'/);
  assert.match(source, /callApi\('POST', 'addFundLoan'/);
  assert.match(source, /validateFundLoanPayment\(payment\)/);
  assert.match(source, /validateFundLoan\(loan\)/);
  assert.match(source, /loadFundLoanOverview\(true\)/);
  assert.match(source, /loadFundOverview\(true\)/);
  assert.match(source, /Vui lòng chọn loại thanh toán/);
});

test('cashflow loan fragment loads after pending jobs', () => {
  const template = read('index.template.html');
  const pending = template.indexOf("include('client_cashflow_pending')");
  const loans = template.indexOf("include('client_cashflow_loans')");
  assert.ok(pending >= 0 && loans > pending);
  assert.ok(loans < template.indexOf("include('client_manage')"));
});
