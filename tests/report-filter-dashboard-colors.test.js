const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Report month selection updates immediately and stale requests cannot overwrite the newest choice', () => {
  const source = read('next-shell/components/report/ReportModule.tsx');
  const normalized = source.indexOf('const normalizedTarget = normalizeMonth(target)');
  const immediate = source.indexOf("if (normalizedTarget !== 'latest') setMonth(normalizedTarget)");
  const request = source.indexOf('await requestReport(normalizedTarget');

  assert.ok(normalized >= 0 && immediate > normalized && immediate < request);
  assert.match(source, /const sequence = \+\+loadSequence\.current/);
  assert.match(source, /if \(sequence !== loadSequence\.current\) return/);
  assert.match(source, /aria-busy=\{loading \|\| undefined\}/);
  assert.doesNotMatch(source, /id="reportMonthFilter"[^>]*disabled=\{loading\}/);
});

test('Dashboard post-operation cost reuses the operating-cost semantic tone', () => {
  const source = read('next-shell/components/dashboard/DashboardModule.tsx');
  assert.match(source, /spec\.key === 'operatingCost' \|\| spec\.key === 'cashCost' \? 'dashboard-tone-operating-cost'/);
});

test('Dashboard hero percentage and month control inherit accessible semantic card colors', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /\.kpi-hero-status\.status-up \{\s*color: #059669 !important/);
  assert.match(css, /\.kpi-hero-status\.status-down \{\s*color: #dc2626 !important/);
  assert.match(css, /\.dashboard-kpi-card \.kpi-hero-select \{[\s\S]*color: var\(--dashboard-kpi-accent\)/);
  assert.match(css, /border-color: color-mix\(in srgb, var\(--dashboard-kpi-accent\) 38%, transparent\)/);
  assert.match(css, /background-color: var\(--dashboard-kpi-tint\)/);
  assert.match(css, /\.kpi-hero-select:focus-visible/);
});
