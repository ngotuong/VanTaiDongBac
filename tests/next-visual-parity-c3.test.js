const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('C3 cut-forward routes the production root to the Next Dashboard', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.redirects, undefined);
  assert.match(read('next-shell/app/page.jsx'), /redirect\('\/dashboard'\)/);
  assert.match(read('scripts/prepare-legacy-shell.js'), /legacy-index\.html/);
});

test('C3 Next shell matches the six approved legacy navigation destinations', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  for (const [href, label] of [['/dashboard','Tổng quan'],['/reports','Báo cáo'],['/manage','Vận hành'],['/catalog','Danh mục'],['/cashflow','Quỹ'],['/settings','Cài đặt']]) {
    assert.match(shell, new RegExp(`href: '${href}'.+label: '${label}'`));
  }
  assert.doesNotMatch(shell, /label: 'Nền tảng'|label: 'Nhập liệu'|label: 'Đồng bộ'/);
  assert.match(shell, /aliases: \['\/entry'\]/);
  assert.match(shell, /aliases: \['\/observability'\]/);
});

test('C3 keeps the legacy logo, drawer, theme and five-item mobile navigation behavior', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const navigation = read('next-shell/components/platform/ShellNavigation.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(shell, /apple-touch-icon\.png/);
  assert.match(shell, /platform-drawer-backdrop/);
  assert.match(shell, /vtdb-theme/);
  assert.match(navigation, /mode === 'bottom'/);
  assert.match(css, /--platform-sidebar: 260px/);
  assert.match(css, /grid-template-columns: repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /bottom: calc\(12px \+ env\(safe-area-inset-bottom\)\)/);
});

test('C3 preserves hidden module routes behind their approved parent menus', () => {
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  assert.match(manage, /href="\/entry"/);
  assert.match(settings, /href="\/observability"/);
  assert.match(manage + settings, /prefetch=\{false\}/);
});
