const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('cashflow uses one shared period filter for overview, transactions, and loans', () => {
  const ui = read('next-shell/components/cashflow/CashflowModule.tsx');
  assert.match(ui, /function SharedCashflowFilter/);
  assert.match(ui, /readSurface<FundRangePayload>\(year,\s*'range'/);
  assert.match(ui, /CUSTOM_RANGE_DEBOUNCE_MS = 280/);
  assert.match(ui, /period !== 'custom'/);
  assert.match(ui, /window\.setTimeout\([\s\S]*loadSharedRangeRef\.current\(\{ start: startDate, end: endDate \}\)[\s\S]*CUSTOM_RANGE_DEBOUNCE_MS/);
  assert.match(ui, /requestVersion !== sharedRangeRequestRef\.current/);
  assert.match(ui, /rangeKey === appliedRangeRef\.current\) return;[\s\S]*sharedRangeRequestRef\.current \+= 1;[\s\S]*window\.setTimeout/);
  assert.match(ui, /value > endDate\)\) setEndDate\(value\)/);
  assert.match(ui, /value < startDate\)\) setStartDate\(value\)/);
  assert.doesNotMatch(ui, /cashflow-filter-apply/);
  assert.match(ui, /cashflow-quick-period-select platform-content-select" data-fixed-filter-width="true"/);
  const css = read('next-shell/app/platform.css');
  assert.match(css, /Quỹ applies date ranges immediately[\s\S]*cashflow-quick-period-select\.platform-content-select\[data-adaptive-filter="selected"\][\s\S]*width: 142px !important;[\s\S]*@media \(max-width: 768px\)[\s\S]*width: 122px !important;/);
  assert.doesNotMatch(ui, /Áp dụng cho Tổng quan, Danh sách thu chi và Khoản vay/);
  assert.match(ui, /cashflow-filter-row-top/);
  assert.match(ui, /cashflow-filter-row-bottom/);
  assert.match(ui, /value === 'recent'[\s\S]*`\$\{year\}-01-01`/);
  assert.match(ui, /year === currentYear \? 'thisMonth' : 'recent'/);
  assert.match(ui, /min=\{`\$\{year\}-01-01`\}\s+max=\{`\$\{year\}-12-31`\}/);
  assert.match(ui, /disabled=\{!isCurrentYear\}/);
  assert.doesNotMatch(ui, /Toàn bộ \/ hiện tại/);
  assert.doesNotMatch(ui, /props\.month/);
});

test('shared range is forwarded through Next and Apps Script public API to every cashflow reader', () => {
  const server = read('next-shell/lib/cashflow-server.ts');
  const api = read('PublicApi.gs');
  assert.match(server, /getFundOverview'.*startDate,endDate/);
  assert.match(server, /getFundTransactions'.*startDate,endDate/);
  assert.match(server, /getFundLoanOverview'.*startDate,endDate/);
  assert.match(server, /Boolean\(startDate\)!==Boolean\(endDate\)/);
  assert.match(server, /Khoảng ngày Thu chi phải thuộc năm \$\{year\}/);
  assert.match(server, /const month=isCurrentYear\?`\$\{currentYear\}-\$\{datePart\('month'\)\}`:''/);
  assert.match(server, /monthly\?\{month\}:\{\}/);
  for (const action of ['getFundTransactions', 'getFundOverview', 'getFundLoanOverview']) {
    const block = api.slice(api.indexOf(`action === '${action}'`), api.indexOf("    }", api.indexOf(`action === '${action}'`)) + 5);
    assert.match(block, /startDate: safeParams\.startDate/);
    assert.match(block, /endDate: safeParams\.endDate/);
  }
});

test('cashflow KPI tones distinguish sign, balances, and loan repayment semantics', () => {
  const ui = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(ui, /key === 'periodNet'.*value < 0.*fund-tone-negative.*value > 0.*fund-tone-positive/);
  assert.match(ui, /openingBalance'.*fund-tone-opening/);
  assert.match(ui, /currentBalance'.*fund-tone-current/);
  assert.match(ui, /principalPaid'.*fund-tone-principal-paid/);
  for (const tone of ['positive', 'negative', 'opening', 'closing', 'current', 'borrowed', 'principal-paid', 'interest-paid']) {
    assert.match(css, new RegExp(`\\.fund-tone-${tone}`));
  }
});
