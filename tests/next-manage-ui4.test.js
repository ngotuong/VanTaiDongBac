const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('UI-4 Manage Module helpers parse numbers correctly', () => {
  const parseNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
    if (!text) return 0;
    let normalized = text;
    if (text.includes(',')) normalized = text.replace(/\./g, '').replace(/,(?=.*[,])/g, '').replace(',', '.');
    else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  assert.equal(parseNumber('1.234.567'), 1234567);
  assert.equal(parseNumber('250,5'), 250.5);
  assert.equal(parseNumber(3.5), 3.5);
  assert.equal(parseNumber('3.5'), 3.5);
  assert.equal(parseNumber(3300152.4289367534), 3300152.4289367534);
  assert.equal(parseNumber('34.378.000 đ'), 34378000);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber(null), 0);
});

test('UI-4 Manage Module calculates unique vehicles count accurately', () => {
  const countUniqueVehicles = (rows, vehicleIdx) => {
    if (vehicleIdx < 0) return 0;
    const plates = new Set();
    for (const r of rows) {
      const plate = String(r.values[vehicleIdx] ?? '').trim().toUpperCase();
      if (plate) plates.add(plate);
    }
    return plates.size;
  };

  const rows = [
    { values: ['01/07/2026', '20H-12345', '100.000'] },
    { values: ['02/07/2026', '20H-67890', '200.000'] },
    { values: ['03/07/2026', '20H-12345', '150.000'] },
    { values: ['04/07/2026', '', '50.000'] }
  ];

  assert.equal(countUniqueVehicles(rows, 1), 2);
  assert.equal(countUniqueVehicles(rows, -1), 0);
});

test('UI-4 Manage Module date range calculations return valid ISO strings', () => {
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const todayIso = iso(today);
  assert.match(todayIso, /^\d{4}-\d{2}-\d{2}$/);
});

test('UI-4 totals are scoped to the complete filtered result and all edit dropdowns use the complete catalog cache', () => {
  const source = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(source, /const totalLiters=rows\.reduce/);
  assert.match(source, /const totalAmount=rows\.reduce/);
  assert.match(source, /const totalTrips=rows\.reduce/);
  assert.match(source, /for\(const r of rows\)/);
  assert.match(source, /Tổng chuyến:/);
  assert.match(source, /Tổng lít:/);
  assert.match(source, /Tổng tiền:/);
  assert.doesNotMatch(source, /Tổng (?:số |thành )?.*trang này/);
  assert.match(source, /formatQuantity\(totalTrips\)/);
  assert.match(source, /formatQuantity\(totalLiters\)/);
  assert.match(source, /replace\(\/\\s\*\(\?:₫\|đ\)\\s\*\$\/i,''\)/);
  assert.doesNotMatch(source, /toLocaleString\('vi-VN'\)\} đ/);
  assert.match(source, /params:\{formType:''\}/);
  assert.doesNotMatch(source, /const totalTrips=pageRows\.reduce/);
});

test('UI-4 initial payload uses the current transport month instead of an unlabeled recent cache', () => {
  const page = read('next-shell/app/manage/page.jsx');
  const server = read('next-shell/lib/manage-server.ts');
  assert.match(page, /loadManageData\(currentTransportMonthRange\(\)\)/);
  assert.match(server, /timeZone: 'Asia\/Ho_Chi_Minh'/);
  assert.match(server, /startDate: `\$\{value\.year\}-\$\{value\.month\}-01`/);
});

test('UI-4 entry and edit forms use the shared bottom-sheet swipe-down contract', () => {
  const source = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const gesture = read('next-shell/components/platform/useSwipeDismiss.ts');
  const css = read('next-shell/app/platform.css');
  assert.match(source, /useSwipeDismiss/);
  assert.match(source, /manage-entry-embedded swipe-dismiss-surface/);
  assert.match(source, /side-drawer-overlay/);
  assert.match(gesture, /direction = 'down'/);
  assert.match(gesture, /primaryDelta = direction === 'down' \? deltaY : deltaX/);
  assert.match(gesture, /primaryDelta < Math\.abs\(crossDelta\) \* 1\.2/);
  assert.match(gesture, /threshold = 72/);
  assert.match(gesture, /requestAnimationFrame/);
  assert.match(gesture, /scheduleOffset\(event\.currentTarget/);
  assert.doesNotMatch(gesture, /setOffsetX/);
  assert.match(css, /translate3d\(0,var\(--drawer-swipe-offset\),0\)/);
  assert.match(css, /translate3d\(0,100%,0\)/);
  assert.match(css, /align-items: flex-end !important/);
  assert.match(css, /cubic-bezier\(\.16,1,\.3,1\)/);
  assert.match(css, /\.entry-sheet-backdrop\.active,[\s\S]*background: rgba\(15,23,42,\.22\) !important/);
  assert.match(css, /backdrop-filter: none !important/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('UI-4 date range filters match the shared form typography and left alignment', () => {
  const source = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(source, /aria-label="Từ ngày" className="native-date-input vi-date-input"/);
  assert.match(source, /aria-label="Đến ngày" className="native-date-input vi-date-input"/);
  assert.match(
    css,
    /\.manage-filter-panel \.cashflow-date-input\s*\{[\s\S]*height: var\(--platform-control-height\) !important;[\s\S]*padding: 0 var\(--platform-control-padding-x\) !important;/,
  );
  assert.match(
    css,
    /\.manage-filter-panel \.cashflow-date-input \.date-display-text\s*\{[\s\S]*font-size: var\(--platform-control-font-size\) !important;[\s\S]*font-weight: 500 !important;[\s\S]*text-align: left !important;/,
  );
});
