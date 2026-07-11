const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadService(rows) {
  const context = vm.createContext({
    Utilities: {
      formatDate(date, timezone, pattern) {
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return pattern === 'yyyy-MM-dd' ? iso : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
      }
    },
    ValidationService: { parseNumber: (value) => Number(value) || 0 }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#latest-test' }).runInContext(context);
  new vm.Script(read('DashboardService.gs'), { filename: 'DashboardService.gs#latest-test' }).runInContext(context);
  const sheet = {
    getRange(row, column, rowCount, columnCount) {
      const values = Array.from({ length: rowCount }, (_, r) =>
        Array.from({ length: columnCount }, (_, c) => rows[row - 3 + r]?.[column - 1 + c] ?? ''));
      return { getValues: () => values };
    }
  };
  return {
    service: context.DashboardService,
    ss: { getSheetByName: (name) => name === 'NL_VanChuyen' ? sheet : null },
    config: { timezone: 'Asia/Saigon', getLastNonEmptyRow: () => rows.length + 2 }
  };
}

test('latest trips chooses newest date, aggregates project/vehicle, deduplicates tickets, and preserves sort', () => {
  const older = new Date(2026, 6, 10);
  const latest = new Date(2026, 6, 11);
  const { service, ss, config } = loadService([
    [older, '', '30A-OLD', 'Mỏ B', 9, 'OLD'],
    [latest, '', '30A-002', 'Mỏ B', 2, 'P2'],
    [latest, '', '30A-001', 'Mỏ A', 1, 'P1'],
    [latest, '', '30A-001', 'Mỏ A', 3, 'P1'],
    [latest, '', '30A-001', 'Mỏ A', 2, 'P3']
  ]);
  assert.deepEqual(plain(service.readLatestTrips(ss, config)), {
    date: '11/07/2026',
    trips: [
      { project: 'Mỏ A', vehicle: '30A-001', count: 6, ticket: 'P1, P3' },
      { project: 'Mỏ B', vehicle: '30A-002', count: 2, ticket: 'P2' }
    ]
  });
});

test('latest trips and dashboard builder preserve empty and partial response shapes', () => {
  const { service, config } = loadService([]);
  assert.deepEqual(plain(service.readLatestTrips({ getSheetByName: () => null }, config)), { date: '', trips: [] });
  assert.deepEqual(plain(service.buildDashboard({ updatedAt: 'now', overview: { months: [] }, links: {}, partial: true })), {
    updatedAt: 'now', overview: { months: [] }, inputs: [], latestTrips: { date: '', trips: [] }, links: {}, cached: false, partial: true
  });
});

test('SheetService delegates latest trips and dashboard payload assembly', () => {
  const source = read('SheetService.gs');
  assert.match(source, /DashboardService\.readLatestTrips/);
  assert.match(source, /DashboardService\.buildDashboard/);
  assert.doesNotMatch(source, /var tripsMap = \{\}/);
  assert.doesNotMatch(source, /var maxTime = 0/);
});
