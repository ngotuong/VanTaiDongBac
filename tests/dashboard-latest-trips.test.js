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

test('latest trips include rows before the last 500 physical rows', () => {
  const newest = new Date(2026, 10, 27);
  const older = new Date(2026, 10, 26);
  const { service, ss, config } = loadService([
    [newest, '', 'XE-01', 'Dự án A', 2, 'P1'],
    ...Array.from({ length: 500 }, () => [older, '', 'XE-02', 'Dự án A', 1, 'P2']),
    [newest, '', 'XE-01', 'Dự án A', 3, 'P3']
  ]);
  const result = plain(service.readLatestTrips(ss, config));
  assert.equal(result.date, '27/11/2026');
  assert.deepEqual(result.trips, [{ project: 'Dự án A', vehicle: 'XE-01', count: 5, ticket: 'P1, P3' }]);
});

test('report detail totals follow the category when a month inserts an optional row', async () => {
  const matrices = [
    [['Danh mục', 'Tổng'], ['Dầu', 100], ['Phí', 200]],
    [['Danh mục', 'Tổng'], ['Dầu', 300], ['Thu hồi', 50], ['Phí', 400]]
  ];
  const { aggregateDetailMatrices } = await import('../next-shell/lib/platform/report-c2.ts');
  const { service } = loadService([]);
  for (const result of [aggregateDetailMatrices(matrices), service.aggregateDetailMatrices(matrices)]) {
    assert.deepEqual(Object.fromEntries(Array.from(result).slice(1).map(([name, amount]) => [name, Number(amount)])), { Dầu: 400, Phí: 600, 'Thu hồi': 50 });
  }
});

test('report detail aggregation fails closed for schema drift or duplicate categories', async () => {
  const { aggregateDetailMatrices } = await import('../next-shell/lib/platform/report-c2.ts');
  const { service } = loadService([]);
  const implementations = [aggregateDetailMatrices, service.aggregateDetailMatrices];
  for (const aggregate of implementations) {
    assert.throws(() => aggregate([
      [['Danh mục', 'Tổng'], ['Dầu', 100]],
      [['Danh mục', 'Công ty A'], ['Dầu', 200]]
    ]), /Schema chi tiết báo cáo không đồng nhất/);
    assert.throws(() => aggregate([
      [['Danh mục', 'Tổng'], ['Chi phí dầu', 100], ['chi phi dau', 200]]
    ]), /bị trùng trong cùng kỳ/);
  }
});
