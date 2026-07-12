const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const scriptSource = read('client_api_transport.html').replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

function loadTransport(overrides = {}) {
  const context = vm.createContext({
    URL,
    Date: { now: () => 123456 },
    window: {
      __DEFAULT_APP_SERVICE_URL: 'https://script.google.com/macros/s/deployment/exec?old=1#hash',
      __APP_SERVICE_URL: '',
      location: { origin: 'https://dongbac.vercel.app' }
    },
    isAuthEnabled: () => true,
    getSupabaseAccessToken: () => Promise.resolve('access-token'),
    getSupabaseClient: () => null,
    showAuthGate: () => {},
    sessionStorage: { clear: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    ...overrides
  });
  new vm.Script(scriptSource, { filename: 'client_api_transport.html' }).runInContext(context);
  return context;
}

test('frontend transport normalizes configured URLs and selects proxy only for static authenticated runtime', () => {
  const transport = loadTransport();
  assert.equal(transport.normalizeWebAppUrl('https://example.com/exec?a=1#x'), 'https://example.com/exec');
  assert.equal(transport.normalizeWebAppUrl('not a url'), '');
  assert.equal(vm.runInContext('getBackendUrl()', transport), 'https://script.google.com/macros/s/deployment/exec');
  assert.equal(transport.getBackendUrlSource(), 'default');
  assert.equal(transport.getApiEndpoint(), '/api/app');

  transport.window.__APP_SERVICE_URL = 'https://custom.example/exec?x=1';
  assert.equal(vm.runInContext('getBackendUrl()', transport), 'https://custom.example/exec');
  assert.equal(transport.getBackendUrlSource(), 'app');
});

test('frontend fetch transport preserves query, cache-buster, proxy headers, and POST envelope', async () => {
  let request;
  const transport = loadTransport({
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ ok: true, value: 7 }) };
    }
  });
  const result = await transport.callFetchApi('POST', 'saveSheetRow', { forceRefresh: 'true', row: 2 }, { sheetName: 'NL_Test' });
  assert.equal(result.value, 7);
  const url = new URL(request.url);
  assert.equal(url.pathname, '/api/app');
  assert.equal(url.searchParams.get('action'), 'saveSheetRow');
  assert.equal(url.searchParams.get('forceRefresh'), 'true');
  assert.equal(url.searchParams.get('row'), '2');
  assert.equal(url.searchParams.get('_ts'), '123456');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json;charset=UTF-8');
  assert.equal(request.options.headers.Authorization, 'Bearer access-token');
  assert.equal(request.options.body, JSON.stringify({ action: 'saveSheetRow', sheetName: 'NL_Test' }));
});

test('frontend fetch transport preserves 401 sign-out, storage clear, auth gate, and error text', async () => {
  let signedOut = 0;
  let cleared = 0;
  let gateMessage = '';
  const transport = loadTransport({
    fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: 'Phiên hết hạn.' }) }),
    getSupabaseClient: () => ({ auth: { signOut: async () => { signedOut += 1; } } }),
    sessionStorage: { clear: () => { cleared += 1; } },
    showAuthGate: (message) => { gateMessage = message; }
  });
  await assert.rejects(() => transport.callFetchApi('GET', 'getDashboard'), { message: 'Phiên hết hạn.' });
  assert.equal(signedOut, 1);
  assert.equal(cleared, 1);
  assert.equal(gateMessage, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
});

test('frontend fetch transport preserves business errors and direct Apps Script network fallback', async () => {
  const business = loadTransport({
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'Nghiệp vụ lỗi.' }) })
  });
  await assert.rejects(() => business.callFetchApi('GET', 'getDashboard'), { message: 'Nghiệp vụ lỗi.' });

  const direct = loadTransport({
    isAuthEnabled: () => false,
    getSupabaseAccessToken: () => Promise.resolve(''),
    fetch: async () => { throw new Error('Failed to fetch'); }
  });
  const fallback = await direct.callFetchApi('POST', 'saveSheetRow', {}, { rowIndex: 2 });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.warnings.length, 1);
  await assert.rejects(() => direct.callFetchApi('POST', 'submitRows', {}, { rows: [{}] }), { message: 'Failed to fetch' });
});

test('frontend Apps Script adapter preserves invokeApi payload and success/business/failure mapping', async () => {
  let successHandler;
  let failureHandler;
  let invoked;
  const runner = {
    withSuccessHandler(handler) { successHandler = handler; return this; },
    withFailureHandler(handler) { failureHandler = handler; return this; },
    invokeApi(...args) { invoked = args; successHandler({ ok: true, value: 1 }); }
  };
  const transport = loadTransport({ google: { script: { run: runner } } });
  assert.deepEqual(await transport.callApi('post', 'saveSheetRow', { one: 1 }, { two: 2 }), { ok: true, value: 1 });
  assert.deepEqual(invoked, ['POST', 'saveSheetRow', { one: 1 }, { two: 2 }]);

  runner.invokeApi = () => successHandler({ ok: false, error: 'Business failed' });
  await assert.rejects(() => transport.callAppsScriptAction('GET', 'health'), { message: 'Business failed' });
  runner.invokeApi = () => failureHandler({ message: 'Runtime failed' });
  await assert.rejects(() => transport.callAppsScriptAction('GET', 'health'), { message: 'Runtime failed' });
});

test('client_api_transport is loaded before config/API and uniquely owns transport globals', () => {
  for (const file of ['index.template.html', 'client.html']) {
    const source = read(file);
    assert.ok(source.indexOf("include('client_api_transport')") < source.indexOf("include('client_config')"));
    assert.ok(source.indexOf("include('client_api_transport')") < source.indexOf("include('client_api')"));
  }
  const fragments = fs.readdirSync(root).filter((name) => /^client_.*\.html$/.test(name));
  for (const functionName of ['hasAppsScriptRuntime', 'normalizeWebAppUrl', 'getApiEndpoint', 'callAppsScriptAction', 'callFetchApi', 'callApi', 'buildFetchPostFallbackResult_']) {
    const owners = fragments.filter((file) => new RegExp(`function ${functionName.replace('_', '\\_')}\\s*\\(`).test(read(file)));
    assert.deepEqual(owners, ['client_api_transport.html'], `${functionName} must have one frontend owner`);
  }
});
