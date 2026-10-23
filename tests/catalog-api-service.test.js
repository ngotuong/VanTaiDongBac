const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCatalogService } = require('../server/services/catalog-service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const httpError = (status, message) => Object.assign(new Error(message), { status });
const workbookContextService = { resolve: ({ module, year }) => ({ module, year: year || '2026', spreadsheetId: 'transport-2026' }) };

test('Catalog API serves one exact Supabase bundle without forwarding to Apps Script', async () => {
  let forwarded = 0;
  let response;
  const service = createCatalogService({
    catalogBundleRepository: {
      find: async (_config, key) => {
        assert.equal(key, 'transport:2026:catalogs:all');
        return { payload: { activeVehicles: [{ plate: '20H05602' }] }, synced_at: '2026-07-22T12:00:00Z' };
      }
    },
    appsScriptClient: { forward: async () => { forwarded += 1; } },
    workbookContextService,
    httpError,
    send: (_res, status, body) => { response = { status, body }; return response; }
  });

  await service.handle('getCatalogs', { method: 'GET', query: { formType: '' } }, {}, {}, { id: 'u1' });
  assert.equal(forwarded, 0);
  assert.equal(response.status, 200);
  assert.equal(response.body.supabaseCached, true);
  assert.equal(response.body.activeVehicles[0].plate, '20H05602');
});

test('Catalog API fails closed on an ordinary cache miss and only forwards an explicit force refresh', async () => {
  let reads = 0;
  let forwards = 0;
  const service = createCatalogService({
    catalogBundleRepository: { find: async () => { reads += 1; return null; } },
    appsScriptClient: { forward: async () => { forwards += 1; return { status: 200, body: { projects: [] } }; } },
    workbookContextService,
    httpError,
    send: (_res, status, body) => ({ status, body })
  });

  await assert.rejects(
    () => service.handle('getCatalogs', { method: 'GET', query: { formType: 'vanChuyen' } }, {}, { appsScriptUrl: 'x' }, { id: 'u1' }),
    (error) => error.status === 503
  );
  await service.handle('getCatalogs', { method: 'GET', query: { formType: 'dau', forceRefresh: 'true' } }, {}, { appsScriptUrl: 'x' }, { id: 'u1' });
  await assert.rejects(() => service.handle('getCatalogs', { method: 'GET', query: { formType: 'unknown' } }, {}, {}, { id: 'u1' }), /Loại biểu mẫu không hợp lệ/);
  assert.equal(reads, 1);
  assert.equal(forwards, 1);
});

test('Proxy wires getCatalogs through the Supabase cache service before generic forwarding', () => {
  const proxy = read('api/app.js');
  assert.match(proxy, /createCatalogBundleRepository/);
  assert.match(proxy, /catalogService\.handles\(action\)/);
  assert.match(proxy, /catalogService\.handle\(action, req, res, config, user\)/);
});
