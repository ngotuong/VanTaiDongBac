const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const d1 = new Date(2026, 6, 11);
const d2 = new Date(2026, 6, 12);

class FakeSheet {
  constructor(headerRow, rows) { this.rows = Array.from({ length: headerRow }, () => []).concat(rows); }
  getLastRow() { return this.rows.length; }
  getRange(row, column, rowCount, columnCount) {
    const values = Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: columnCount }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? ''));
    return { getValues: () => values };
  }
}

function loadService(vanChuyenRows, taiXeRows) {
  const sheets = {
    NL_VanChuyen: new FakeSheet(2, vanChuyenRows),
    NL_TaiXe: new FakeSheet(1, taiXeRows)
  };
  const formatDate = (date, timezone, pattern) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return pattern === 'yyyy-MM-dd' ? iso : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  };
  const context = vm.createContext({
    APP_CONFIG: { spreadsheetId: 'synthetic-sheet', timezone: 'Asia/Saigon' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name] || null }) },
    Utilities: { formatDate },
    ValidationService: {
      parseDate(value) {
        if (Object.prototype.toString.call(value) === '[object Date]') return value;
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
      },
      parseNumber: (value) => Number(value) || 0
    },
    SheetWritePreserver: {
      getLastNonEmptyRowInColumn(sheet, column, minRow) {
        for (let row = sheet.getLastRow(); row >= minRow; row -= 1) {
          if (sheet.getRange(row, column, 1, 1).getValues()[0][0] !== '') return row;
        }
        return minRow - 1;
      }
    }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#reconciliation-test' }).runInContext(context);
  new vm.Script(read('TransportReconciliationService.gs'), { filename: 'TransportReconciliationService.gs#test' }).runInContext(context);
  return context.TransportReconciliationService;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('reconciliation preserves missing/excess warning format and omits exact matches', () => {
  const service = loadService(
    [[d1, '', '30A-001', '', 5], [d2, '', '30A-002', '', 2]],
    [[d1, '', '30A-001', '', 3], [d2, '', '30A-002', '', 4]]
  );
  assert.deepEqual(plain(service.checkTripReconciliation([
    { date: '2026-07-11', vehicle: '30A-001' },
    { date: '2026-07-12', vehicle: '30A-002' }
  ])), [
    '11/07/2026 - 30A-001: báo cáo 5, tài xế 3, lệch 2.',
    '12/07/2026 - 30A-002: báo cáo 2, tài xế 4, lệch -2.'
  ]);
  const matched = loadService([[d1, '', '30A-001', '', 3]], [[d1, '', '30A-001', '', 3]]);
  assert.deepEqual(plain(matched.checkTripReconciliation([{ date: '2026-07-11', vehicle: '30A-001' }])), []);
});

test('reconciliation aggregates sheet rows, deduplicates pairs, and ignores invalid input', () => {
  const service = loadService(
    [[d1, '', '30A-001', '', 2], [d1, '', '30A-001', '', 3]],
    [[d1, '', '30A-001', '', 4]]
  );
  assert.deepEqual(plain(service.checkTripReconciliation([
    { date: '2026-07-11', vehicle: ' 30A-001 ' },
    { date: '2026-07-11', vehicle: '30A-001' },
    { date: 'invalid', vehicle: '30A-002' }
  ])), ['11/07/2026 - 30A-001: báo cáo 5, tài xế 4, lệch 1.']);
  assert.deepEqual(plain(service.checkTripReconciliation([])), []);
});

test('facades delegate reconciliation and SheetService no longer owns aggregation helpers', () => {
  const entry = read('EntryService.gs');
  const sheet = read('SheetService.gs');
  assert.match(entry, /TransportReconciliationService\.checkTripReconciliation/);
  assert.match(sheet, /TransportReconciliationService\.checkTripReconciliation/);
  assert.doesNotMatch(sheet, /function sumTripsByPairs_/);
  assert.doesNotMatch(sheet, /function pairKey_/);
});
