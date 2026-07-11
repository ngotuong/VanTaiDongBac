const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

class FakeSheet {
  constructor(rows) { this.rows = rows; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    const values = Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: columnCount }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? ''));
    return { getValues: () => values };
  }
}

function loadReader(rowsBySheet) {
  const sheets = Object.fromEntries(Object.entries(rowsBySheet).map(([name, rows]) => [name, new FakeSheet(rows)]));
  const cache = new Map();
  const context = vm.createContext({
    SheetService: {},
    Utilities: {
      formatDate: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
  });
  new vm.Script(read('SheetReadService.gs'), { filename: 'SheetReadService.gs#test' }).runInContext(context);
  const service = context.SheetReadService;
  const ss = { getSheetByName: (name) => sheets[name] || null };
  const config = {
    sheets: { vanChuyen: { name: 'NL_VanChuyen', headerRow: 2 } },
    timezone: 'Asia/Saigon',
    buildCacheKey: (...parts) => parts.join(':'),
    getDataVersion: () => 'data-v1',
    getCached: (key) => cache.get(key) || null,
    putCached: (key, value) => cache.set(key, value),
    getLastNonEmptyRow: (sheet, column, minRow) => {
      for (let row = sheet.getLastRow(); row >= minRow; row -= 1) {
        const value = sheet.getRange(row, column).getValues()[0][0];
        if (value !== '' && value !== null && value !== undefined) return row;
      }
      return minRow - 1;
    }
  };
  return { cache, config, service, ss };
}

const journalRows = [
  ['Tổng'],
  ['Ngày', 'Tháng', 'Xe'],
  ['2026-07-01', '07/2026', '30A-001'],
  ['02/07/2026', '07/2026', '30A-002'],
  ['', '', ''],
  ['2026-07-04', '07/2026', '30A-004']
];

test('recent manage read preserves header row, descending order, rowIndex, limit, and isLimited', () => {
  const { config, service, ss } = loadReader({ NL_VanChuyen: journalRows });
  const result = plain(service.readSheetDataFromSpreadsheet(ss, 'NL_VanChuyen', '', '', 2, config));
  assert.equal(result.ok, true);
  assert.deepEqual(result.headers, ['Ngày', 'Tháng', 'Xe']);
  assert.deepEqual(result.rows.map((row) => row.rowIndex), [6]);
  assert.deepEqual(result.rows[0].values, ['2026-07-04', '07/2026', '30A-004']);
  assert.equal(result.isLimited, true);
});

test('date-filtered manage read accepts ISO and Vietnamese dates and keeps newest-first order', () => {
  const { config, service, ss } = loadReader({ NL_VanChuyen: journalRows });
  const result = plain(service.readSheetDataFromSpreadsheet(ss, 'NL_VanChuyen', '2026-07-01', '2026-07-02', 10, config));
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows.map((row) => row.rowIndex), [4, 3]);
  assert.equal(result.isLimited, false);
});

test('generic DM read preserves special headers, ascending sheet order, cache reuse, and errors', () => {
  const { cache, config, service, ss } = loadReader({
    DM_ThamSo: [
      ['Mã', 'Tên', 'Giá trị', 'Ngày', '', 'Ngày dầu'],
      ['A', 'Alpha', 1, '2026-01-01', '', '2026-01-02'],
      ['B', 'Beta', 2, '2026-02-01', '', '2026-02-02']
    ]
  });
  const first = plain(service.readSheetDataFromSpreadsheet(ss, 'DM_ThamSo', '', '', 10, config));
  assert.equal(first.headers[3], 'Ngày áp dụng tham số');
  assert.equal(first.headers[5], 'Ngày áp dụng giá dầu');
  assert.deepEqual(first.rows.map((row) => row.rowIndex), [2, 3]);
  assert.equal(cache.size, 1);
  assert.deepEqual(plain(service.readSheetDataFromSpreadsheet(ss, 'DM_ThamSo', '', '', 10, config)), first);
  assert.match(service.readSheetDataFromSpreadsheet(ss, 'MISSING', '', '', 10, config).error, /Không tìm thấy sheet/);
});

test('SheetReadService owns read implementation while SheetService retains only the compatibility adapter', () => {
  const readService = read('SheetReadService.gs');
  const sheetService = read('SheetService.gs');
  assert.match(readService, /function readSheetDataFromSpreadsheet/);
  assert.match(sheetService, /SheetReadService\.readSheetDataFromSpreadsheet/);
  assert.doesNotMatch(sheetService, /var scanChunkSize = 1000/);
  assert.doesNotMatch(sheetService, /function readFilteredJournalRows_/);
});
