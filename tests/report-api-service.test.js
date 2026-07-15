const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReportBundleRepository } = require('../server/repositories/report-bundle-repository');
const { createReportService } = require('../server/services/report-service');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const httpError = (status, message) => Object.assign(new Error(message), { status });

test('Report repository reads one exact month/workbook bundle with server credentials', async () => {
  let request;
  const repository = createReportBundleRepository({ httpError, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => [{ spreadsheet_id: 'sheet-1', report_month: '07/2026', payload: { ok: true }, synced_at: 'now' }] };
  }});
  const row = await repository.findLatest({ supabaseUrl: 'https://db.example', serviceRoleKey: 'server-secret' }, '07/2026', 'sheet-1');
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('report_month'), 'eq.07/2026');
  assert.equal(url.searchParams.get('spreadsheet_id'), 'eq.sheet-1');
  assert.equal(request.options.headers.Authorization, 'Bearer server-secret');
  assert.deepEqual(row.payload, { ok: true });
});

test('Report repository resolves latest from the newest synced workbook report bundle', async () => {
  let request;
  const repository = createReportBundleRepository({ httpError, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => [{ spreadsheet_id: 'sheet-1', report_month: '07/2026', payload: { ok: true }, synced_at: 'now' }] };
  }});
  await repository.findLatest({ supabaseUrl: 'https://db.example', serviceRoleKey: 'server-secret' }, 'latest', 'sheet-1');
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('report_month'), 'neq.__dashboard_latest__');
  assert.equal(url.searchParams.get('order'), 'synced_at.desc');
  assert.equal(url.searchParams.get('spreadsheet_id'), 'eq.sheet-1');
});

test('Report API serves cached bundle and does not call Apps Script', async () => {
  let forwarded = 0; let response;
  const service = createReportService({
    reportBundleRepository: { findLatest: async () => ({ payload: { ok: true, month: '07/2026' }, synced_at: 'now' }) },
    appsScriptClient: { forward: async () => { forwarded += 1; } }, httpError,
    send: (_res, status, body) => { response = { status, body }; return response; }
  });
  await service.handle('getReportBundle', { method: 'GET', query: { month: '07/2026', spreadsheetId: 'sheet-1' } }, {}, {}, { id: 'u1' });
  assert.equal(forwarded, 0); assert.equal(response.status, 200); assert.equal(response.body.apiCached, true);
});

test('Report API force refresh and cache miss fall back to Apps Script compatibility', async () => {
  let reads = 0; let forwards = 0;
  const service = createReportService({
    reportBundleRepository: { findLatest: async () => { reads += 1; return null; } },
    appsScriptClient: { forward: async () => { forwards += 1; return { status: 200, body: { ok: true, source: 'apps-script' } }; } },
    httpError, send: (_res, status, body) => ({ status, body })
  });
  await service.handle('getReportBundle', { method: 'GET', query: { month: '07/2026' } }, {}, { appsScriptUrl:'x', proxySecret:'s' }, { id:'u1' });
  await service.handle('getReportBundle', { method: 'GET', query: { month: '07/2026', forceRefresh:'true' } }, {}, { appsScriptUrl:'x', proxySecret:'s' }, { id:'u1' });
  assert.equal(reads, 1); assert.equal(forwards, 2);
});

test('Report, Dashboard, Entry and Manage use independent Next module boundaries', () => {
  assert.match(read('next-shell/lib/report-server.ts'), /getReportBundle/);
  assert.match(read('next-shell/lib/dashboard-server.ts'), /getDashboard/);
  assert.match(read('next-shell/components/entry/EntryModule.tsx'), /submitRows/);
  assert.match(read('next-shell/lib/manage-server.ts'), /readManageData/);
});
