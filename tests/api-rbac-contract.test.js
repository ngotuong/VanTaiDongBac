const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/baseline-characterization.json'));
const sorted = (values) => [...values].sort();

function publicApiMethodBlocks() {
  const source = read('PublicApi.gs');
  const getStart = source.indexOf("if (normalizedMethod === 'GET')");
  const postStart = source.indexOf("if (normalizedMethod === 'POST')");
  const methodEnd = source.indexOf("throw new Error('Phương thức không hợp lệ", postStart);
  assert.ok(getStart >= 0 && postStart > getStart && methodEnd > postStart, 'Could not locate invokeApi method blocks.');
  return {
    get: source.slice(getStart, postStart),
    post: source.slice(postStart, methodEnd)
  };
}

function literalActions(source) {
  return sorted([...source.matchAll(/action === '([^']+)'/g)].map((match) => match[1]));
}

function frontendApiCalls() {
  const calls = [];
  const sourceRoot = path.join(root, 'next-shell');
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      if (!entry.isFile() || !/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) continue;
      const source = fs.readFileSync(target, 'utf8');
      for (const match of source.matchAll(/\b(?:api|client)\.(get|post)(?:<[^>]+>)?\(\s*'([^']+)'/g)) {
        calls.push({ file: path.relative(root, target), method: match[1].toUpperCase(), action: match[2] });
      }
    }
  };
  visit(sourceRoot);
  return calls;
}

test('literal frontend API calls resolve to a characterized method and handler surface', () => {
  const getActions = new Set(baseline.publicApi.getActions);
  const postActions = new Set(baseline.publicApi.postActions);
  const proxyLocalActions = new Set([...baseline.proxy.localAccountActions, ...baseline.proxy.localFoundationActions]);
  const calls = frontendApiCalls();
  assert.ok(calls.length > 0, 'No literal frontend API calls were found.');

  for (const call of calls) {
    if (proxyLocalActions.has(call.action)) continue;
    const expected = call.method === 'GET' ? getActions : postActions;
    assert.ok(
      expected.has(call.action),
      `${call.file} calls ${call.method} ${call.action}, but that method/action is not in the baseline PublicApi surface.`
    );
  }
});

test('PublicApi keeps read and write actions in separate method blocks', () => {
  const blocks = publicApiMethodBlocks();
  assert.deepEqual(literalActions(blocks.get), sorted(baseline.publicApi.getActions));
  assert.deepEqual(literalActions(blocks.post), sorted(baseline.publicApi.postActions));

  for (const action of baseline.publicApi.postActions) {
    assert.doesNotMatch(blocks.get, new RegExp(`action === '${action}'`), `Write action ${action} leaked into the GET block.`);
  }
  for (const action of baseline.publicApi.getActions) {
    assert.doesNotMatch(blocks.post, new RegExp(`action === '${action}'`), `Read action ${action} leaked into the POST block.`);
  }
});

test('Router does not expose business writes through GET', () => {
  const router = read('Router.gs');
  const doGetStart = router.indexOf('function doGet(e)');
  const doPostStart = router.indexOf('function doPost(e)');
  assert.ok(doGetStart >= 0 && doPostStart > doGetStart, 'Could not locate Router GET/POST functions.');
  const getBlock = router.slice(doGetStart, doPostStart);

  for (const action of baseline.publicApi.postActions) {
    assert.doesNotMatch(getBlock, new RegExp(`action === '${action}'`), `Router GET exposes write action ${action}.`);
  }
  assert.match(getBlock, /action === 'submitRowsGet'/);
  assert.match(getBlock, /đã tắt để tránh ghi trùng dữ liệu/);
});

test('shareholder allowlist contains no write, account-admin or operational actions', () => {
  const shareholder = new Set(baseline.proxy.shareholderActions);
  const readOnlyPostActions = new Set(['checkTripReconciliation']);
  const forbidden = new Set([
    ...baseline.publicApi.postActions.filter((action) => !readOnlyPostActions.has(action)),
    'getWriteJobStatus',
    'getRecentWriteJobs',
    'getSupabaseSyncStatus',
    'getReportCacheAudit',
    'getManageCacheAudit',
    'invalidateCaches',
    'listUsers',
    'createUser',
    'updateUser',
    'resetUserPassword'
  ]);

  for (const action of forbidden) {
    assert.equal(shareholder.has(action), false, `Shareholder must not be authorized for ${action}.`);
  }
  assert.equal(shareholder.has('changeOwnPassword'), true, 'Shareholder must retain own-password access.');
  assert.equal(shareholder.has('checkTripReconciliation'), true, 'Shareholder must retain read-only reconciliation access.');
});

test('proxy enforces shareholder deny-by-default before account and upstream dispatch', () => {
  const proxy = read('api/app.js');
  const accountService = read('server/services/account-service.js');
  const appsScriptClient = read('server/services/apps-script-client.js');
  const authorizationPolicy = read('server/services/authorization-policy.js');
  const authorizeCall = proxy.indexOf('assertAuthorized(user, action);');
  const accountDispatch = proxy.indexOf('accountService.handles(action)');
  const upstreamFetch = proxy.indexOf('await client.forward');
  assert.ok(authorizeCall >= 0, 'Missing proxy authorization call.');
  assert.ok(accountDispatch > authorizeCall, 'Account dispatch must happen after role authorization.');
  assert.ok(upstreamFetch > accountDispatch, 'Apps Script forwarding must happen after authorization/account dispatch.');
  assert.match(authorizationPolicy, /user && user\.role === 'shareholder' && !SHAREHOLDER_ACTIONS\.has\(action\)/);
  assert.match(authorizationPolicy, /throw httpError\(403, 'Tài khoản cổ đông chỉ có quyền xem dữ liệu\.'\)/);
  assert.match(appsScriptClient, /await fetchImpl\(url/);
});

test('account administration remains admin-only while own-password change remains available', () => {
  const handler = read('server/services/account-service.js');

  const ownPasswordBranch = handler.indexOf("action === 'changeOwnPassword'");
  const adminGuard = handler.indexOf('assertAdmin(user);', ownPasswordBranch);
  assert.ok(ownPasswordBranch >= 0 && adminGuard > ownPasswordBranch, 'Own-password branch must execute before the admin guard.');

  for (const action of ['listUsers', 'createUser', 'updateUser', 'resetUserPassword']) {
    const branch = handler.indexOf(`action === '${action}'`);
    assert.ok(branch > adminGuard, `${action} must remain behind assertAdmin(user).`);
  }
});

test('proxy authenticates every action except health and forwards only after proxy-secret injection', () => {
  const proxy = read('api/app.js');
  const authService = read('server/services/auth-service.js');
  const appsScriptClient = read('server/services/apps-script-client.js');
  const authorizationPolicy = read('server/services/authorization-policy.js');
  assert.match(proxy, /if \(action !== 'health'\) user = await getAuthenticatedUser\(req, config\);/);
  assert.match(authService, /Vui lòng đăng nhập để tiếp tục/);
  assert.match(proxy, /proxySecret: config\.proxySecret/);
  assert.match(proxy, /requestUser: user/);
  assert.match(proxy, /method: req\.method/);
  assert.match(appsScriptClient, /Buffer\.byteLength\(payload, 'utf8'\) > maxBodyBytes/);
  assert.match(authorizationPolicy, /if \(user && user\.role === 'shareholder'/);
});

test('Apps Script continues to enforce the proxy secret at both Router and invokeApi boundaries', () => {
  const router = read('Router.gs');
  const publicApi = read('PublicApi.gs');
  const security = read('SecurityService.gs');

  assert.match(router, /SecurityService\.assertProxyRequest\(action, e\.parameter\.proxySecret\)/);
  assert.match(router, /SecurityService\.assertProxyRequest\(action, payload\.proxySecret\)/);
  assert.match(publicApi, /SecurityService\.assertProxyRequest\(action, safeBody\.proxySecret \|\| safeParams\.proxySecret\)/);
  assert.match(security, /AUTH_ENFORCEMENT_ENABLED/);
  assert.match(security, /APP_PROXY_SECRET/);
});
