const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('visible revalidation stays lightweight and retries when the app becomes visible', () => {
  const hook = read('next-shell/components/platform/useVisibleRevalidation.ts');
  assert.match(hook, /DEFAULT_INTERVAL_MS = 60_000/);
  assert.match(hook, /document\.visibilityState !== 'visible'/);
  assert.match(hook, /runningRef\.current/);
  assert.match(hook, /visibilitychange/);
});

test('business read modules bypass only browser cache during silent revalidation', () => {
  const dashboard = read('next-shell/components/dashboard/DashboardModule.tsx');
  const report = read('next-shell/components/report/ReportModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');
  [dashboard, report, manage, catalog, cashflow].forEach((source) => assert.match(source, /useVisibleRevalidation/));
  assert.match(dashboard, /requestDashboard\(false, true\)/);
  assert.match(report, /requestReport\(target\.mode, target\.fromMonth, target\.toMonth, false, true\)/);
  assert.match(manage, /requestManage\(target\.sheet,target\.startDate,target\.endDate,false,true\)/);
  assert.match(catalog, /requestCatalog\(target,false,true\)/);
  assert.match(cashflow, /readSurface<[\s\S]*false, true/);
});
