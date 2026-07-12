const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('A1 selects dynamic Next runtime while legacy root remains outside the canary basePath', () => {
  const config = read('next.config.mjs');
  const build = read('package.json');
  const legacyVercel = read('vercel.json');
  const nextVercel = read('vercel.next.json');
  assert.doesNotMatch(config, /output:\s*['"]export['"]/);
  assert.match(config, /basePath:\s*['"]\/next-accounts['"]/);
  assert.doesNotMatch(build, /copy-next-accounts/);
  assert.match(build, /clean-next-accounts/);
  assert.match(legacyVercel, /"outputDirectory": "\."/);
  assert.match(nextVercel, /"framework": "nextjs"/);
  assert.doesNotMatch(nextVercel, /outputDirectory/);
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

test('legacy auth synchronizes and clears the server session', () => {
  const auth = read('client_auth.html');
  assert.match(auth, /syncServerSession\(data\.session\)/);
  assert.match(auth, /fetch\('\/api\/session'/);
  assert.match(auth, /method: 'DELETE'/);
  assert.match(auth, /X-VTDB-CSRF/);
});

test('runtime context remains a proxy-local read-only action', () => {
  const proxy = read('api/app.js');
  const branch = proxy.slice(proxy.indexOf("action === 'runtimeContext'"), proxy.indexOf('assertAuthorized(user, action);', proxy.indexOf("action === 'runtimeContext'")) + 40);
  assert.match(branch, /req\.method !== 'GET'/);
  assert.match(proxy, /workbookContextService\.publicContext/);
});

test('legacy production keeps root output and same-origin proxies only the Next canary path', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.outputDirectory, '.');
  assert.deepEqual(config.rewrites, [{
    source: '/next-accounts/:path*',
    destination: 'https://vantaidongbac-next-canary.vercel.app/next-accounts/:path*'
  }]);
});
