const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('C1 dynamic Next runtime remains intact after C3 cut-forward', () => {
  const config = read('next.config.mjs');
  const build = read('package.json');
  const legacyVercel = read('vercel.json');
  assert.doesNotMatch(config, /output:\s*['"]export['"]/);
  assert.doesNotMatch(config, /basePath/);
  assert.doesNotMatch(build, /copy-next-accounts|clean-next-accounts|scripts\/build\.js/);
  assert.match(legacyVercel, /"framework": "nextjs"/);
  assert.match(legacyVercel, /"buildCommand": "npm run build:next-accounts"/);
  assert.doesNotMatch(legacyVercel, /outputDirectory/);
  assert.doesNotMatch(legacyVercel, /legacy-index\.html/);
  assert.match(read('app/foundation/page.jsx'), /next-shell\/app\/foundation\/page\.jsx/);
});

test('A1 server slice reads HttpOnly cookie context without rendering spreadsheet id', () => {
  const page = read('next-shell/app/foundation/page.jsx');
  assert.match(page, /dynamic = 'force-dynamic'/);
  assert.match(page, /await cookies\(\)/);
  assert.match(page, /getAuthenticatedUser/);
  assert.match(page, /publicContext/);
  assert.doesNotMatch(page, /context\.spreadsheetId/);
});

test('Next session controls synchronize and clear the server session', () => {
  const auth = read('next-shell/components/platform/SessionControls.tsx');
  assert.match(auth, /fetch\('\/api\/session'/);
  assert.match(auth, /method: 'DELETE'/);
  assert.match(auth, /X-VTDB-CSRF/);
  assert.match(auth, /Đang khôi phục phiên/);
  assert.match(auth, /40 \* 60 \* 1000/);
  assert.match(auth, /refreshIfNeeded\(\);\s*const interval/);
  assert.match(auth, /visibilitychange/);
  assert.match(read('next-shell/components/platform/AppShell.tsx'), /<SessionKeepAlive \/>/);
  const endpoint = read('api/session.js');
  assert.match(endpoint, /accessTokenExpiresWithin\(token\)/);
  assert.match(endpoint, /if \(refreshed\) res\.setHeader\('Set-Cookie'/);
});

test('runtime context remains a proxy-local read-only action', () => {
  const proxy = read('api/app.js');
  const branch = proxy.slice(proxy.indexOf("action === 'runtimeContext'"), proxy.indexOf('assertAuthorized(user, action);', proxy.indexOf("action === 'runtimeContext'")) + 40);
  assert.match(branch, /req\.method !== 'GET'/);
  assert.match(proxy, /workbookContextService\.publicContext/);
});

test('C3 cut-forward keeps Next runtime and removes the temporary root recovery redirect', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.framework, 'nextjs');
  assert.equal(config.buildCommand, 'npm run build:next-accounts');
  assert.equal(config.outputDirectory, undefined);
  assert.equal(config.redirects, undefined);
  assert.equal(config.rewrites, undefined);
});
