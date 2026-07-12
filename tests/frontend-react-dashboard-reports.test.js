const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('React Dashboard defaults off and preserves the legacy rollback viewer', () => {
  const entry = read('react-dashboard/entry.jsx');
  const template = read('index.template.html');
  assert.match(entry, /if \(!enabled\(window\.__REACT_DASHBOARD_ENABLED\)\) return false/);
  assert.match(entry, /legacy\.remove\(\)/);
  assert.match(template, /dashboardLegacyRoot/);
  assert.match(template, /dashboardReactRoot/);
  assert.match(read('.env.example'), /VITE_REACT_DASHBOARD_ENABLED=false/);
});

test('React Dashboard preserves metric, chart, latest-trip, summary, and image-export contracts', () => {
  const component = read('next-shell/components/Dashboard.jsx');
  const legacy = read('client_dashboard.html');
  for (const id of ['homeFilterTitle','homeMonthFilter','metrics','profitChart','chartNote','homeLatestTripsCard','latestTripsDate','homeLatestTripsTable','homeSummaryTableCard','homeSummaryTable']) assert.match(component, new RegExp(`id="${id}"`));
  for (const label of ['Dữ liệu chuyến gần đây','Kết quả kinh doanh theo tháng','Lợi nhuận gộp','Lợi nhuận thực']) assert.match(component, new RegExp(label));
  assert.match(component, /'SoChuyenXe'/); assert.match(component, /'TongQuan'/);
  assert.match(legacy, /getLatestTripsWithPending_/);
  assert.match(legacy, /calculatedGross = rev - taxTndn - taxVat - fuelQM - toll/);
});

test('Next shell exports the independent Dashboard canary route', () => {
  assert.match(read('next-shell/app/dashboard/page.jsx'), /<Dashboard/);
  assert.match(read('package.json'), /build-dashboard-react\.js/);
});
