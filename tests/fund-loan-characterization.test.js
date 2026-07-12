const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pad = (value) => String(value).padStart(2, '0');
const format = (date, pattern) => pattern.replace('yyyy', date.getFullYear()).replace('yy', String(date.getFullYear()).slice(-2))
  .replace('MM', pad(date.getMonth() + 1)).replace('dd', pad(date.getDate())).replace('HH', pad(date.getHours()))
  .replace('mm', pad(date.getMinutes())).replace('ss', pad(date.getSeconds()));

function loadFund(rows, options = {}) {
  const calls = [];
  const rawDates = rows.map((row) => [row.rawDate || row.values[1]]);
  const displayRows = rows.map((row) => row.values);
  const sheet = {
    getLastRow: () => options.empty ? 1 : displayRows.length + 1,
    getLastColumn: () => 14,
    getMaxRows: () => options.maxRows || 20,
    insertRowsAfter: (...args) => calls.push(['grow', ...args]),
    getRange(row, column, height, width) {
      const key = [row, column, height || 1, width || 1].join(':');
      return {
        getDisplayValues() {
          if (row === 2 && column === 1) return displayRows;
          return [];
        },
        getValues() {
          if (row === 2 && column === 2 && width === 1) return rawDates;
          if (row === 1 && column === 2) return [['']];
          return [];
        },
        setValues: (value) => calls.push(['values', key, value]),
        setNumberFormat: (value) => calls.push(['format', key, value]),
        setFormula: (value) => calls.push(['formula', key, value])
      };
    }
  };
  const properties = { getProperty: (key) => key === 'FUND_SPREADSHEET_ID_2026' ? 'fund-2026' : '', setProperty: (...args) => calls.push(['property', ...args]) };
  const sandbox = vm.createContext({
    APP_CONFIG: { timezone: 'Asia/Ho_Chi_Minh' },
    Utilities: { formatDate: (date, timezone, pattern) => format(date, pattern) },
    SpreadsheetApp: { openById: (id) => ({ getSheetByName: (name) => name === 'NHAP_VAY' ? sheet : null, getId: () => id }), flush: () => calls.push(['flush']) },
    PropertiesService: { getScriptProperties: () => properties },
    CacheService: { getScriptCache: () => ({ get: () => null, getAll: () => ({}), putAll() {}, put() {} }) },
    LockService: { getScriptLock: () => ({ waitLock: (ms) => calls.push(['lock', ms]), releaseLock: () => calls.push(['unlock']) }) },
    FundCatalogRepository: {}, FundCatalogService: {}, FundTransactionRepository: {}, FundTransactionService: {},
    console: { warn() {} }
  });
  new vm.Script(read('NormalizationUtils.gs')).runInContext(sandbox);
  new vm.Script(read('FundLoanRepository.gs')).runInContext(sandbox);
  new vm.Script(read('FundLoanService.gs')).runInContext(sandbox);
  new vm.Script(read('FundService.gs')).runInContext(sandbox);
  return { service: sandbox.FundService, sheet, calls };
}

function loan(code, date, type, partner, amount, extras = {}) {
  return { rawDate: new Date(`${date}T00:00:00`), values: [code, date.split('-').reverse().join('/'), type, extras.method || '', partner,
    String(amount), String(extras.termMonths || ''), String(extras.annualRate || ''), String(extras.interestPeriodMonths || ''), extras.firstInterestDate || '', extras.content || ''] };
}

test('loan overview preserves exact reconciliation, partial settlement, interest, and current totals', () => {
  const rows = [loan('L1', '2026-05-01', 'Vay', 'A', 1000), loan('L1', '2026-06-01', 'Trả nợ', 'A', 400),
    loan('L1', '2026-06-15', 'Trả lãi', 'A', 50), loan('L2', '2026-06-02', 'Vay', 'B', 700), loan('L2', '2026-07-01', 'Trả nợ', 'B', 700)];
  const result = loadFund(rows).service.getFundLoanOverview('2026', {});
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.map((item) => [item.key, item.value]))),
    [['borrowed', 1700], ['principalPaid', 1100], ['interestPaid', 50], ['outstanding', 600]]);
  const l1 = result.loans.find((item) => item.code === 'L1');
  const l2 = result.loans.find((item) => item.code === 'L2');
  assert.equal(l1.outstanding, 600);
  assert.equal(l1.interestPaid, 50);
  assert.equal(l2.isCurrentlySettled, true);
  assert.equal(l2.currentSettlementDate, '2026-07-01');
});

test('historical month keeps period metrics but computes end-of-month outstanding and current settlement metadata', () => {
  const rows = [loan('L1', '2026-05-01', 'Vay', 'A', 1000), loan('L1', '2026-06-10', 'Trả nợ', 'A', 400), loan('L1', '2026-07-10', 'Trả nợ', 'A', 600)];
  const result = loadFund(rows).service.getFundLoanOverview('2026', { month: '2026-06' });
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.map((item) => [item.key, item.value]))),
    [['borrowed', 0], ['principalPaid', 400], ['interestPaid', 0], ['outstanding', 600]]);
  assert.equal(result.loans[0].outstanding, 600);
  assert.equal(result.loans[0].isCurrentlySettled, true);
  assert.equal(result.loans[0].currentSettlementDateText, '10/07/2026');
  assert.equal(result.recentRows.length, 1);
  assert.equal(result.recentRows[0].statusLabel, 'Đã trả gốc');
});

test('safe orphan reconciliation accepts one exact balance and records original code', () => {
  const rows = [loan('L1', '2026-05-01', 'Vay', 'A', 1000), loan('WRONG', '2026-06-01', 'Trả nợ', 'A', 1000)];
  const result = loadFund(rows).service.getFundLoanOverview('2026', {});
  const payment = result.recentRows.find((row) => row.type === 'Trả nợ');
  assert.equal(payment.loanKey, 'L1');
  assert.equal(payment.reconciledFromCode, 'WRONG');
  assert.equal(result.loans.find((item) => item.code === 'L1').outstanding, 0);
});

test('ambiguous or non-matching orphan payment remains separate and cannot settle a loan', () => {
  const ambiguous = [loan('L1', '2026-05-01', 'Vay', 'A', 1000), loan('L2', '2026-05-02', 'Vay', 'A', 1000), loan('WRONG', '2026-06-01', 'Trả nợ', 'A', 1000)];
  const result = loadFund(ambiguous).service.getFundLoanOverview('2026', {});
  const payment = result.recentRows.find((row) => row.code === 'WRONG');
  assert.equal(payment.loanKey, 'WRONG');
  assert.equal(payment.reconciledFromCode, '');
  assert.equal(result.loans.filter((item) => item.code === 'L1' || item.code === 'L2').every((item) => item.outstanding === 1000), true);
  const mismatch = loadFund([loan('L1', '2026-05-01', 'Vay', 'A', 1000), loan('X', '2026-06-01', 'Trả nợ', 'A', 999)]).service.getFundLoanOverview('2026', {});
  assert.equal(mismatch.recentRows.find((row) => row.code === 'X').loanKey, 'X');
});

test('loan row reader preserves type variants, terms, rate, first-interest date, amount, and descending history', () => {
  const rows = [loan('L1', '2026-05-01', 'Vay vốn', 'A', '1.200.000', { termMonths: 12, annualRate: 8.5, interestPeriodMonths: 3, firstInterestDate: '01/08/2026' }),
    loan('L1', '2026-06-01', 'Trả gốc', 'A', '200.000')];
  const result = loadFund(rows).service.getFundLoanOverview('2026', {});
  assert.equal(result.recentRows[0].type, 'Trả nợ');
  assert.equal(result.recentRows[1].type, 'Vay');
  assert.equal(result.recentRows[1].amount, 1200000);
  assert.equal(result.recentRows[1].termMonths, 12);
  assert.equal(result.recentRows[1].annualRate, 8.5);
  assert.equal(result.recentRows[1].firstInterestDate, '01/08/2026');
});

test('add loan preserves A:K mapping, formats B/F, formula N, growth, lock, and response', () => {
  const app = loadFund([], { empty: true, maxRows: 1 });
  const result = app.service.addFundLoan('2026', { date: '2026-07-11', partner: 'Bank', amount: 1000, method: 'CK', termMonths: 12, annualRate: 8, interestPeriodMonths: 3, firstInterestDate: '2026-08-01', content: 'Vay vốn' });
  assert.equal(result.ok, true);
  assert.equal(result.rowIndex, 2);
  assert.equal(result.sheetName, 'NHAP_VAY');
  const written = app.calls.find((call) => call[0] === 'values')[2][0];
  assert.equal(written.length, 11);
  assert.deepEqual(JSON.parse(JSON.stringify(written.slice(2, 6))), ['Vay', 'CK', 'Bank', 1000]);
  assert.equal(app.calls.some((call) => call[0] === 'formula' && call[1] === '2:14:1:1'), true);
  assert.deepEqual(app.calls.find((call) => call[0] === 'grow'), ['grow', 1, 1]);
});

test('add payment preserves loan code/type and rejects invalid loan/payment payloads before write', () => {
  const app = loadFund([], { empty: true });
  const result = app.service.addFundLoanPayment('2026', { date: '2026-07-11', code: 'L1', type: 'Trả lãi', partner: 'Bank', amount: 50, content: 'Lãi kỳ 1' });
  const written = app.calls.find((call) => call[0] === 'values')[2][0];
  assert.equal(result.code, 'L1');
  assert.equal(written[0], 'L1');
  assert.equal(written[2], 'Trả lãi');
  assert.deepEqual(JSON.parse(JSON.stringify(written.slice(3, 6))), ['', 'Bank', 50]);
  assert.throws(() => loadFund([], { empty: true }).service.addFundLoan('2026', { date: '', partner: 'A', amount: 1 }), /ngày vay hợp lệ/);
  assert.throws(() => loadFund([], { empty: true }).service.addFundLoanPayment('2026', { date: '2026-07-11', code: '', type: 'Trả nợ', partner: 'A', amount: 1 }), /Thiếu mã khoản vay/);
  assert.throws(() => loadFund([], { empty: true }).service.addFundLoanPayment('2026', { date: '2026-07-11', code: 'L', type: 'Khác', partner: 'A', amount: 1 }), /Trả nợ hoặc Trả lãi/);
});

test('loan filter formula contract and FundService ownership markers remain explicit before extraction', () => {
  const source = read('FundService.gs');
  const implementation = read('FundLoanService.gs');
  assert.match(implementation, /function buildFilterFormula\(rowNumber\)/);
  assert.match(implementation, /BC_VAY!\$P\$9/);
  assert.match(implementation, /BC_VAY!\$R\$9/);
  assert.match(implementation, /BC_VAY!\$S\$9/);
  assert.match(source, /FundLoanService\.getOverview\(filter \|\| \{\}/);
  assert.match(implementation, /function reconcile\(rows, context\)/);
  assert.match(source, /FundLoanService\.addLoan\(payload, context\)/);
  assert.match(source, /FundLoanService\.addPayment\(payload, context\)/);
});
