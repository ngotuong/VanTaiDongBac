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
