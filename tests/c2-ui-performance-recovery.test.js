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
  assert.match(read('ROLLBACK.md'), /dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg/);
});

test('C2 recovery disables data-heavy navigation prefetch', () => {
  assert.match(read('next-shell/components/platform/ShellNavigation.tsx'), /prefetch=\{false\}/);
  assert.match(read('next-shell/components/platform/AppShell.tsx'), /prefetch=\{false\}/);
});
