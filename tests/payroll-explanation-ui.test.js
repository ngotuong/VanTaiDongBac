const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Step B renders one protected payroll explanation surface with a compact image action', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  const presenter = read('next-shell/lib/platform/payroll-explanation.ts');

  assert.match(dialog, /createClientApiClient\(\)/);
  assert.match(dialog, /getPayrollExplanation/);
  assert.match(dialog, /params: \{ month, employee: employeeName, year: month\.slice\(-4\) \}/);
  assert.match(dialog, /payrollExplanationView\(explanation\)/);
  assert.match(dialog, /exportCardAsImage/);
  assert.match(dialog, /data-export-target="\.payroll-explanation-modal"/);
  assert.doesNotMatch(dialog, /Sao chép giải trình lương/);
  assert.match(presenter, /Tạm tính đến/);
  assert.match(presenter, /Kỳ đã qua/);
  assert.doesNotMatch(presenter, /Đã chốt/);
});

test('Step B keeps payroll row actions out of totals, range explanations and exports', () => {
  const report = read('next-shell/components/report/ReportModule.tsx');
  const exporter = read('next-shell/lib/platform/export-card.ts');

  assert.match(report, /exactPayrollMonth = \/\^\(0\[1-9\]\|1\[0-2\]\)/);
  assert.match(report, /!total && employeeName/);
  assert.match(report, /disabled=\{!exactPayrollMonth\}/);
  assert.match(report, /showPayrollExplanation && payrollEmployee && exactPayrollMonth/);
  assert.match(report, /data-export-hidden/);
  assert.match(exporter, /querySelectorAll<HTMLElement>\('\[data-export-hidden\]'\).*\.remove\(\)/);
  assert.match(exporter, /matches\('\[data-export-hidden\]'\)/);
});

test('payroll explanation uses a clear hierarchy and makes status understandable without color', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  const presenter = read('next-shell/lib/platform/payroll-explanation.ts');

  for (const label of ['Tổng quan', 'Các thành phần lương', 'Lương chuyến theo xe', 'Nghỉ phép và giảm trừ', 'Kiểm tra dữ liệu nguồn', 'Đối chiếu với bảng lương', 'Cần kiểm tra']) {
    assert.match(dialog, new RegExp(label));
  }
  for (const label of ['Đã khớp', 'Đang chờ', 'Cần kiểm tra']) assert.match(presenter, new RegExp(label));
  assert.match(presenter, /BC_BangLuong/);
  assert.match(presenter, /NL_ChamCong/);
  assert.match(presenter, /NL_NghiVanHanh chỉ điều chỉnh KPI/);
});

test('payroll explanation progressively discloses technical evidence and labels vehicle plates', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  const presenter = read('next-shell/lib/platform/payroll-explanation.ts');
  const exporter = read('next-shell/lib/platform/export-card.ts');

  assert.match(dialog, /Giải trình bảng lương/);
  assert.match(dialog, /payroll-explanation-vehicle-label">Biển số xe/);
  assert.match(dialog, /<details className="payroll-explanation-details">/);
  assert.match(dialog, /Xem cách tính chi tiết/);
  assert.match(dialog, /<details className="payroll-explanation-audit">/);
  assert.match(dialog, /Không có lương chuyến theo xe/);
  assert.match(presenter, /không có lương theo xe trong kỳ này/);
  assert.match(exporter, /!card\.classList\.contains\('payroll-explanation-modal'\)/);
  assert.match(exporter, /details\.open = true/);
});

test('Step B is a centered desktop dialog and a mobile bottom sheet', () => {
  const css = read('next-shell/app/platform.css');
  const legacyCss = read('next-shell/app/c2-golden.css');

  assert.match(css, /\.payroll-explanation-backdrop \{[\s\S]*place-items: center;/);
  const explanationLayer = Number(css.match(/\.payroll-explanation-backdrop \{[\s\S]*?z-index: (\d+);/)[1]);
  const mobileNavLayer = Number(legacyCss.match(/\.bottom-nav \{[\s\S]*?z-index: (\d+) !important;/)[1]);
  assert.ok(explanationLayer > mobileNavLayer, 'payroll dialog must cover the mobile navigation');
  assert.match(css, /\.payroll-explanation-modal \{[\s\S]*max-height: min\(90dvh, 900px\)/);
  assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*\.payroll-explanation-backdrop \{ place-items: end center;/);
  assert.match(css, /\.payroll-explanation-modal \{ width: 100%; max-height: 92dvh;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Step D-C renders rate basis, daily split and evidence from the shared presenter', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  const presenter = read('next-shell/lib/platform/payroll-explanation.ts');

  for (const label of ['Cơ sở chọn đơn giá', 'Tổng hợp theo loại lái', 'Chi tiết từng ngày', 'Ngưỡng chọn giá', 'Đơn giá nhiều lái']) {
    assert.match(`${dialog}\n${presenter}`, new RegExp(label));
  }
  assert.match(dialog, /line\.rateBasis\.map/);
  assert.match(dialog, /line\.breakdown\.map/);
  assert.match(dialog, /line\.dailyEvidence\.map/);
  assert.match(presenter, /dailyEvidence: line\.dailyEvidence\.map/);
  assert.match(dialog, /Chi tiết từng ngày/);
});

test('Step D-C keeps daily evidence responsive and accessible on mobile', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  const presenter = read('next-shell/lib/platform/payroll-explanation.ts');
  const css = read('next-shell/app/platform.css');

  assert.match(dialog, /aria-label=\{`Giải trình xe \$\{line\.vehicle\}`\}/);
  assert.match(dialog, /payroll-explanation-evidence-status/);
  assert.match(dialog, /Đã khớp/);
  assert.match(dialog, /Cần kiểm tra/);
  assert.match(css, /\.payroll-explanation-daily-table \{ min-width: 720px !important; \}/);
  assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*\.payroll-explanation-rate-basis \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.payroll-explanation-line-summary \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(presenter, /Chuyến xe dùng chọn giá/);
  assert.doesNotMatch(dialog, /Ngưỡng chọn giá = tổng chuyến xe sau giới hạn nghỉ việc/);
});

test('role explanations keep manager KPI and paid recruiter rows compact and role-specific', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  const presenter = read('next-shell/lib/platform/payroll-explanation.ts');
  const css = read('next-shell/app/platform.css');

  for (const label of ['Căn cứ thưởng quản lý', 'Căn cứ thưởng tuyển người', 'Nhân sự được tuyển', 'Số ngày', 'Tiền thưởng', 'Thưởng KPI theo xe và dự án', 'Thưởng tuyển người', 'Thưởng tuyển đã giải thích', 'Thưởng khác']) {
    assert.match(`${dialog}\n${presenter}`, new RegExp(label));
  }
  assert.match(dialog, /!view\.compactRoleOnly/);
  assert.match(presenter, /sourceRoleEvidence\.recruitmentRule\.daysInMonth/);
  assert.match(presenter, /recruitedPeople: sourceRoleEvidence\.recruitedPeople\.map/);
  assert.match(presenter, /managerVehicles: managerVehicleGroups\(sourceRoleEvidence\.managerRows\)/);
  assert.match(dialog, /vehicle\.projects\.map/);
  assert.match(dialog, /rowSpan=\{vehicle\.projects\.length\}/);
  assert.doesNotMatch(dialog, /Tổng xe/);
  assert.doesNotMatch(dialog, /payroll-explanation-manager-total/);
  assert.match(dialog, /className="is-trip-column">Chuyến/);
  assert.match(dialog, /className="is-trip-column">\{project\.trips\}/);
  assert.match(css, /\.payroll-explanation-role-table \.is-trip-column \{ width: 72px; min-width: 72px; text-align: right !important; font-variant-numeric: tabular-nums; \}/);
  assert.doesNotMatch(dialog, /Ngoài kỳ thưởng/);
  assert.match(dialog, /function MatchStatus/);
  assert.match(dialog, /aria-label=\{label \|\| 'Đã khớp'\}/);
  assert.match(css, /\.payroll-explanation-check \{ width: 20px; height: 20px;/);
  assert.match(css, /\.payroll-explanation-table-wrap td \{ padding: 6px 8px;/);
  assert.match(dialog, /view\?\.status\.tone === 'matched' \? <MatchStatus matched label="Dữ liệu lương đã khớp"/);
  assert.doesNotMatch(dialog, /payroll-explanation-status payroll-explanation-status-/);
  assert.match(dialog, /useSwipeDismiss\(\{ direction: 'down', onDismiss: onClose \}\)/);
  assert.match(dialog, /data-swipe-dismiss-handle/);
  assert.match(dialog, /data-overlay-scroll/);
  assert.match(css, /\.payroll-explanation-modal\.is-closing \{ transform: translate3d\(0, 100%, 0\); \}/);
});

test('Step D-C image export measures every evidence table and removes nested scroll clipping', () => {
  const exporter = read('next-shell/lib/platform/export-card.ts');

  assert.match(exporter, /querySelectorAll<HTMLElement>\('table'\)/);
  assert.match(exporter, /table\.scrollWidth/);
  assert.match(exporter, /leftInset \* 2/);
  assert.match(exporter, /\.payroll-explanation-table-wrap/);
  assert.match(exporter, /\.payroll-explanation-scroll/);
});

test('stale payroll explanations are hidden, queued once and polled with accessible feedback', () => {
  const dialog = read('next-shell/components/report/PayrollExplanationDialog.tsx');
  assert.match(dialog, /result\.stale/);
  assert.match(dialog, /'requestPayrollExplanationRefresh'/);
  assert.match(dialog, /refreshRequestedRef/);
  assert.match(dialog, /await api\.post<[\s\S]*?'requestPayrollExplanationRefresh'[\s\S]*?refreshRequestedRef\.current = refreshKey/);
  assert.doesNotMatch(dialog, /refreshRequestedRef\.current = refreshKey;\s*await api\.post/);
  assert.match(dialog, /setTimeout\(\(\) => setRequestKey/);
  assert.match(dialog, /pollCountRef\.current > 120/);
  assert.match(dialog, /sau khoảng tám phút/);
  assert.match(dialog, /Dữ liệu cũ đã được ẩn để tránh giải trình sai/);
  assert.match(dialog, /aria-live="polite"/);
});
