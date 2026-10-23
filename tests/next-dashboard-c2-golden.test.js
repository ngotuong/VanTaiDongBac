const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const helperUrl = pathToFileURL(path.resolve(__dirname, '../next-shell/lib/platform/dashboard-c2.ts')).href;

test('C3 Dashboard KPI cards prefer the hydrated C2 kpis over derived matrix values', async () => {
  const { buildKpiMap, metricValue, parseDashboardRows, formatCurrencyText } = await import(helperUrl);
  const matrix = [
    [],
    ['Tháng', 'Tổng khối lượng', 'Tổng doanh thu', 'Thuế TNDN', 'Thuế VAT', 'Dầu Quang Minh', 'Dầu đổ ngoài', 'Phí đường bộ', 'Lợi nhuận gộp', 'Chi quỹ thực tế', 'Lợi nhuận thực'],
    ['07/2026', 100, 270_513_180, 1, 2, 3, 4, 5, 100_000_000, 6, -100_000_000]
  ];
  const rows = parseDashboardRows(matrix);
  const map = buildKpiMap([{ monthKey: '2026-07', revenue: 270_513_180, operatingCost: 94_863_960, gross: 175_649_220, cashCost: 341_770_935, final: -166_121_715 }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(['revenue', 'operatingCost', 'gross', 'cashCost', 'final'].map((key) => metricValue(rows[0], key, map)), [270_513_180, 94_863_960, 175_649_220, 341_770_935, -166_121_715]);
  assert.equal(formatCurrencyText(metricValue(rows[0], 'revenue', map)), '270.513.180');
  assert.equal(formatCurrencyText(metricValue(rows[0], 'final', map)), '-166.121.715');
});

test('Dashboard month range aggregates every financial field and respects hydrated KPI overrides', async () => {
  const { aggregateDashboardPeriod, buildKpiMap, parseDashboardRows } = await import(helperUrl);
  const rows = parseDashboardRows([
    ['Tháng', 'Tổng khối lượng', 'Tổng doanh thu', 'Thuế TNDN', 'Thuế VAT', 'Dầu Quang Minh', 'Dầu ngoài', 'Phí đi đường', 'Lợi nhuận gộp', 'Chi phí lương', 'BHXH', 'Chi quỹ', 'Lợi nhuận thực'],
    ['07/2026', 10, 1000, 10, 20, 30, 40, 50, 890, 60, 5, 70, 715],
    ['08/2026', 20, 2000, 20, 40, 60, 80, 100, 1780, 120, 10, 140, 1430]
  ]);
  const kpis = buildKpiMap([{ monthKey: '2026-08', revenue: 2100, operatingCost: 220, gross: 1880, cashCost: 300, final: 1580 }]);
  const aggregate = aggregateDashboardPeriod(rows, kpis, '07/2026–08/2026');
  assert.equal(aggregate.month, '07/2026–08/2026');
  assert.equal(aggregate.volume, 30);
  assert.equal(aggregate.revenue, 3100);
  assert.equal(aggregate.operatingCost, 330);
  assert.equal(aggregate.gross, 2770);
  assert.equal(aggregate.cashCost, 475);
  assert.equal(aggregate.final, 2295);
  assert.equal(aggregate.taxTndn, 30);
  assert.equal(aggregate.payroll, 180);
  assert.equal(aggregate.bhxh, 15);
  assert.equal(aggregate.fund, 210);
});

test('Dashboard financial structure reads BHXH and the chart lists it without renaming Phường & Luật', async () => {
  const { parseDashboardRows } = await import(helperUrl);
  const [row] = parseDashboardRows([
    ['Tháng', 'Doanh thu', 'Lợi nhuận gộp', 'Dầu ngoài', 'Chi phí lương', 'BHXH', 'Chi quỹ', 'Lợi nhuận thực'],
    ['07/2026', 1_000, 900, 20, 30, 40, 50, 760]
  ]);
  assert.equal(row.bhxh, 40);

  const source = require('node:fs').readFileSync(path.resolve(__dirname, '../next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  assert.match(source, /label: 'BHXH'/);
  assert.match(source, /label: 'Phường & Luật'/);
});

test('Dashboard profit chart starts at the transport operating month', async () => {
  const { profitChartMonthLabels } = await import(helperUrl);
  assert.deepEqual(profitChartMonthLabels('2026'), ['05/2026', '06/2026', '07/2026', '08/2026', '09/2026', '10/2026', '11/2026', '12/2026']);
  assert.deepEqual(profitChartMonthLabels('2027'), ['01/2027', '02/2027', '03/2027', '04/2027', '05/2027', '06/2027', '07/2027', '08/2027', '09/2027', '10/2027', '11/2027', '12/2027']);
  assert.deepEqual(profitChartMonthLabels('2025'), []);

  const source = require('node:fs').readFileSync(path.resolve(__dirname, '../next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  assert.match(source, /latestMonth\.split\('\/'\)\[1\] \|\| workbook\.year/);
});

test('Dashboard profit chart uses a signed scale with losses below the zero axis', async () => {
  const { buildProfitChartScale } = await import(helperUrl);
  const scale = buildProfitChartScale([-75_705_795, 236_702_362, -254_760_614, 409_025_032, 1_369_890_219, 503_958_412]);
  assert.equal(scale.positiveMax, 1_500_000_000);
  assert.equal(scale.negativeMin, -500_000_000);
  assert.equal(scale.zeroPositionPercent, 75);
  assert.deepEqual(scale.ticks.map((tick) => tick.value), [1_500_000_000, 1_000_000_000, 500_000_000, 0, -500_000_000]);
  assert.ok(scale.positionPercent(-254_760_614) > scale.zeroPositionPercent);
  assert.ok(scale.positionPercent(409_025_032) < scale.zeroPositionPercent);

  const lossOnly = buildProfitChartScale([-100_000_000]);
  assert.equal(lossOnly.zeroPositionPercent, 0);
  assert.equal(lossOnly.positionPercent(-100_000_000), 20);

  const source = require('node:fs').readFileSync(path.resolve(__dirname, '../next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  assert.match(source, /className={`bar-fill-v \$\{value < 0 \? 'is-negative' : 'is-positive'\}`}/);
  assert.match(source, /value > 0 \? scale\.zeroPositionPercent - barHeight : scale\.zeroPositionPercent/);
});

test('Dashboard recent trips counts one physical vehicle once across projects and plate formatting', async () => {
  const { countUniqueVehicles } = await import(helperUrl);
  assert.equal(countUniqueVehicles([
    { project: 'Dự án A', vehicle: '20H-05664' },
    { project: 'Dự án B', vehicle: '20h 05664' },
    { project: 'Dự án A', vehicle: '20H-06214' }
  ]), 2);
});

test('Dashboard reads live Phí Phường and groups it with road fees in the chart', async () => {
  const { parseDashboardRows } = await import(helperUrl);
  const matrix = [
    ['Tháng', 'Tổng Khối Lượng', 'Tổng Doanh Thu', 'Thuế TNDN', 'Thuế VAT', 'Dầu Quang Minh', 'Phí Đi Đường', 'Phí Phường', 'Lợi Nhuận Gộp', 'Dầu ngoài', 'Chi phí lương', 'Chi Quỹ', 'Lợi Nhuận Thực'],
    ['08/2026', 100, 1_000, 10, 20, 30, 40, 50, 850, 60, 70, 80, 640]
  ];
  const [row] = parseDashboardRows(matrix);
  assert.equal(row.roadFee, 40);
  assert.equal(row.wardFee, 50);

  const source = require('node:fs').readFileSync(path.resolve(__dirname, '../next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  assert.match(source, /const wardAndRoadFee = roadFee \+ wardFee/);
  assert.match(source, /label: 'Phường & Luật'/);
});

test('Dashboard places financial structure immediately above recent trips and uses approved labels and colors', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '../next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  const profit = source.lastIndexOf('Biểu Đồ Lợi Nhuận Thực');
  const structure = source.lastIndexOf('Biểu Đồ Cơ Cấu Chi Phí & Lợi Nhuận');
  const trips = source.lastIndexOf('Dữ Liệu Chuyến Gần Đây');
  assert.ok(profit < structure && structure < trips);
  assert.match(source, /label: 'Thuế DN & VAT'/);
  assert.match(source, /netProfit < 0 \? '#dc2626' : '#0284c7'/);
});

test('C3 Dashboard source contains the approved C2 header, month and full-value contract', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '..');
  const shell = fs.readFileSync(path.join(root, 'next-shell/components/platform/AppShell.tsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  assert.match(shell, /'Kết quả kinh doanh'/);
  assert.match(shell, /Cập nhật:/);
  assert.match(dashboard, /dashboard-month-title/);
  assert.match(dashboard, /overview\?\.kpis/);
  assert.match(dashboard, /formatCurrencyText\(value\)/);
  assert.doesNotMatch(dashboard, /Tháng gần nhất|shortMoney|triệu/);
});

test('C3 Dashboard loads the C2 font and locks export/table cascade against shared Next CSS', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '..');
  const layout = fs.readFileSync(path.join(root, 'next-shell/app/layout.jsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'next-shell/app/c2-golden.css'), 'utf8');
  assert.match(layout, /family=Plus\+Jakarta\+Sans:wght@300;400;500;600;700;800&display=swap/);
  assert.match(css, /\.table-card > \.table-wrap \{ margin-top: 0; \}/);
  assert.match(css, /\.dashboard-export-button[\s\S]*width: 32px !important;[\s\S]*min-height: 32px !important;/);
  assert.match(css, /\.dashboard-export-button svg[\s\S]*stroke: currentColor !important;/);
  assert.match(dashboard, /className="dashboard-export-button"/);
  assert.match(dashboard, /className="dashboard-export-actions"/);
});

test('Dashboard PNG export uses an isolated non-sticky capture tree on desktop', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'next-shell/lib/platform/export-card.ts'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'next-shell/app/platform.css'), 'utf8');
  assert.match(source, /cloneNode\(true\)/);
  assert.match(source, /data-export-capture-root/);
  assert.match(source, /left: '-100000px'/);
  assert.match(source, /wrap\.scrollLeft = 0/);
  assert.match(source, /setProperty\('position', 'static', 'important'\)/);
  assert.match(source, /setProperty\('transform', 'none', 'important'\)/);
  assert.match(source, /\.sticky-col-right, \.sticky-total-foot/);
  assert.match(css, /\.table-card\.is-exporting \.table-wrap,[\s\S]*box-shadow: none !important;/);
});

test('Dashboard image icon inherits the white card-heading color', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(path.resolve(__dirname, '../next-shell/app/platform.css'), 'utf8');
  assert.match(css, /\.table-card-head \.dashboard-export-button \{[\s\S]*?color: inherit !important;[\s\S]*?\}/);
  assert.match(css, /\.dashboard-export-button svg,[\s\S]*?stroke: currentColor !important;/);
});

test('Dashboard KPI cards use semantic text, accent and soft tint colors', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '..');
  const dashboard = fs.readFileSync(path.join(root, 'next-shell/components/dashboard/DashboardModule.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'next-shell/app/c2-golden.css'), 'utf8');
  for (const tone of ['revenue', 'operating-cost', 'gross', 'cash-cost', 'profit-positive', 'profit-negative']) {
    assert.match(dashboard + css, new RegExp(`dashboard-tone-${tone}`));
  }
  assert.match(css, /--dashboard-kpi-accent/);
  assert.match(css, /--dashboard-kpi-tint/);
  assert.match(css, /border-left: 4px solid var\(--dashboard-kpi-accent\)/);
  assert.match(css, /color: var\(--dashboard-kpi-accent\) !important/);
});
