const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

test('D1 removes all authored legacy HTML presentation sources and generated shell artifacts', () => {
  const rootFiles = fs.readdirSync(root);
  assert.equal(exists('index.html'), false);
  assert.equal(exists('index.template.html'), false);
  assert.equal(exists('client.html'), false);
  assert.equal(exists('styles.html'), false);
  assert.equal(exists('public/legacy-index.html'), false);
  assert.deepEqual(rootFiles.filter((file) => /^client_.*\.html$/.test(file)), []);
  assert.deepEqual(rootFiles.filter((file) => /^styles_.*\.html$/.test(file)), []);
});

test('D1 build is Next-only and no longer publishes island bundles or compatibility rewrites', () => {
  const pkg = JSON.parse(read('package.json'));
  const config = JSON.parse(read('vercel.json'));
  assert.equal(pkg.scripts.build, 'node scripts/check-environment-identity.mjs && next build');
  assert.equal(pkg.scripts['check:identity'], 'node scripts/check-environment-identity.mjs');
  assert.equal(pkg.scripts['build:next-accounts'], 'node scripts/check-environment-identity.mjs && next build');
  assert.equal(pkg.dependencies.esbuild, undefined);
  assert.equal(config.rewrites, undefined);
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /legacy|react|island|prepare-legacy|scripts\/build\.js/);
  assert.doesNotMatch(read('.env.example'), /VITE_REACT_/);
});

test('D1 keeps Apps Script API entry points but removes HtmlService rendering', () => {
  const router = read('Router.gs');
  assert.match(router, /function doGet\(e\)/);
  assert.match(router, /function doPost\(e\)/);
  assert.match(router, /Apps Script chỉ phục vụ API/);
  assert.doesNotMatch(router, /HtmlService|renderIndex_|function include\(/);
  assert.match(read('ROLLBACK.md'), /PROJECT_CONTEXT/);
  assert.match(read('PROJECT_CONTEXT.md'), /dpl_[A-Za-z0-9]+/);
});
