const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('ordinary topbar refreshes stay on Supabase and bypass only the browser cache', () => {
  const dashboard = read('next-shell/components/dashboard/DashboardModule.tsx');
  const report = read('next-shell/components/report/ReportModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(dashboard, /requestDashboard\(false, true\)/);
  assert.match(report, /loadPeriod\(periodMode, fromMonth, toMonth, false, true\)/);
  assert.match(manage, /load\(sheet,startDate,endDate,false,true\)/);
  assert.match(catalog, /load\(sheet,false,true\)/);
  assert.match(cashflow, /refresh\(tab, false, true\)/);
});

test('read-heavy modules reuse resolved and in-flight client requests', () => {
  for (const file of [
    'next-shell/components/report/ReportModule.tsx',
    'next-shell/components/manage/ManageReadOnlyModule.tsx',
    'next-shell/components/catalog/CatalogModule.tsx',
    'next-shell/components/cashflow/CashflowModule.tsx'
  ]) {
    const source = read(file);
    assert.match(source, /ResponseCache/);
    assert.match(source, /Inflight/);
  }
  assert.match(read('next-shell/components/dashboard/DashboardModule.tsx'), /dashboardResponseCache/);
});

test('cashflow applies one shared range request and loading copy identifies Supabase', () => {
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');
  const report = read('next-shell/components/report/ReportModule.tsx');
  assert.match(cashflow, /readSurface<FundRangePayload>\(year,\s*'range'/);
  assert.match(report, /Đang tải báo cáo từ Supabase/);
  assert.doesNotMatch(report, /Đang đồng bộ báo cáo từ Google Sheets/);
});

test('source metadata never invents a current timestamp when synchronization time is absent', () => {
  const source = read('next-shell/lib/platform/data-source-meta.ts');
  assert.match(source, /if \(!value\) return ''/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString/);
});
