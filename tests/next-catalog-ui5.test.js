const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('UI-5 Catalog Module has tabular-nums font and sticky layout elements', () => {
  const module = read('next-shell/components/catalog/CatalogModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  assert.match(module, /tabular-nums/);
  assert.match(module, /sticky-col/);
  assert.match(module, /sticky-col-right/);
  assert.match(css, /UI-5 Catalog Module Upgrade Styles/);
  assert.match(css, /position: sticky/);
});

test('UI-5 Catalog Module replaces window.confirm with a custom Delete Confirmation Modal', () => {
  const module = read('next-shell/components/catalog/CatalogModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  assert.doesNotMatch(module, /window\.confirm/);
  assert.match(module, /deletingRow/);
  assert.match(module, /confirmRemove/);
  assert.match(module, /catalog-delete-confirm-overlay/);
  assert.match(module, /catalog-delete-confirm-modal/);
  assert.match(module, /Xác nhận xóa dữ liệu/);
  assert.match(css, /\.catalog-delete-confirm-modal/);
  assert.match(css, /\.danger-btn/);
});

test('UI-5 Catalog Module action buttons are touch-friendly with touch-action-btn class', () => {
  const module = read('next-shell/components/catalog/CatalogModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  assert.match(module, /touch-action-btn/);
  assert.match(css, /min-width: 44px !important/);
  assert.match(css, /min-height: 44px !important/);
});

test('UI-5 add and edit forms open as bottom sheets with swipe-down dismissal', () => {
  const module = read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(module, /useSwipeDismiss/);
  assert.match(module, /side-drawer-overlay/);
  assert.match(module, /swipe-dismiss-surface/);
  assert.match(module, /data-swipe-dismiss-handle/);
});
