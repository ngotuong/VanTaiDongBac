const assert = require('node:assert/strict');
const test = require('node:test');
const { createAppsScriptClient } = require('../server/services/apps-script-client');

const request = { url: 'https://script.example/exec', action: 'getDashboard', method: 'GET', params: { month: '2026-07' }, body: {}, proxySecret: 'secret', requestUser: { id: 'u1', role: 'admin' } };

test('AppsScriptClient preserves POST envelope, headers, redirect, and successful response mapping', async () => {
  const calls = [];
  const client = createAppsScriptClient({ fetchImpl: async (...args) => {
    calls.push(args);
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, value: 7 }) };
  } });
  assert.deepEqual(await client.forward(request), { status: 200, body: { ok: true, value: 7 } });
  assert.equal(calls[0][0], request.url);
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].redirect, 'follow');
  assert.deepEqual(calls[0][1].headers, { 'Content-Type': 'text/plain;charset=UTF-8' });
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    action: 'getDashboard', method: 'GET', params: { month: '2026-07' }, body: {}, proxySecret: 'secret', requestUser: { id: 'u1', role: 'admin' }
  });
});

test('AppsScriptClient preserves business-error HTTP 400 mapping', async () => {
  const client = createAppsScriptClient({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'invalid action' }) }) });
  assert.deepEqual(await client.forward(request), { status: 400, body: { ok: false, error: 'invalid action' } });
});

test('AppsScriptClient preserves payload limit without making an upstream request', async () => {
  let calls = 0;
  const client = createAppsScriptClient({ maxBodyBytes: 10, fetchImpl: async () => { calls += 1; } });
  assert.deepEqual(await client.forward(request), { status: 413, body: { ok: false, error: 'Payload quá lớn.' } });
  assert.equal(calls, 0);
});

test('AppsScriptClient preserves upstream non-2xx and invalid JSON error mapping', async () => {
  const non2xx = createAppsScriptClient({ fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'down' }) });
  assert.deepEqual(await non2xx.forward(request), { status: 502, body: { ok: false, error: 'Apps Script trả status 503.' } });
  const invalid = createAppsScriptClient({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>' }) });
  assert.deepEqual(await invalid.forward(request), { status: 502, body: { ok: false, error: 'Apps Script trả dữ liệu không hợp lệ.' } });
});

test('AppsScriptClient does not log or expose proxy secret in mapped errors', async () => {
  const client = createAppsScriptClient({ fetchImpl: async () => ({ ok: false, status: 500, text: async () => request.proxySecret }) });
  const result = await client.forward(request);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
