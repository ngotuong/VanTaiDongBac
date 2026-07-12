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

test('React Reports defaults off and preserves tabs, filters, renderer, and CSV export', () => {
  const component = read('next-shell/components/Reports.jsx');
  const entry = read('react-reports/entry.jsx');
  const legacy = read('client_reports.html');
  assert.match(entry, /if \(!enabled\(window\.__REACT_REPORTS_ENABLED\)\) return false/);
  for (const type of ['all','finance','details','payroll','vehicles']) assert.match(component, new RegExp(`'${type}'`));
  for (const id of ['reportTabsBar','reportSearchInput','reportMonthFilter','reports']) assert.match(component, new RegExp(`id="${id}"`));
  assert.match(legacy, /function exportReportTableAsCsv/);
  assert.match(legacy, /function filterOverviewMatrix/);
  assert.match(read('.env.example'), /VITE_REACT_REPORTS_ENABLED=false/);
  assert.match(read('next-shell/app/reports/page.jsx'), /<Reports/);
  assert.match(read('package.json'), /build-reports-react\.js/);
});
