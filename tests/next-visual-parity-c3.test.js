const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('C3 candidate routes its root to the Next Dashboard without changing production alias', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.redirects, undefined);
  assert.match(read('next-shell/app/page.jsx'), /redirect\('\/dashboard'\)/);
  assert.match(read('ROLLBACK.md'), /dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg/);
});

test('C3 Next shell matches the six approved legacy navigation destinations', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  for (const [href, label] of [['/dashboard','Tổng quan'],['/reports','Báo cáo'],['/manage','Vận hành'],['/catalog','Danh mục'],['/cashflow','Quỹ'],['/settings','Cài đặt']]) {
    assert.match(shell, new RegExp(`href: '${href}'.+label: '${label}'`));
  }
  assert.doesNotMatch(shell, /label: 'Nền tảng'|label: 'Nhập liệu'|label: 'Đồng bộ'/);
  assert.match(shell, /aliases: \['\/entry'\]/);
  assert.match(shell, /aliases: \['\/observability'\]/);
});

test('C3 keeps the legacy logo, drawer, theme and five-item mobile navigation behavior', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const navigation = read('next-shell/components/platform/ShellNavigation.tsx');
  const css = read('next-shell/app/c2-exact.css');
  assert.match(shell, /apple-touch-icon\.png/);
  assert.match(shell, /drawer-backdrop/);
  assert.match(shell, /vtdb-theme/);
  assert.match(navigation, /mode === 'bottom'/);
  assert.match(css, /grid-template-columns: 260px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /bottom: calc\(12px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(shell, /ghost icon-button/);
  assert.match(shell, /\/open-sheet\?module=/);
  assert.match(shell, /\[data-shell-refresh\]/);
});

test('C3 rework encodes measured C2 dashboard geometry instead of the redesign', () => {
  const layout = read('next-shell/app/layout.jsx');
  const dashboard = read('next-shell/components/dashboard/DashboardModule.tsx');
  const css = read('next-shell/app/c2-exact.css');
  const baseline = read('docs/quality/C3_VISUAL_BASELINE.md');
  assert.match(layout, /Plus\+Jakarta\+Sans:wght@300;400;500;600;700;800/);
  assert.match(layout, /c2-exact\.css/);
  assert.match(dashboard, /dashboard-month-filter-title/);
  assert.match(dashboard, /className="kpi-card"/);
  assert.match(css, /\.dashboard-month-filter \{[\s\S]*min-height: 62px/);
  assert.match(css, /\.kpi-card \{[\s\S]*min-height: 108px/);
  assert.match(css, /\.kpi-grid \{[\s\S]*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.main \{ padding: 16px 12px 96px; \}/);
  assert.match(baseline, /Desktop 1440×900/);
  assert.match(baseline, /Mobile 390×844/);
  assert.match(baseline, /không phải redesign/);
});

test('C3 shell refresh delegates to each read module without changing API contracts', () => {
  for (const file of [
    'next-shell/components/dashboard/DashboardModule.tsx',
    'next-shell/components/report/ReportModule.tsx',
    'next-shell/components/manage/ManageReadOnlyModule.tsx',
    'next-shell/components/catalog/CatalogModule.tsx',
    'next-shell/components/cashflow/CashflowModule.tsx'
  ]) assert.match(read(file), /data-shell-refresh/, `${file} must expose its existing refresh action`);
});

test('C3 restores the legacy image export controls on Dashboard, Report and Cashflow', () => {
  const sources = [
    'next-shell/components/dashboard/DashboardModule.tsx',
    'next-shell/components/report/ReportModule.tsx',
    'next-shell/components/cashflow/CashflowModule.tsx'
  ].map(read).join('\n');
  for (const name of ['SoChuyenXe','TongQuan','ThuChi']) assert.match(sources, new RegExp(name));
  assert.match(sources, /exportCardAsImage/);
});

test('C3 preserves hidden module routes behind their approved parent menus', () => {
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  assert.match(manage, /href="\/entry"/);
  assert.match(settings, /href="\/observability"/);
  assert.match(manage + settings, /prefetch=\{false\}/);
});
