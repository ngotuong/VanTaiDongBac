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

test('Dashboard recent trips counts one physical vehicle once across projects and plate formatting', async () => {
  const { countUniqueVehicles } = await import(helperUrl);
  assert.equal(countUniqueVehicles([
    { project: 'Dự án A', vehicle: '20H-05664' },
    { project: 'Dự án B', vehicle: '20h 05664' },
    { project: 'Dự án A', vehicle: '20H-06214' }
  ]), 2);
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
