const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Manage and Catalog paint a cached tab synchronously instead of flashing an empty table', () => {
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');

  assert.match(manage, /const cached=.*manageResponseCache\.get/);
  assert.match(manage, /setData\(cached\?\.data\|\|null\)/);
  assert.match(manage, /const response=cached\|\|await requestManage/);
  assert.match(catalog, /const cached=.*catalogResponseCache\.get/);
  assert.match(catalog, /setData\(cached\?\.data\|\|null\)/);
  assert.match(catalog, /const result=cached\|\|await requestCatalog/);
});

test('likely next tabs warm in the background and pointer intent prepares any tab', () => {
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');

  for (const tab of ['NL_Dau', 'NL_TaiXe']) assert.match(manage, new RegExp(`'${tab}'`));
  for (const tab of ['DM_Xe', 'DM_DuAn']) assert.match(catalog, new RegExp(`'${tab}'`));
  assert.match(manage, /onPointerEnter=\{\(\)=>prepareSheet\(name\)\}/);
  assert.match(catalog, /onPointerEnter=\{\(\)=>prepareSheet\(name\)\}/);
});

test('module prefetch starts early while remaining staggered', () => {
  const navigation = read('next-shell/components/platform/ShellNavigation.tsx');
  assert.match(navigation, /250 \+ index \* 350/);
  assert.doesNotMatch(navigation, /900 \+ index \* 700/);
});

test('route feedback is compact and never covers or blurs the current module', () => {
  const css = read('next-shell/app/platform.css');
  const start = css.indexOf('.route-navigation-feedback {');
  const end = css.indexOf('.route-navigation-feedback strong', start);
  const block = css.slice(start, end);

  assert.match(block, /pointer-events: none/);
  assert.match(block, /right: 16px/);
  assert.doesNotMatch(block, /inset: 0/);
  assert.doesNotMatch(block, /backdrop-filter/);
});
