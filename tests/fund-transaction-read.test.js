const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const sandbox = vm.createContext({});
  new vm.Script(read('FundTransactionRepository.gs')).runInContext(sandbox);
  new vm.Script(read('FundTransactionService.gs')).runInContext(sandbox);
  return sandbox;
}

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}

function date(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? new Date(+match[3], +match[2] - 1, +match[1]) : null;
}

function format(value, pattern) {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return pattern === 'yyyy-MM' ? `${yyyy}-${mm}` : pattern === 'MM/yyyy' ? `${mm}/${yyyy}` : `${yyyy}-${mm}-${dd}`;
}

function sheet(displayRows, rawDates, headers) {
  const allHeaders = headers || ['Số phiếu', 'Ngày', 'MỤC THU', 'MỤC CHI', 'Hình thức', 'Số tiền', 'Người Thu/Chi', 'Đối tác', 'Nội dung', 'Công nợ'];
  return {
    getLastRow: () => displayRows.length + 1,
    getLastColumn: () => allHeaders.length,
    getRange(row, column, count, width) {
      if (row === 1) return { getDisplayValues: () => [allHeaders] };
      if (width === 1) return { getValues: () => rawDates.map((item) => [item]) };
      return { getDisplayValues: () => displayRows };
    }
  };
}

function context(repository, targetSheet) {
  return {
    repository, spreadsheet: { getSheetByName: () => targetSheet }, sheetName: 'NHAP_THUCHI',
    headers: ['Số phiếu', 'Ngày', 'MỤC THU', 'MỤC CHI', 'Hình thức', 'Số tiền', 'Người Thu/Chi', 'Đối tác', 'Nội dung', 'Công nợ'],
    clean: (value) => String(value == null ? '' : value).trim(), normalizeHeader: normalize,
    normalizeMonth: (value) => value || '', parseDate: date, formatDate: format,
    parseNumber: (value) => Number(String(value).replace(/\./g, '')) || 0
  };
}

test('repository resolves accented headers and preserves the legacy no-voucher fallback', () => {
  const { FundTransactionRepository: repository } = load();
  const columns = repository.getColumns(['Ngày', 'Mục thu', 'Mục chi', 'Hình thức', 'Số tiền', 'Người Thu/Chi', 'Đối tác', 'Nội dung', 'Công nợ'], normalize);
  assert.deepEqual(JSON.parse(JSON.stringify(columns)), { voucher: -1, date: 0, income: 1, expense: 2, method: 3, amount: 4, actor: 5, partner: 6, content: 7, debt: 8 });
});

test('read service preserves mapping, month list, filtering, sorting, and limit contract', () => {
  const { FundTransactionRepository: repository, FundTransactionService: service } = load();
  const rows = [
    ['PT1', '10/06/2026', 'Cước', '', 'TM', '1.200.000', 'An', 'A', 'Thu cước', ''],
    ['PC2', '11/07/2026', '', 'Nhiên liệu', 'CK', '500.000', 'Bình', 'B', 'Đổ dầu', 'Có'],
    ['PT3', '11/07/2026', 'Khác', '', 'TM', '300.000', 'Chi', 'C', 'Thu khác', '']
  ];
  const result = service.getTransactions('2026', { month: '2026-07', search: 'thu', limit: 1 }, context(repository, sheet(rows, [new Date(2026, 5, 10), new Date(2026, 6, 11), new Date(2026, 6, 11)])));
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), [{ key: '2026-07', label: '07/2026' }, { key: '2026-06', label: '06/2026' }]);
  assert.equal(result.totalRows, 1);
  assert.equal(result.limited, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.transactions[0])), {
    rowIndex: 4, voucher: 'PT3', date: '2026-07-11', dateText: '11/07/2026', month: '2026-07', monthLabel: '07/2026',
    type: 'Thu', category: 'Khác', incomeCategory: 'Khác', expenseCategory: '', method: 'TM', amount: 300000,
    amountText: '300.000', actor: 'Chi', partner: 'C', content: 'Thu khác', debt: ''
  });
});

test('empty and missing-sheet behavior stays unchanged', () => {
  const { FundTransactionRepository: repository, FundTransactionService: service } = load();
  const emptySheet = { getLastRow: () => 1, getLastColumn: () => 10 };
  const result = service.getTransactions('', {}, context(repository, emptySheet));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, year: '', sheetName: 'NHAP_THUCHI', headers: context(repository, emptySheet).headers, months: [], transactions: [] });
  assert.throws(() => repository.readSnapshot({ getSheetByName: () => null }, { sheetName: 'NHAP_THUCHI', headers: [], normalizeHeader: normalize }), /Không tìm thấy sheet Thu chi/);
});

test('FundService keeps cache orchestration and delegates read ownership', () => {
  const facade = read('FundService.gs');
  const readFacade = facade.slice(facade.indexOf('function getFundTransactions'), facade.indexOf('function addFundTransaction'));
  assert.match(facade, /FundTransactionService\.getTransactions\(year, options/);
  assert.match(facade, /putFundCache_\(transactionsCacheKey, result, FUND_TTL_SECONDS\)/);
  assert.doesNotMatch(readFacade, /getRange\(2, 1, lastRow - 1, lastCol\)/);
});

function writeContext(serviceOverrides = {}) {
  return {
    clean: (value) => String(value == null ? '' : value).trim(), parseDate: date,
    parseNumber: (value) => Number(String(value || '').replace(/\./g, '')) || 0,
    buildVoucherSeed: () => '260711220000123',
    buildVoucher: (seed, index) => `${seed}-${String(index + 1).padStart(2, '0')}`,
    sheetName: 'NHAP_THUCHI', spreadsheet: { getId: () => 'sheet-id', getName: () => 'Thu chi 2026' }, sheet: {},
    ...serviceOverrides
  };
}

test('write service preserves validation messages, row mapping, and stable batch vouchers', () => {
  const { FundTransactionService: service } = load();
  const context = writeContext();
  assert.deepEqual(JSON.parse(JSON.stringify(service.validate([
    { date: '11/07/2026', type: 'Thu', category: 'Cước', amount: '1.200.000', actor: 'An' }
  ], context))), { ok: true, count: 1 });
  const row = service.buildRow({ date: '11/07/2026', type: 'Chi', category: 'Dầu', amount: '500.000', actor: 'Bình', debt: true, partner: 'Xe 1' }, 'seed', 1, context);
  assert.equal(row[0], 'seed-02');
  assert.deepEqual(JSON.parse(JSON.stringify(row.slice(2))), ['', 'Dầu', '', 500000, 'Bình', 'Xe 1', '', 'Có']);
  assert.throws(() => service.validate([{ type: 'Thu' }], context), /Dòng 1: Vui lòng nhập ngày hợp lệ/);
  assert.throws(() => service.buildRow({ date: '11/07/2026', type: 'Thu', category: 'Cước', amount: 1, actor: 'An', debt: true }, '', 0, context), /Khoản công nợ cần có Đối tác/);
});

test('write service preserves append result, full replay, and partial-voucher conflict', () => {
  const { FundTransactionService: service } = load();
  const payloads = [
    { voucher: 'V1', date: '11/07/2026', type: 'Thu', category: 'Cước', amount: 100, actor: 'An' },
    { voucher: 'V2', date: '11/07/2026', type: 'Chi', category: 'Dầu', amount: 50, actor: 'Bình' }
  ];
  let appended;
  const repository = {
    findVoucherRows: () => ({}),
    appendRows(sheetValue, rows) { appended = rows; return { firstRow: 20, lastRow: 21 }; }
  };
  const result = service.addTransactions(payloads, {}, writeContext({ repository }));
  assert.equal(appended.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true, inserted: 2, spreadsheetId: 'sheet-id', spreadsheetName: 'Thu chi 2026', firstRow: 20, lastRow: 21,
    rows: [
      { ok: true, rowIndex: 20, voucher: 'V1', spreadsheetId: 'sheet-id', spreadsheetName: 'Thu chi 2026', sheetName: 'NHAP_THUCHI' },
      { ok: true, rowIndex: 21, voucher: 'V2', spreadsheetId: 'sheet-id', spreadsheetName: 'Thu chi 2026', sheetName: 'NHAP_THUCHI' }
    ], sheetName: 'NHAP_THUCHI'
  });
  const replay = service.addTransactions(payloads, { jobId: 'job-1' }, writeContext({ repository: { findVoucherRows: () => ({ V1: 7, V2: 9 }) } }));
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.firstRow, 7);
  assert.equal(replay.lastRow, 9);
  assert.equal(replay.jobId, 'job-1');
  assert.throws(() => service.addTransactions(payloads, {}, writeContext({ repository: { findVoucherRows: () => ({ V1: 7 }) } })), /tồn tại một phần voucher/);
});

test('repository append preserves formats, helper formulas, growth, flush, and rollback callback', () => {
  const { FundTransactionRepository: repository } = load();
  const calls = [];
  const ranges = {};
  const targetSheet = {
    getMaxRows: () => 10,
    insertRowsAfter: (...args) => calls.push(['grow', ...args]),
    getRange(row, column, height, width) {
      const key = [row, column, height || 1, width || 1].join(':');
      return ranges[key] || (ranges[key] = {
        setValues: (value) => calls.push(['values', key, value]),
        setNumberFormat: (value) => calls.push(['format', key, value]),
        setFormula: (value) => calls.push(['formula', key, value])
      });
    }
  };
  const options = { getAppendRow: () => 10, buildDebtFormula: (row) => `DEBT-${row}`, buildFilterFormula: (row) => `FILTER-${row}`,
    flush: () => calls.push(['flush']), rollback: (...args) => calls.push(['rollback', ...args]) };
  const result = repository.appendRows(targetSheet, [['V1', new Date(), '', 'Chi', '', 100, 'An', '', '', 'Có'], ['V2', new Date(), 'Thu', '', '', 200, 'Bình', '', '', '']], options);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { firstRow: 10, lastRow: 11 });
  assert.deepEqual(calls.filter((call) => call[0] === 'grow'), [['grow', 10, 1]]);
  assert.deepEqual(calls.filter((call) => call[0] === 'formula').map((call) => call[2]), ['DEBT-10', 'FILTER-10', 'FILTER-11']);
  assert.equal(calls.at(-1)[0], 'flush');
  ranges['10:1:1:10'] = { setValues() { throw new Error('synthetic write failure'); } };
  assert.throws(() => repository.appendRows(targetSheet, [['V3', new Date(), 'Thu', '', '', 1, 'An', '', '', '']], options), /synthetic write failure/);
  assert.equal(calls.at(-1)[0], 'rollback');
});

test('FundService delegates transaction validation and append ownership while retaining lock, cache bump, and rollback adapter', () => {
  const facade = read('FundService.gs');
  assert.match(facade, /FundTransactionService\.validate\(payloads, fundTransactionWriteContext_\(\)\)/);
  assert.match(facade, /FundTransactionService\.addTransactions\(safePayloads, writeContext, context\)/);
  assert.match(facade, /rollback: rollbackInsertedFundTransactionRows_/);
  assert.match(facade, /if \(result\.idempotentReplay\) return result;\s+bumpFundDataVersion_\(\)/);
  assert.doesNotMatch(facade, /function findFundVoucherRows_/);
});
