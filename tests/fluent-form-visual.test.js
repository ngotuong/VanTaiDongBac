const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'next-shell/app/platform.css'), 'utf8');
const goldenCss = fs.readFileSync(path.join(root, 'next-shell/app/c2-golden.css'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs/contracts/BUSINESS_FORM_SHEET_CONTRACT.md'), 'utf8');

test('Fluent form experiment uses restrained material roles instead of global glass', () => {
  assert.match(css, /Fluent Mica business forms/);
  assert.match(css, /--business-fluent-smoke:/);
  assert.match(css, /--business-fluent-shell:/);
  assert.match(css, /--business-fluent-canvas:/);
  assert.match(css, /--business-fluent-solid: #ffffff/);
  assert.match(css, /\.modal-overlay\.side-drawer-overlay:has\(> \[data-business-form-sheet\]\)/);
  assert.match(css, /backdrop-filter: blur\(6px\) saturate\(112%\)/);
});

test('editable controls remain opaque and never inherit backdrop blur', () => {
  assert.match(css, /\[data-business-form-sheet\][\s\S]*?:is\(input:not\([\s\S]*?background: var\(--business-fluent-solid\) !important;/);
  assert.match(css, /-webkit-backdrop-filter: none !important;[\s\S]*?backdrop-filter: none !important;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(contract, /`Solid`: bắt buộc cho input, select, textarea/);
  assert.doesNotMatch(css, /chromatic-aberration|hue-rotate|mix-blend-mode/);
});

test('Fluent decoration never overrides the positioning contract of the Manage entry sheet', () => {
  const fluentLayer = css.slice(css.indexOf('/* Fluent Mica business forms'));

  assert.match(goldenCss, /\.manage-entry-embedded \{ position: fixed;/);
  assert.doesNotMatch(
    fluentLayer,
    /html body > \.manage-entry-embedded\[data-business-form-sheet\] \{\s*position\s*:/,
  );
});
