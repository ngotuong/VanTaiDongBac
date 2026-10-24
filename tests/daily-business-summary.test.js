const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'DailyBusinessSummaryService.gs'), 'utf8');

test('daily business summary aggregates the previous local day from the latest source rows', () => {
  const upserts = [];
  const statuses = [];
  const headers = [
    'Ngày',
    'Tháng',
    'Biển số',
    'Dự án',
    'Số chuyến',
    'Khối lượng',
    'Số km',
    'Giá dầu',
    'Đơn giá gốc',
    'Điều chỉnh',
    'Ưu đãi nội bộ',
    'Đơn giá',
    'Doanh thu'
  ];
  const rows = [
    [new Date(2026, 7, 14), '08/2026', '20H-001', 'Dự án A', 2, 18.5, 0, 0, 0, 0, 0, 125000, 2500000],
    ['14/08/2026', '08/2026', '20H-002', 'Dự án B', 3.5, 21.75, 0, 0, 0, 0, 0, 160000, 3200000],
    ['15/08/2026', '08/2026', '20H-003', 'Dự án C', 9, 99, 0, 0, 0, 0, 0, 180000, 9999999]
  ];
  const rangeCalls = [];
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport-id' },
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, 'transport-id');
        return { getSheetByName(name) {
          assert.equal(name, 'XL_VanChuyen');
          return {
            getLastRow: () => 25004,
            getLastColumn: () => headers.length,
            getRange(startRow, startColumn, rowCount, columnCount) {
              if (startRow === 1) {
                return { getDisplayValues: () => [headers] };
              }
              rangeCalls.push({ startRow, startColumn, rowCount, columnCount });
              return { getValues: () => rows };
            }
          };
        } };
      },
      flush() {}
    }
  };
  vm.runInNewContext(source, sandbox);
  const context = {
    nowDate: () => new Date(2026, 7, 15, 20),
    nowISOString: () => '2026-08-15T13:00:00.000Z',
    formatDate(date, pattern) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return pattern === 'yyyy-MM-dd' ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
    },
    upsertRows(table, values, conflict) { upserts.push({ table, values, conflict }); },
    writeSyncStatus(...args) { statuses.push(args); }
  };
  const result = sandbox.DailyBusinessSummaryService.sync(context);
  assert.deepEqual(rangeCalls[0], { startRow: 5005, startColumn: 1, rowCount: 20000, columnCount: 13 });
  assert.equal(result.trips, 5.5);
  assert.equal(result.volume, 40.25);
  assert.equal(result.revenue, 5700000);
  assert.equal(result.vehicleCount, 2);
  assert.equal(result.projectCount, 2);
  assert.equal(result.sourceRows, 2);
  assert.equal(result.date, '2026-08-14');
  assert.equal(result.displayDate, '14/08/2026');
  assert.equal(upserts[0].table, 'manage_data_bundles');
  assert.equal(upserts[0].values[0].filter_key, 'daily-summary:latest');
  assert.equal(upserts[0].conflict, 'sheet_name,filter_key');
  assert.equal(statuses[0][0], 'daily_business_summary');
});

test('daily business summary keeps trip evidence but fails closed without the full daily labor resolver', () => {
  function sheet(headerRow, headers, rows) {
    return {
      getLastRow: () => headerRow + rows.length,
      getLastColumn: () => headers.length,
      getRange(row) {
        if (row === headerRow) return { getDisplayValues: () => [headers] };
        return { getValues: () => rows };
      }
    };
  }
  const sheets = {
    XL_VanChuyen: sheet(1, ['Ngày','Tháng','Biển số','Dự án','Số chuyến','Khối lượng','Doanh thu'], [
      ['14/08/2026','08/2026','20H-001','A',3,75,9000000]
    ]),
    NL_Dau: sheet(2, ['Ngày','Tháng','Biển số','Nguồn dầu','Số lít','Giá dầu','Thành tiền'], [
      ['14/08/2026','08/2026','20H-001','Kho',100,20000,2000000],
      ['13/08/2026','08/2026','20H-001','Kho',50,20000,1000000]
    ]),
    NL_TaiXe: sheet(1, ['Ngày','Tháng','Biển số','Nhóm vận hành','Tài xế','Số chuyến','Ghi chú'], [
      ['14/08/2026','08/2026','20H-001','A','An',2,''],
      ['14/08/2026','08/2026','20H-001','A','Bình',1,'']
    ]),
    XL_LuongTheoXe: sheet(1, ['Tháng','Tài xế','Biển số xe','Cá nhân','Tổng của xe','Số lái','Loại tính','Đơn giá','Lương chuyến','Nghỉ tính chỉ tiêu','Chỉ tiêu sau nghỉ','Lương chuyến cuối'], [
      ['08/2026','An','20H-001',10,30,2,'NHIEU_LAI',300000,3000000,0,50,3000000],
      ['08/2026','Bình','20H-001',8,30,2,'NHIEU_LAI',250000,2000000,0,50,2000000]
    ])
  };
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport-id' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name] || null }), flush() {} }
  };
  vm.runInNewContext(source, sandbox);
  const result = sandbox.DailyBusinessSummaryService.sync({
    nowDate: () => new Date(2026, 7, 15, 12),
    nowISOString: () => '2026-08-15T05:00:00.000Z',
    formatDate(date, pattern) {
      const yyyy = date.getFullYear(); const mm = String(date.getMonth() + 1).padStart(2, '0'); const dd = String(date.getDate()).padStart(2, '0');
      return pattern === 'yyyy-MM-dd' ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
    },
    upsertRows() {}, writeSyncStatus() {}
  });
  assert.equal(result.fuelAvailable, true);
  assert.equal(result.fuelExpense, 2000000);
  assert.equal(result.salaryAvailable, false);
  assert.equal(result.salaryExpense, 0);
  assert.equal(result.tripSalaryExpense, 850000);
  assert.equal(result.salaryUnmatchedRows, 0);
  assert.equal(result.salaryUnavailableReasons.DAILY_DRIVER_LABOR_RESOLVER_MISSING, 1);
});

test('daily summary refuses to infer a mixed salary rate from the monthly average', () => {
  function sheet(headerRow, headers, rows) {
    return { getLastRow: () => headerRow + rows.length, getLastColumn: () => headers.length,
      getRange: (row) => row === headerRow ? { getDisplayValues: () => [headers] } : { getValues: () => rows } };
  }
  const sheets = {
    XL_VanChuyen: sheet(1, ['Ngày','Biển số','Dự án','Số chuyến','Khối lượng','Doanh thu'], [['14/08/2026','20H-001','A',1,20,1000000]]),
    NL_Dau: sheet(2, ['Ngày','Thành tiền'], []),
    NL_TaiXe: sheet(1, ['Ngày','Tháng','Biển số','Tài xế','Số chuyến'], [['14/08/2026','08/2026','20H-001','An',1]]),
    XL_LuongTheoXe: sheet(1, ['Tháng','Tài xế','Biển số xe','Cá nhân','Loại tính','Đơn giá','Lương chuyến cuối'], [['08/2026','An','20H-001',10,'HỖN HỢP','',3000000]])
  };
  const sandbox = { APP_CONFIG: { spreadsheetId: 'transport-id' }, SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name] || null }), flush() {} } };
  vm.runInNewContext(source, sandbox);
  const result = sandbox.DailyBusinessSummaryService.sync({
    nowDate: () => new Date(2026, 7, 15, 12), nowISOString: () => '2026-08-15T05:00:00.000Z',
    formatDate(date, pattern) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return pattern === 'yyyy-MM-dd' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`; },
    upsertRows() {}, writeSyncStatus() {}
  });
  assert.equal(result.salaryAvailable, false);
  assert.equal(result.salaryExpense, 0);
  assert.equal(result.salaryUnmatchedRows, 1);
});

test('daily summary uses authoritative daily payroll evidence when available', () => {
  function sheet(headerRow, headers, rows) {
    return { getLastRow: () => headerRow + rows.length, getLastColumn: () => headers.length,
      getRange: (row) => row === headerRow ? { getDisplayValues: () => [headers] } : { getValues: () => rows } };
  }
  const sheets = {
    XL_VanChuyen: sheet(1, ['Ngày','Biển số','Dự án','Số chuyến','Khối lượng','Doanh thu'], [['25/09/2026','20H-001','A',63,100,209199428.07]]),
    NL_Dau: sheet(2, ['Ngày','Thành tiền'], [['25/09/2026',9899999.9438]])
  };
  const sandbox = {
    APP_CONFIG: { spreadsheetId: 'transport-id' },
    PayrollExplanationService: {
      resolveDailyDriverLabor(spreadsheet, dateKey, options) {
        assert.ok(spreadsheet);
        assert.equal(dateKey, '2026-09-25');
        assert.equal(options.transportTrips, 63);
        return { available: true, value: 20750000, tripSalary: 18250000, fixedSalary: 2000000, recruitmentBonus: 500000, matchedRows: 24, unmatchedRows: 0, reasonCounts: {} };
      }
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name] || null }), flush() {} }
  };
  vm.runInNewContext(source, sandbox);
  const result = sandbox.DailyBusinessSummaryService.sync({
    nowDate: () => new Date(2026, 8, 26, 12), nowISOString: () => '2026-09-26T05:00:00.000Z',
    formatDate(date, pattern) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return pattern === 'yyyy-MM-dd' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`; },
    upsertRows() {}, writeSyncStatus() {}
  });
  assert.equal(result.salaryAvailable, true);
  assert.equal(result.salaryExpense, 20750000);
  assert.equal(result.tripSalaryExpense, 18250000);
  assert.equal(result.fixedSalaryExpense, 2000000);
  assert.equal(result.recruitmentBonusExpense, 500000);
  assert.equal(result.salaryMatchedRows, 24);
  assert.equal(result.salaryUnmatchedRows, 0);
  assert.deepEqual(result.salaryUnavailableReasons, {});
});
