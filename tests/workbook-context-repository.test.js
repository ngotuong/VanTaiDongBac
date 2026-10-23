const assert = require('node:assert/strict');
const test = require('node:test');
const { createWorkbookContextRepository } = require('../server/repositories/workbook-context-repository');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const config = { supabaseUrl: 'https://isolated.invalid', serviceRoleKey: 'server-secret' };

test('workbook registry is read only with service-role credentials and exact columns', async () => {
  let request;
  const repository = createWorkbookContextRepository({ httpError, fetchImpl: async (url, init) => {
    request = { url, init };
    return { ok: true, async json() { return [{ year: '2027', lifecycle_status: 'ready' }]; } };
  }});
  assert.equal((await repository.list(config))[0].year, '2027');
  assert.match(request.url, /workbook_contexts\?select=year,transport_spreadsheet_id,cashflow_spreadsheet_id/);
  assert.equal(request.init.headers.Authorization, 'Bearer server-secret');
});

test('missing migration 020 falls back cleanly but other registry failures do not', async () => {
  const missing = createWorkbookContextRepository({ httpError, fetchImpl: async () => ({
    ok: false, status: 404, async json() { return { message: "Could not find the table 'public.workbook_contexts' in the schema cache" }; }
  }) });
  assert.deepEqual(await missing.list(config), []);
  const failed = createWorkbookContextRepository({ httpError, fetchImpl: async () => ({
    ok: false, status: 503, async json() { return { message: 'database unavailable' }; }
  }) });
  await assert.rejects(() => failed.list(config), { status: 503 });
});
