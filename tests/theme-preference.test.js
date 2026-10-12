const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('payroll positive amounts meet AA on dark surfaces while export stays light', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /\.payroll-explanation-modal:not\(\.is-exporting\)\s+\.payroll-explanation-card :is\(\.is-positive, \.is-matched\)\s*\{\s*color: var\(--platform-accent\) !important;/);
  const dark = css.slice(css.indexOf(':root[data-theme="dark"] {'));
  const accent = dark.match(/--platform-accent:\s*(#[\da-f]{6})/i)[1];
  const sandbox = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read('next-shell/lib/platform/color-contrast.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  for (const background of ['#111827', '#0b1220']) assert.ok(sandbox.exports.colorContrast(accent, background) >= 4.5);
});

test('theme preference supports light, dark and system without a startup flash', () => {
  const layout = read('next-shell/app/layout.jsx');
  const control = read('next-shell/components/platform/ThemePreferenceControl.tsx');
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const shell = read('next-shell/components/platform/AppShell.tsx');

  assert.match(layout, /vtdb-theme-preference/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(settings, /key: 'appearance', label: 'Giao diện'/);
  assert.match(settings, /<ThemePreferenceControl \/>/);
  assert.match(control, /'light' \| 'dark' \| 'system'/);
  assert.match(control, /role="radiogroup"/);
  assert.match(control, /role="radio"/);
  assert.match(control, /localStorage\.setItem\(STORAGE_KEY, value\)/);
  assert.match(control, /export function ThemeRuntimeSync/);
  assert.match(control, /media\.addEventListener\('change', update\)/);
  assert.match(shell, /<ThemeRuntimeSync \/>/);
  assert.match(control, /meta\[name="theme-color"\]/);
});

test('dark mode uses semantic tokens and keeps exported tables light', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /Final dark-mode compatibility layer/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.match(css, /--platform-surface: #111827;/);
  assert.match(css, /--platform-text: #e5f3f1;/);
  assert.match(css, /:root\[data-theme="dark"\] \.table-card\.is-exporting/);
  assert.match(css, /color-scheme: light;/);
});

test('dark mode normalizes legacy cards, filters and every live table surface', () => {
  const css = read('next-shell/app/platform.css');
  const integrity = css.slice(css.indexOf('/* Dark surface integrity contract (2026-09-25).'));

  assert.match(integrity, /\.dashboard-module-kpis \.dashboard-kpi-card/);
  assert.match(integrity, /\.fund-kpi-card\.kpi-card/);
  assert.match(integrity, /#platform-content \.shimmer/);
  assert.match(integrity, /#172033 25%, #263449 37%, #172033 63%/);
  assert.match(integrity, /\.report-filter-panel/);
  assert.match(integrity, /\.cashflow-overview-filter-panel/);
  assert.match(integrity, /\.view\.active[\s\S]*select\.platform-content-select\.platform-content-select/);
  assert.match(integrity, /background-color: #0b1220 !important;/);
  assert.match(integrity, /\.table-card:not\(\.is-exporting\) table thead th/);
  assert.match(integrity, /\.table-card:not\(\.is-exporting\) table tbody tr:nth-child\(n\) > td\.sticky-col/);
  assert.match(integrity, /\.table-card:not\(\.is-exporting\) table tbody tr:nth-child\(even\) > td\.report-period-total/);
  assert.match(integrity, /\.table-card:not\(\.is-exporting\) table[\s\S]*\.total-row/);
  assert.match(integrity, /\.modal-container/);
  assert.match(integrity, /\[data-business-form-sheet\]/);
  assert.match(integrity, /\.table-card:not\(\.is-exporting\) \.fund-export-section \.fund-export-table td/);
  assert.match(integrity, /\.dashboard-latest-trips-table \.dashboard-trip-ticket/);
  assert.match(integrity, /\.cashflow-filter-add/);
  assert.match(integrity, /linear-gradient\(135deg, #0f766e, #0d9488\)/);
});

// The embedded Entry ID selectors previously beat the generic dark theme.
test('embedded Entry controls and labels no longer force light colours at any viewport', () => {
  const css = read('next-shell/app/platform.css');
  const start = css.indexOf('.manage-entry-embedded,\nbody.mobile-entry-open .manage-entry-embedded,');
  const entry = css.slice(start, css.indexOf('@media', start));
  assert.doesNotMatch(entry, /#(?:ffffff|f8fafc|475569|0f172a|cbd5e1|e2e8f0)\b/i);
  assert.match(entry, /color: var\(--platform-muted\)/);
  assert.match(entry, /background-color: var\(--platform-surface\)/);
});
