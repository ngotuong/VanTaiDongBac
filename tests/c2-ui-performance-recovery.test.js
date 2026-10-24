const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('D1 removes the temporary C2 presentation route while retaining documented deployment rollback', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.redirects, undefined);
  assert.equal(config.rewrites, undefined);
  assert.doesNotMatch(JSON.parse(read('package.json')).scripts['build:next-accounts'], /prepare-legacy-shell/);
  assert.match(read('ROLLBACK.md'), /PROJECT_CONTEXT/);
  assert.match(read('PROJECT_CONTEXT.md'), /dpl_[A-Za-z0-9]+/);
});

test('C3 golden shell keeps navigation client-driven without data-heavy Link prefetch', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const navigation = read('next-shell/components/platform/ShellNavigation.tsx');
  assert.match(shell, /startNavigation\(\(\) => router\.push\(href\)\)/);
  assert.match(shell, /className=\{`route-progress\$\{/);
  assert.match(shell, /routesEqual\(pendingHref, currentPath\)/);
  assert.match(shell, /Boolean\(navigationTarget\) && routesEqual\(navigationTarget, href\)/);
  assert.match(shell, /window\.setTimeout\(\(\) => setPendingHref\(''\), 12000\)/);
  assert.match(navigation, /if \(!pending\) onNavigate\(item\.href\)/);
  assert.match(navigation, /router\.prefetch\(href\)/);
  assert.match(navigation, /onPointerEnter=.*prepare/);
  assert.match(navigation, /aria-busy=\{pending \|\| undefined\}/);
  assert.doesNotMatch(navigation, /<Link|prefetch=/);
});

test('C3 mobile navigation restores C2 scroll visibility, safe-area position, and deep active color', () => {
  const navigation = read('next-shell/components/platform/ShellNavigation.tsx');
  const routes = read('next-shell/lib/platform/routes.ts');
  const css = read('next-shell/app/c2-golden.css');
  assert.ok(routes.includes("raw.replace(/\\/+$/, '')"));
  assert.match(navigation, /const threshold = 15/);
  assert.match(navigation, /currentScrollY > 80/);
  assert.match(navigation, /currentScrollY >= maxScrollY - 60/);
  assert.match(navigation, /currentScrollY <= 10/);
  assert.match(navigation, /requestAnimationFrame\(update\)/);
  assert.match(navigation, /navHidden \? ' nav-hidden'/);
  assert.doesNotMatch(navigation, /disabled=\{pending\}/);
  assert.match(css, /bottom: max\(4px, env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /bottom-nav button\.active\.nav-pending \{ background: var\(--deep\) !important; color: #fff !important; opacity: 1 !important;/);
});

test('C3 interaction feedback exposes one accessible global toast contract', () => {
  const toast = read('next-shell/lib/platform/toast.ts');
  const viewport = read('next-shell/components/platform/ToastViewport.tsx');
  const css = read('next-shell/app/c2-golden.css');
  assert.match(toast, /new CustomEvent<ToastDetail>\('vtdb:toast'/);
  assert.match(toast, /3600/);
  assert.match(viewport, /aria-live=\{isError \? 'assertive' : 'polite'\}/);
  assert.match(viewport, /aria-label="Đóng thông báo"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('C3 route loading boundary uses visible C2 skeleton feedback', () => {
  const loading = read('app/loading.jsx');
  assert.match(loading, /className="view active c3-route-loading"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /shimmer-table/);
});
