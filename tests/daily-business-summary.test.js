const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'DailyBusinessSummaryService.gs'), 'utf8');

test('daily business summary aggregates the previous local day from the latest source rows', () => {
  const upserts = [];
  const statuses = [];
  const rows = [
    [new Date(2026, 7, 14), '08/2026', '20H-001', 'Dự án A', 2, 18.5, 0, 0, 0, 0, 0, 2500000, 'Công ty A'],
    ['14/08/2026', '08/2026', '20H-002', 'Dự án B', '3,5', '21,75', 0, 0, 0, 0, 0, '3.200.000', 'Công ty A'],
    ['15/08/2026', '08/2026', '20H-003', 'Dự án C', 9, 99, 0, 0, 0, 0, 0, 9999999, 'Công ty A']
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
            getRange(startRow, startColumn, rowCount, columnCount) {
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
