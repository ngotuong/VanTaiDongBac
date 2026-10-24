const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI router makes the shared UI design system the entrypoint for UI work', () => {
  const router = read('docs/ai/AI_START_HERE.md');
  const contract = read('docs/contracts/UI_DESIGN_SYSTEM_CONTRACT.md');

  assert.match(router, /docs\/contracts\/UI_DESIGN_SYSTEM_CONTRACT\.md/);
  for (const invariant of ['360', '390', '430', '44×44px', 'roving `tabIndex`', 'background-image: none']) {
    assert.match(contract, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('live notification and Fund catalog surfaces clear legacy light backgrounds', () => {
  const css = read('next-shell/app/platform.css');
  const hardening = css.slice(css.indexOf('/* R4 UI system hardening (2026-09-29).'));

  assert.match(hardening, /\.notification-panel-toolbar,[\s\S]*?\.fund-catalog-form \{[\s\S]*?background-color: var\(--platform-surface\) !important;/);
  assert.match(hardening, /\.notification-panel-header,[\s\S]*?\.fund-catalog-form \{[\s\S]*?background-image: none !important;/);
  assert.match(hardening, /#cashflowView \.fund-catalog-table tbody td:not\(\.cashflow-empty\) \{[\s\S]*?height: 44px !important;/);
});

test('business form overlay owns centering without a horizontal surface transform', () => {
  const css = read('next-shell/app/platform.css');
  const hardening = css.slice(css.indexOf('/* R4 UI system hardening (2026-09-29).'));

  assert.match(hardening, /\.modal-overlay\.side-drawer-overlay:has\(> \[data-business-form-sheet\]\)[\s\S]*?align-items: center !important;[\s\S]*?justify-content: center !important;/);
  assert.match(hardening, /> \[data-business-form-sheet\] \{[\s\S]*?position: relative !important;[\s\S]*?inset: auto !important;[\s\S]*?translate3d\(0, var\(--drawer-swipe-offset, 0px\), 0\)/);
});

test('Entry tabs expose every ARIA relationship, keyboard path and active reveal', () => {
  const entry = read('next-shell/components/entry/EntryModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(entry, /className="form-list entry-form-tabs" role="tablist"/);
  assert.match(entry, /aria-controls="entry-form-panel"/);
  assert.match(entry, /tabIndex=\{form === type \? 0 : -1\}/);
  assert.match(entry, /ArrowRight/);
  assert.match(entry, /ArrowLeft/);
  assert.match(entry, /event\.key === 'Home'/);
  assert.match(entry, /event\.key === 'End'/);
  assert.match(entry, /scrollIntoView\(\{ behavior: 'auto', block: 'nearest', inline: 'nearest' \}\)/);
  assert.match(css, /\.entry-form-tabs \{[\s\S]*?overflow-x: auto !important;/);
});

test('swipe dismiss relies on touch-action instead of cancelling passive touch movement', () => {
  const swipe = read('next-shell/components/platform/useSwipeDismiss.ts');
  const css = read('next-shell/app/platform.css');

  assert.doesNotMatch(swipe, /preventDefault\(\)/);
  assert.match(css, /\[data-swipe-dismiss-handle\] \{[\s\S]*?touch-action: none !important;/);
});

test('Fund catalog terminal density keeps compact controls and horizontal access', () => {
  const css = read('next-shell/app/platform.css');
  const terminal = css.slice(css.indexOf('/* R5 business form and density contract (2026-09-29).'));
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');
  assert.match(terminal, /#cashflowView \.fund-catalog-chips \{[\s\S]*?overflow-x: auto !important;/);
  assert.match(terminal, /#cashflowView \.fund-catalog-chips \.fund-chip \{[\s\S]*?min-height: 44px !important;[\s\S]*?padding: 0 14px !important;/);
  assert.match(terminal, /#cashflowView \.fund-catalog-form \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto auto !important;/);
  assert.match(cashflow, /BusinessInput aria-label="Nhập nội dung danh mục"/);
});
