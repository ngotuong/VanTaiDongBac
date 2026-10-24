const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Report period selection clears stale rows immediately and only the latest request may render', () => {
  const source = read('next-shell/components/report/ReportModule.tsx');
  const normalized = source.indexOf('const normalizedFrom = normalizeMonth(targetFrom)');
  const immediate = source.indexOf('setPeriodMode(targetMode)');
  const cached = source.indexOf('reportResponseCache.get(targetKey)');
  const clearStale = source.indexOf('setRenderedPeriod(null)');
  const request = source.indexOf('await requestReport(workbook.year, targetMode');

  assert.ok(normalized >= 0 && immediate > normalized && cached > immediate && clearStale > cached && clearStale < request);
  assert.match(source, /if \(targetKey !== renderedPeriod\) \{\s*setBundle\(null\);\s*setRenderedPeriod\(null\);/);
  assert.match(source, /const latestRequest = useLatestAsyncRequest\(\)/);
  assert.match(source, /if \(!requestState\.isCurrent\(\)\) return/);
  assert.match(source, /const hasCurrentBundle = Boolean\(bundle && renderedPeriod === periodKey\)/);
  assert.match(source, /loading && !hasCurrentBundle/);
  assert.match(source, /aria-busy=\{loading \|\| undefined\}/);
  assert.doesNotMatch(source, /id="reportMonth(?:From|To)Filter"[^>]*disabled=\{loading\}/);
});

test('Report range cache, in-flight de-duplication and reduced-motion crossfade follow the fast-filter contract', () => {
  const source = read('next-shell/components/report/ReportModule.tsx');
  const hook = read('next-shell/components/platform/useLatestAsyncRequest.ts');
  const css = read('next-shell/app/platform.css');
  assert.match(source, /reportResponseCache\.get\(targetKey\)/);
  assert.match(source, /reportInflight\.has\(key\)/);
  assert.match(source, /report-stack report-stack-enter/);
  assert.match(hook, /controllerRef\.current\?\.abort\(\)/);
  assert.match(hook, /sequence === sequenceRef\.current/);
  assert.match(css, /@keyframes report-stack-enter/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*#reportsView \.report-stack-enter \{ animation: none; \}/);
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
