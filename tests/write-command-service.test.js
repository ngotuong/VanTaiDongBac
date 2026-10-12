const assert = require('node:assert/strict');
const test = require('node:test');
const { createWriteCommandService, FUND_ACTIONS, TRANSPORT_ACTIONS } = require('../server/services/write-command-service');
const { createWriteJobRepository } = require('../server/repositories/write-job-repository');

const httpError = (status, message) => Object.assign(new Error(message), { status });

test('write command service queues every business form mutation without calling Apps Script', async () => {
  const calls = [];
  const service = createWriteCommandService({
    repository: { enqueue: async (_config, value) => { calls.push(value); return { ok: true, queued: true, jobId: 'job-1', status: 'pending' }; } },
    workbookContextService: { resolve: ({ module, year }) => ({ module, year, spreadsheetId: `${module}-${year}` }) },
    httpError,
    send: (_res, status, body) => ({ status, body })
  });
  for (const action of [...TRANSPORT_ACTIONS, ...FUND_ACTIONS]) assert.equal(service.handles(action), true);
  const response = await service.handle('updateFundTransaction', { method: 'POST', body: { year: '2026', rowIndex: 7, transaction: { amount: '1000', expectedTransaction: { voucher: 'V1', date: '2026-09-01', type: 'Chi', category: 'Dầu', amount: 1000 } }, clientRequestId: 'request-1' } }, {}, {});
  assert.equal(response.status, 202);
  assert.deepEqual(calls[0], { moduleName: 'fund', action: 'updateFundTransaction', payload: { year: '2026', spreadsheetId: 'cashflow-2026', rowIndex: 7, transaction: { amount: '1000', expectedTransaction: { voucher: 'V1', date: '2026-09-01', type: 'Chi', category: 'Dầu', amount: 1000 } } }, idempotencyKey: 'updateFundTransaction:request-1' });
});

test('write job repository uses a deterministic id and returns an existing job on retry', async () => {
  const requests = [];
  const existing = { id: 'web-existing', module: 'transport', action: 'submitRows', status: 'pending', payload: { rows: [] }, result: null, idempotency_key: 'same-request', last_error: '' };
  const repository = createWriteJobRepository({
    httpError,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      return { ok: true, status: 200, json: async () => requests.length === 1 ? [] : requests.length === 2 ? [{ ...existing, id: JSON.parse(options.body).id }] : [] };
    }
  });
  const queued = await repository.enqueue({ supabaseUrl: 'https://cache.test', serviceRoleKey: 'secret' }, { moduleName: 'transport', action: 'submitRows', payload: { rows: [] }, idempotencyKey: 'same-request' });
  assert.match(queued.jobId, /^web-[a-f0-9]{40}$/);
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer secret');
});

test('oil payment source is optional in UI and remains an optional Sheet value', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const entry = fs.readFileSync(path.join(root, 'next-shell/components/entry/EntryModule.tsx'), 'utf8');
  const validation = fs.readFileSync(path.join(root, 'ValidationService.gs'), 'utf8');
  assert.match(entry, /\['sourcePay', 'Nguồn chi', 'fuelPaymentSources', false\]/);
  assert.match(validation, /clean_\(row\.sourcePay\)/);
  assert.doesNotMatch(validation, /requireText_\(row\.sourcePay/);
});
