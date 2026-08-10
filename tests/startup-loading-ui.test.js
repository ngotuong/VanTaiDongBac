const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('root layout streams a branded startup fallback before authenticated content', () => {
  const layout = read('next-shell/app/layout.jsx');
  assert.match(layout, /import \{ Suspense \} from 'react'/);
  assert.match(layout, /<Suspense fallback=\{<StartupLoadingScreen \/>}/);
  assert.match(layout, /async function AuthenticatedPlatform/);
  assert.match(layout, /await loadPlatformContext\(\)/);
  assert.match(layout, /<LoginGate/);
  assert.match(layout, /<WorkbookContextProvider value=\{context\}>/);
  assert.match(layout, /id="startup-loading-critical"/);
  assert.match(layout, /startup-loading-screen\{position:fixed;inset:0/);
});

test('login recovery and submit use honest full-screen loading phases', () => {
  const controls = read('next-shell/components/platform/SessionControls.tsx');
  assert.match(controls, /Đang khôi phục phiên đăng nhập…/);
  assert.match(controls, /Đang xác thực tài khoản…/);
  assert.match(controls, /Đang thiết lập phiên đăng nhập an toàn\./);
  assert.match(controls, /if \(busy\) return <StartupLoadingScreen/);
  assert.match(controls, /disabled=\{busy\}/);
});

test('startup loader is accessible, branded and does not expose fake progress', () => {
  const component = read('next-shell/components/platform/StartupLoadingScreen.tsx');
  assert.match(component, /role="status"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-busy="true"/);
  assert.match(component, /Vận tải Đông Bắc/);
  assert.match(component, /Kết nối an toàn với hệ thống dữ liệu/);
  assert.doesNotMatch(component, /%|progressbar|aria-valuenow/);
});

test('startup feedback is immediately visible and motion has a reduced-motion fallback', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /\.startup-loading-screen\s*\{/);
  assert.match(css, /\.startup-loading-screen[\s\S]+?opacity: 1;/);
  assert.doesNotMatch(css, /startup-loading-reveal/);
  assert.match(css, /transform: translate3d\(202px, 0, 0\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.startup-loading-marker \{ opacity: 1; transform: translate3d\(101px, 0, 0\); \}/);
});
