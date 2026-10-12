const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const identity = require('../config/environment-identity.json');

function handlerFor(t, role, downstreamStatus = 200) {
  const config = {
    supabaseUrl: `https://${identity.supabase.projectRef}.supabase.co`,
    anonKey: 'isolated-anon', serviceRoleKey: 'isolated-service', proxySecret: 'isolated-proxy',
    appsScriptUrl: `https://script.google.com/macros/s/${identity.appsScript.previewDeploymentId}/exec`
  };
  t.mock.method(global, 'fetch', async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'qa-user' });
    if (String(url).includes('/rest/v1/app_users?')) return Response.json([{ user_id: 'qa-user', username: 'qa', role, active: true }]);
    return Response.json({ message: 'Isolated repository unavailable' }, { status: downstreamStatus });
  });
  const filename = path.resolve(__dirname, '../api/app.js');
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  const workbookModule = realRequire('../server/services/workbook-context-service');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, require: (name) => {
      if (name === '../server/runtime-config') return { runtimeConfig: () => config };
      if (name === '../server/services/workbook-context-service') return {
        createWorkbookContextService: (options) => workbookModule.createWorkbookContextService({ ...options, env: {
          DEFAULT_WORKBOOK_YEAR: '2026', WORKBOOK_CONTEXTS_JSON: JSON.stringify({ 2026: { transport: 'isolated-workbook' } })
        } })
      };
      return realRequire(name);
    },
    fetch: global.fetch, AbortSignal
  }, { filename });
  return module.exports;
}

async function call(handler, action, query = {}) {
  let result;
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { result = { status: this.statusCode, headers: this.headers, body: JSON.parse(body) }; } };
  await handler({ method: 'GET', query: { action, ...query }, headers: { authorization: 'Bearer isolated-user-token' } }, res);
  return result;
}

test('operator account admin denial is HTTP 403 JSON at the actual API entrypoint', async (t) => {
  const result = await call(handlerFor(t, 'operator'), 'listUsers');
  assert.equal(result.status, 403);
  assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.ok, false);
  assert.match(result.body.error, /Chỉ quản trị viên/);
});

test('delegated payroll validation is HTTP 400 JSON rather than an unhandled rejection', async (t) => {
  const result = await call(handlerFor(t, 'operator'), 'getPayrollExplanation', { month: 'invalid', employee: 'QA', year: '2026' });
  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.match(result.body.error, /MM\/YYYY/);
});

test('delegated payroll repository failure preserves its HTTP error envelope', async (t) => {
  const result = await call(handlerFor(t, 'operator', 503), 'getPayrollExplanation', { month: '10/2026', employee: 'QA', year: '2026' });
  assert.equal(result.status, 502);
  assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(result.body.ok, false);
  assert.match(result.body.error, /cache bảo mật/);
});
