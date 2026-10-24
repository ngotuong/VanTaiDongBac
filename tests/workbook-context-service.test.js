const assert = require('node:assert/strict');
const test = require('node:test');
const { createWorkbookContextService } = require('../server/services/workbook-context-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const env = {
  DEFAULT_WORKBOOK_YEAR: '2026',
  WORKBOOK_CONTEXTS_JSON: JSON.stringify({
    2025: { transport: 'transport-2025', cashflow: 'cashflow-2025' },
    2026: { transport: 'transport-2026', cashflow: 'cashflow-2026' }
  })
};

test('workbook context resolves an exact server allowlist entry', () => {
  const service = createWorkbookContextService({ env, httpError });
  assert.deepEqual(service.resolve({ module: 'transport', year: '2026' }), { module: 'transport', year: '2026', spreadsheetId: 'transport-2026', activeYear: '2026', availableYears: ['2026', '2025'], readOnly: false });
  assert.deepEqual(service.resolve({ module: 'cashflow' }), { module: 'cashflow', year: '2026', spreadsheetId: 'cashflow-2026', activeYear: '2026', availableYears: ['2026', '2025'], readOnly: false });
  assert.deepEqual(service.publicContext({ module: 'transport' }), { module: 'transport', year: '2026', activeYear: '2026', availableYears: ['2026', '2025'], readOnly: false });
  assert.deepEqual(service.resolve({ module: 'transport', year: '2025' }), { module: 'transport', year: '2025', spreadsheetId: 'transport-2025', activeYear: '2026', availableYears: ['2026', '2025'], readOnly: true });
  assert.throws(() => service.assertWritable({ module: 'transport', year: '2025' }), { status: 409 });
});

test('workbook context never guesses latest bundle or accepts arbitrary ids', () => {
  const service = createWorkbookContextService({ env, httpError });
  assert.throws(() => service.resolve({ module: 'transport', year: '2027', spreadsheetId: 'attacker-id' }), { status: 404 });
  assert.throws(() => service.resolve({ module: 'unknown', year: '2026' }), { status: 400 });
  assert.throws(() => createWorkbookContextService({ env: {}, httpError }).resolve({ module: 'transport' }), { status: 503 });
});

test('dynamic server-only registry overrides the active year while excluding draft pairs', async () => {
  const rows = [
    { year: '2027', transport_spreadsheet_id: 'transport-2027', cashflow_spreadsheet_id: 'cashflow-2027', lifecycle_status: 'active' },
    { year: '2026', transport_spreadsheet_id: 'transport-2026-db', cashflow_spreadsheet_id: 'cashflow-2026-db', lifecycle_status: 'archived' },
    { year: '2028', transport_spreadsheet_id: 'transport-2028-draft', cashflow_spreadsheet_id: 'cashflow-2028-draft', lifecycle_status: 'draft' }
  ];
  const service = createWorkbookContextService({
    env: {}, httpError,
    config: { supabaseUrl: 'https://isolated.invalid', serviceRoleKey: 'server-only' },
    repository: { async list() { return rows; } }
  });
  assert.deepEqual(await service.resolveAsync({ module: 'transport' }), {
    module: 'transport', year: '2027', spreadsheetId: 'transport-2027',
    activeYear: '2027', availableYears: ['2027', '2026'], readOnly: false
  });
  assert.deepEqual(await service.publicContextAsync({ module: 'cashflow', year: '2026' }), {
    module: 'cashflow', year: '2026', activeYear: '2027', availableYears: ['2027', '2026'], readOnly: true
  });
  await assert.rejects(() => service.resolveAsync({ module: 'transport', year: '2028' }), { status: 404 });
});

test('dynamic registry preserves the exact Vercel allowlist before migration 020 exists', async () => {
  const service = createWorkbookContextService({
    env, httpError,
    config: { supabaseUrl: 'https://isolated.invalid', serviceRoleKey: 'server-only' },
    repository: { async list() { return []; } }
  });
  assert.equal((await service.resolveAsync({ module: 'transport' })).spreadsheetId, 'transport-2026');
});

test('ready future workbook remains available to internal rollover services but stays out of public year selection', async () => {
  const rows = [
    { year: '2027', transport_spreadsheet_id: 'transport-2027', cashflow_spreadsheet_id: 'cashflow-2027', lifecycle_status: 'ready' },
    { year: '2026', transport_spreadsheet_id: 'transport-2026', cashflow_spreadsheet_id: 'cashflow-2026', lifecycle_status: 'active' }
  ];
  const service = createWorkbookContextService({
    env: {}, httpError,
    config: { supabaseUrl: 'https://isolated.invalid', serviceRoleKey: 'server-only' },
    repository: { async list() { return rows; } }
  });
  const internal = await service.resolveAsync({ module: 'transport', year: '2027' });
  assert.equal(internal.spreadsheetId, 'transport-2027');
  assert.deepEqual(internal.availableYears, ['2026']);
  await assert.rejects(service.resolvePublicAsync({ module: 'transport', year: '2027' }), { status: 404 });
  assert.deepEqual((await service.publicContextAsync({ module: 'transport' })).availableYears, ['2026']);
});
