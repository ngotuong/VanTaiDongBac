const assert = require('node:assert/strict');
const test = require('node:test');
const { createWorkbookContextService } = require('../api/services/workbook-context-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const env = {
  DEFAULT_WORKBOOK_YEAR: '2026',
  WORKBOOK_CONTEXTS_JSON: JSON.stringify({ 2026: { transport: 'transport-2026', cashflow: 'cashflow-2026' } })
};

test('workbook context resolves an exact server allowlist entry', () => {
  const service = createWorkbookContextService({ env, httpError });
  assert.deepEqual(service.resolve({ module: 'transport', year: '2026' }), { module: 'transport', year: '2026', spreadsheetId: 'transport-2026' });
  assert.deepEqual(service.resolve({ module: 'cashflow' }), { module: 'cashflow', year: '2026', spreadsheetId: 'cashflow-2026' });
  assert.deepEqual(service.publicContext({ module: 'transport' }), { module: 'transport', year: '2026' });
});

test('workbook context never guesses latest bundle or accepts arbitrary ids', () => {
  const service = createWorkbookContextService({ env, httpError });
  assert.throws(() => service.resolve({ module: 'transport', year: '2027', spreadsheetId: 'attacker-id' }), { status: 404 });
  assert.throws(() => service.resolve({ module: 'unknown', year: '2026' }), { status: 400 });
  assert.throws(() => createWorkbookContextService({ env: {}, httpError }).resolve({ module: 'transport' }), { status: 400 });
});
