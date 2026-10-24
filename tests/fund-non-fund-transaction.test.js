const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function transactionSheet() {
  const headers = ['Số phiếu', 'Ngày', 'MỤC THU', 'MỤC CHI', 'Hình thức', 'Số tiền', 'Người Thu/ Chi', 'Đối tác', 'Nội dung', 'Công nợ', '2', 'Không qua Quỹ', 'Công nợ còn lại', 'Lọc'];
  const rows = [
    ['A1', '03/08/2026', 'Doanh thu', '', '', '2.135.365.925', 'An', '', '', '', '', 'TRUE', '', ''],
    ['A2', '03/08/2026', '', 'Chi phí', '', '1.027.940.372', 'An', '', '', '', '', 'TRUE', '', ''],
    ['A3', '04/08/2026', 'Thu thật', '', '', '1.000', 'An', '', '', '', '', 'FALSE', '', ''],
    ['A4', '05/08/2026', '', 'Chi thật', '', '200', 'An', '', '', '', '', 'FALSE', '', ''],
    ['S1', '02/09/2026', 'Thu tháng 9', '', '', '500', 'An', '', '', '', '', 'FALSE', '', ''],
    ['S2', '03/09/2026', '', 'Chi tháng 9', '', '300', 'An', '', '', '', '', 'FALSE', '', ''],
  ];
  const dates = [new Date(2026, 7, 3), new Date(2026, 7, 3), new Date(2026, 7, 4), new Date(2026, 7, 5), new Date(2026, 8, 2), new Date(2026, 8, 3)];
  return {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange(row, column, height, width) {
      return {
        getDisplayValues() {
          if (row === 1) return [headers];
          if (row === 2 && column === 1) return rows;
          return [];
        },
        getValues() {
          if (row === 2 && column === 2 && width === 1) return dates.map((date) => [date]);
          return [];
        },
      };
    },
  };
}

function loadService() {
  const transaction = transactionSheet();
  const loan = { getLastRow: () => 1, getLastColumn: () => 14 };
  const spreadsheet = {
    getSheetByName: (name) => name === 'NHAP_THUCHI' ? transaction : name === 'NHAP_VAY' ? loan : null,
    getRangeByName(name) {
      const displays = { TMDK: '0', TKDK: '0', NGAYNHAPLIEU: '28/04/2026', NGAYTINHVAY: '28/04/2026', NOPTIEN: 'Nộp vào TK', RUTTIEN: 'Rút tiền' };
      const dates = { NGAYNHAPLIEU: new Date(2026, 3, 28), NGAYTINHVAY: new Date(2026, 3, 28) };
      if (!(name in displays)) return null;
      return { getDisplayValue: () => displays[name], getValue: () => dates[name] || displays[name] };
    },
  };
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026', timezone: 'Asia/Ho_Chi_Minh' },
    Utilities: { formatDate: (date, timezone, pattern) => {
      const yyyy = date.getFullYear(); const mm = String(date.getMonth() + 1).padStart(2, '0'); const dd = String(date.getDate()).padStart(2, '0');
      return pattern === 'yyyy-MM' ? `${yyyy}-${mm}` : pattern === 'MM/yyyy' ? `${mm}/${yyyy}` : `${yyyy}-${mm}-${dd}`;
    } },
    SpreadsheetApp: { openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'fund-2026' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, getAll: () => ({}), putAll() {} }) },
    FundCatalogRepository: {}, FundCatalogService: {}, FundTransactionRepository: {}, FundTransactionService: {}, FundLoanRepository: {}, FundLoanService: {},
    console: { warn() {} },
  });
  new vm.Script(read('NormalizationUtils.gs')).runInContext(sandbox);
  new vm.Script(read('FundService.gs')).runInContext(sandbox);
  return sandbox.FundService;
}

test('Fund overview excludes both Thu and Chi marked Không qua Quỹ from opening and current balances', () => {
  const result = loadService().getFundOverview('2026', { month: '2026-09' });
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.map((item) => [item.key, item.value]))), [
    ['openingBalance', 800],
    ['periodIncome', 500],
    ['periodExpense', 300],
    ['periodNet', 200],
    ['closingBalance', 1000],
    ['currentBalance', 1000],
  ]);
});
