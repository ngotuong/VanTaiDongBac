const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/baseline-characterization.json'));
const sorted = (values) => [...values].sort();

function loadRegistry() {
  const sandbox = vm.createContext({});
  new vm.Script(read('ApiActionRegistry.gs')).runInContext(sandbox);
  return sandbox.ApiActionRegistry;
}

test('registry public GET/POST surfaces exactly match the characterized API', () => {
  const rows = loadRegistry().list().map((row) => JSON.parse(JSON.stringify(row)));
  const publicRows = rows.filter((row) => !row.routerOnly && !row.proxyLocal);
  assert.deepEqual(sorted(publicRows.filter((row) => row.method === 'GET').map((row) => row.action)), sorted(baseline.publicApi.getActions));
  assert.deepEqual(sorted(publicRows.filter((row) => row.method === 'POST').map((row) => row.action)), sorted(baseline.publicApi.postActions));
  assert.deepEqual(sorted(rows.filter((row) => row.routerOnly && !row.disabled).map((row) => row.action)), sorted(baseline.publicApi.routerOnlyActions));
  assert.deepEqual(sorted(rows.filter((row) => row.disabled).map((row) => row.action)), sorted(baseline.publicApi.disabledActions));
});

test('registry proxy-local and shareholder permission metadata match the proxy baseline', () => {
  const rows = loadRegistry().list().map((row) => JSON.parse(JSON.stringify(row)));
  assert.deepEqual(sorted(rows.filter((row) => row.proxyLocal).map((row) => row.action)), sorted([...baseline.proxy.localAccountActions, ...baseline.proxy.localFoundationActions]));
  assert.deepEqual(sorted(rows.filter((row) => row.permission === 'shareholder').map((row) => row.action)), sorted(baseline.proxy.shareholderActions));
  assert.deepEqual(sorted(rows.filter((row) => row.proxyLocal && row.permission === 'admin').map((row) => row.action)),
    ['createUser', 'deleteUser', 'listUsers', 'resetUserPassword', 'updateUser']);
});

test('registry classifies read-only POST and operational GET without weakening permissions', () => {
  const registry = loadRegistry();
  assert.deepEqual(JSON.parse(JSON.stringify(registry.get('checkTripReconciliation'))), { method: 'POST', kind: 'query', permission: 'shareholder' });
  assert.deepEqual(JSON.parse(JSON.stringify(registry.get('invalidateCaches'))), { method: 'GET', kind: 'command', permission: 'adminOperator' });
  assert.equal(registry.get('addFundTransactions').kind, 'command');
  assert.equal(registry.get('getFundCatalog').permission, 'adminOperator');
});

test('registry preserves invalid method/action messages and method separation', () => {
  const registry = loadRegistry();
  assert.throws(() => registry.assertPublicAction('PATCH', 'health'), /Phương thức không hợp lệ: PATCH/);
  assert.throws(() => registry.assertPublicAction('GET', 'submitRows'), /Hành động GET không hợp lệ: submitRows/);
  assert.throws(() => registry.assertPublicAction('POST', 'getDashboard'), /Hành động POST không hợp lệ: getDashboard/);
  assert.throws(() => registry.assertPublicAction('GET', 'debugSheet'), /Hành động GET không hợp lệ: debugSheet/);
  assert.doesNotThrow(() => registry.assertRouterGetAction('debugSheet'));
  assert.doesNotThrow(() => registry.assertRouterGetAction('submitRowsGet'));
});

test('dispatchers consume registry guards while retaining compatibility handlers and proxy enforcement order', () => {
  const publicApi = read('PublicApi.gs');
  const router = read('Router.gs');
  const proxy = read('api/app.js');
  const policy = read('server/services/authorization-policy.js');
  assert.match(publicApi, /ApiActionRegistry\.assertPublicAction\(normalizedMethod, action\)/);
  assert.match(publicApi, /if \(action === 'getDashboard'\)/);
  assert.match(publicApi, /if \(action === 'addFundTransactions'\)/);
  assert.match(router, /SecurityService\.assertProxyRequest[\s\S]*ApiActionRegistry\.assertRouterGetAction\(action\)/);
  assert.match(proxy, /assertAuthorized\(user, action\);/);
  assert.match(policy, /SHAREHOLDER_ACTIONS\.has\(action\)/);
});
