const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('C2 recovery artifact remains available after C3 removes its temporary root redirect', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.redirects, undefined);
  assert.deepEqual(config.rewrites, [
    { source: '/public/static/:path*', destination: '/static/:path*' }
  ]);
  assert.match(JSON.parse(read('package.json')).scripts['build:next-accounts'], /prepare-legacy-shell/);
  assert.match(read('scripts/prepare-legacy-shell.js'), /public.*legacy-index\.html/s);
});

test('C2 recovery disables data-heavy navigation prefetch', () => {
  assert.match(read('next-shell/components/platform/ShellNavigation.tsx'), /prefetch=\{false\}/);
  assert.match(read('next-shell/components/platform/AppShell.tsx'), /prefetch=\{false\}/);
});
