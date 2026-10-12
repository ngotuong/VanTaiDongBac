const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('B2 dashboard route performs the initial server read without a DOM bridge', () => {
  const page = read('next-shell/app/dashboard/page.jsx');
  assert.match(page, /loadDashboardData\(\)/);
  assert.match(page, /<DashboardModule initialDashboard=/);
  assert.doesNotMatch(page, /components\/Dashboard\.jsx|bridge=|next-accounts-shell/);
});

test('B2 dashboard loader scopes Supabase cache by workbook and falls back to Apps Script', () => {
  const loader = read('next-shell/lib/dashboard-server.ts');
  assert.match(loader, /DASHBOARD_CACHE_KEY = '__dashboard_latest__'/);
  assert.match(loader, /findLatest\(config, DASHBOARD_CACHE_KEY, workbook\.spreadsheetId\)/);
  assert.match(loader, /AbortSignal\.timeout\(5000\)/);
  assert.match(loader, /api\.get<[^>]+>\('getDashboard'/);
  assert.match(loader, /forceRefresh: forceRefresh \? 'true' : ''/);
  assert.match(loader, /delete dashboard\.links/);
});

test('B2 dashboard UI owns filters KPIs chart and tables without report payload merging', () => {
  const module = read('next-shell/components/dashboard/DashboardModule.tsx');
  for (const label of ['Tổng doanh thu', 'Chi phí vận hành', 'Lợi nhuận gộp', 'Chi phí sau vận hành', 'Lợi nhuận thực tế', 'Dữ liệu chuyến gần đây', 'Kết quả kinh doanh theo tháng']) {
    assert.match(module, new RegExp(label, 'i'));
  }
  assert.match(module, /aria-live="polite"/);
  assert.match(module, /role="alert"/);
  assert.match(module, /aria-busy="true"/);
  assert.match(module, /new URL\('\/dashboard-data\/', window\.location\.origin\)/);
  assert.doesNotMatch(module, /\/next-accounts\//);
  assert.doesNotMatch(module, /appData\.reports|reports\s*=|window\.appData|google\.script/);
  assert.match(module, /aria-label=\{`Chọn kỳ Tổng quan, hiện tại \$\{selectedPeriod\}`\}/);
  assert.match(module, /<DashboardPeriodDrawer/);
  assert.match(module, />Từ tháng</);
  assert.match(module, />Đến tháng</);
  assert.match(module, />Tất cả kỳ</);
  assert.match(module, />Áp dụng</);
  for (const preset of ['Tháng này', 'Tháng trước', '3 tháng gần nhất', 'Năm nay']) assert.match(module, new RegExp(preset));
  assert.doesNotMatch(module, /useSwipeDismiss/);
  assert.doesNotMatch(module, />Tùy chỉnh</);
  assert.doesNotMatch(module, /dashboard-latest-trip-scope/);
  assert.doesNotMatch(module, /Dữ Liệu Chuyến Gần Đây\s*<span[^>]*>Ngày mới nhất/);
  assert.match(module, /Array\.from\(\{ length: 12 \}/);
  assert.match(module, /<ProfitChart months=\{profitChartMonths\}/);
  assert.match(module, /row \? `\$\{row\.final < 0/);
  assert.doesNotMatch(module, /<ProfitChart rows=\{selectedRows\}/);
});

test('B2 dashboard styles contain responsive cards and scroll-contained tables', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /\.dashboard-module-kpis/);
  assert.match(css, /\.dashboard-module-table-wrap \{[^}]*overflow: auto/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /Dashboard month-range contract/);
  assert.match(css, /\.dashboard-period-trigger \{[\s\S]*width: 44px !important;[\s\S]*height: 44px !important;/);
  assert.match(css, /body > \.dashboard-period-drawer \{[\s\S]*top: 50% !important;[\s\S]*left: 50% !important;[\s\S]*width: min\(440px, calc\(100vw - 32px\)\) !important;/);
  assert.match(css, /\.dashboard-period-presets button \{[\s\S]*min-height: 44px !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*dashboard-period-drawer/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});

test('App shell supports guarded mobile pull-to-refresh with a visible menu fallback', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const pull = read('next-shell/components/platform/PullToRefresh.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(shell, /<PullToRefresh onRefresh=\{refresh\}/);
  assert.match(shell, /className="shell-menu-refresh"/);
  assert.match(shell, /className="shell-account-actions"/);
  assert.match(shell, /aria-label="Làm mới dữ liệu"/);
  assert.doesNotMatch(shell, /<span>Làm mới dữ liệu<\/span>/);
  assert.match(shell, /className="ghost icon-button shell-header-refresh"/);
  assert.match(pull, /PULL_THRESHOLD_PX = 68/);
  assert.match(pull, /target\.closest\('\.topbar'\)/);
  assert.match(pull, /window\.scrollY > 0/);
  assert.match(pull, /deltaY < Math\.abs\(deltaX\) \* 1\.25/);
  assert.match(pull, /event\.preventDefault\(\)/);
  assert.match(pull, /Thả để cập nhật/);
  assert.match(css, /@media \(max-width: 768px\) and \(pointer: coarse\)/);
  assert.match(css, /\.shell-header-refresh \{[\s\S]*display: none !important;/);
  assert.match(css, /\.auth-user \.shell-account-actions > \.shell-menu-refresh \{[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*min-height: 44px;/);
  assert.match(css, /\.shell-account-actions \{[\s\S]*display: flex;[\s\S]*gap: 8px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*pull-to-refresh-indicator/);
});

test('Dashboard donut keeps signed real profit and places its unclipped legend to the right', () => {
  const module = read('next-shell/components/dashboard/DashboardModule.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(module, /const netProfit = row\.final/);
  assert.match(module, /chartValue: Math\.abs\(netProfit\)/);
  assert.match(module, /financial-donut-legend/);
  assert.doesNotMatch(module, /Math\.max\(0, row\.final\)/);
  assert.match(css, /\.financial-donut \{[^}]*grid-template-columns: 250px minmax\(320px, 1fr\)/);
  assert.match(css, /\.financial-donut-legend \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(200px, 1fr\)\)/);
  assert.match(css, /\.financial-donut-legend-label > span:last-child \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.financial-donut \{[^}]*grid-template-columns: 1fr/);
  assert.doesNotMatch(css, /@media \(max-width: 560px\)[\s\S]*?\.financial-donut \{[^}]*grid-template-columns: minmax\(0,1fr\)/);
});
