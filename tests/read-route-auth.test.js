const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('same-origin dashboard and manage read routes authenticate before reading Supabase cache', () => {
  const dashboard = read('next-shell/app/dashboard-data/route.ts');
  const manage = read('next-shell/app/manage-data/route.ts');

  assert.match(dashboard, /await loadPlatformContext\(\{ module: 'transport', year: url\.searchParams\.get\('year'\) \|\| undefined \}\)/);
  assert.ok(
    dashboard.indexOf('await loadPlatformContext') < dashboard.indexOf('await loadDashboardData'),
    'Dashboard must authenticate before reading a service-role cache.'
  );

  assert.match(manage, /await loadPlatformContext\(\{ module: 'transport', year: query\.get\('year'\) \|\| undefined \}\)/);
  assert.match(manage, /await loadPlatformContext\(\{ module: 'cashflow'/);
  assert.ok(
    manage.indexOf("await loadPlatformContext({ module: 'cashflow'") < manage.indexOf('await loadCashflowSurface'),
    'Cashflow must authenticate before reading a service-role cache.'
  );
  assert.ok(
    manage.lastIndexOf("await loadPlatformContext({ module: 'transport', year:") < manage.indexOf('await loadManageData'),
    'Manage must authenticate before reading a service-role cache.'
  );
});

test('catalog cache routes enforce write-role visibility at the server boundary', () => {
  const route = read('next-shell/app/manage-data/route.ts');
  assert.match(route, /view'\) === 'catalog' && context\.user\.role === 'shareholder'/);
  assert.match(route, /surface'\) === 'catalog'[\s\S]*?context\.user\.role === 'shareholder'/);
  assert.match(route, /status: 403/);
});
