const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createWriteJobRepository } = require('../server/repositories/write-job-repository');
const httpError = (status, message) => Object.assign(new Error(message), { status });

test('lost acknowledgement after durable enqueue retries the same job, while a confirmed new submission gets a new job', async () => {
  const { createRetrySafeWriteClient } = await import('../next-shell/lib/platform/retry-safe-write-client.ts');
  const rows = new Map();
  let inserts = 0;
  const repository = createWriteJobRepository({ httpError, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    let body = [];
    if (url.pathname.endsWith('/write_jobs')) {
      if (options.method === 'POST') {
        const row = JSON.parse(options.body);
        rows.set(row.id, row); inserts++; body = [row];
      } else {
        const row = rows.get(url.searchParams.get('id').slice(3));
        body = row ? [row] : [];
      }
    }
    return { ok: true, json: async () => body };
  } });
  let dropResponse = true;
  let sequence = 0;
  const api = createRetrySafeWriteClient({ async post(action, options) {
    const { clientRequestId, ...payload } = options.body;
    const result = await repository.enqueue({ supabaseUrl: 'https://isolated.invalid', serviceRoleKey: 'synthetic' }, {
      moduleName: 'transport', action, payload, idempotencyKey: `${action}:${clientRequestId}`
    });
    if (dropResponse) { dropResponse = false; throw new Error('Lost acknowledgement'); }
    return result;
  } }, () => `synthetic-${++sequence}`);
  const request = { body: { year: '2026', formType: 'vanChuyen', rows: [{ vehicle: 'SYNTHETIC', trips: '1' }] } };
  await assert.rejects(api.post('submitRows', request), /Lost acknowledgement/);
  const retry = await api.post('submitRows', request);
  assert.equal(retry.duplicateRequest, true);
  assert.equal(inserts, 1);
  const intentionalNew = await api.post('submitRows', request);
  assert.notEqual(intentionalNew.jobId, retry.jobId);
  assert.equal(inserts, 2);
});

test('unacknowledged intents survive intermediate edits and retain separate action/year identities', async () => {
  const { createRetrySafeWriteClient } = await import('../next-shell/lib/platform/retry-safe-write-client.ts');
  const keys = [];
  let sequence = 0;
  const api = createRetrySafeWriteClient({ async post(_action, options) {
    keys.push(options.body.clientRequestId);
    throw new Error('Offline');
  } }, () => `key-${++sequence}`);
  for (const [action, body] of [
    ['saveSheetRow', { year: '2026', rowData: { a: 1, b: 2 } }],
    ['saveSheetRow', { year: '2026', rowData: { a: 3, b: 2 } }],
    ['saveSheetRow', { rowData: { b: 2, a: 1 }, year: '2026' }],
    ['deleteSheetRow', { year: '2026', rowData: { a: 1, b: 2 } }],
    ['saveSheetRow', { year: '2027', rowData: { a: 1, b: 2 } }]
  ]) await assert.rejects(api.post(action, { body }), /Offline/);
  assert.deepEqual(keys, ['key-1', 'key-2', 'key-1', 'key-3', 'key-4']);
});

test('malformed success without a job id retains the unresolved request key', async () => {
  const { createRetrySafeWriteClient } = await import('../next-shell/lib/platform/retry-safe-write-client.ts');
  const ids = [];
  let sequence = 0;
  const api = createRetrySafeWriteClient({ async post(_action, options) { ids.push(options.body.clientRequestId); return { ok: true }; } }, () => `key-${++sequence}`);
  for (let index = 0; index < 2; index++) await assert.rejects(api.post('submitRows', { body: { rows: [] } }), /Chưa xác nhận/);
  assert.deepEqual(ids, ['key-1', 'key-1']);
});

test('Business modules scope unresolved intents to the signed-in user and workbook', () => {
  for (const file of ['entry/EntryModule.tsx', 'manage/ManageReadOnlyModule.tsx', 'catalog/CatalogModule.tsx', 'cashflow/CashflowModule.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '../next-shell/components', file), 'utf8');
    assert.match(source, /createRetrySafeWriteClient\(api, undefined, \{ userId: context\.user\.id, year(?:: context\.workbook\.year)? \}\)/);
    assert.match(source, /writeApi\.post</);
    assert.doesNotMatch(source, /clientRequestId:.*crypto\.randomUUID/);
  }
});

test('reloading the same tab replays an unresolved key without storing the payload', async () => {
  const { createRetrySafeWriteClient } = await import('../next-shell/lib/platform/retry-safe-write-client.ts');
  const values = new Map();
  globalThis.window = { sessionStorage: {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  } };
  try {
    const options = { body: { year: '2026', rows: [{ vehicle: 'SYNTHETIC', trips: '1' }] } };
    const scope = { userId: 'user-a', year: '2026' };
    const received = [];
    const failing = { async post(_action, request) { received.push(request.body.clientRequestId); throw new Error('Offline'); } };
    await assert.rejects(createRetrySafeWriteClient(failing, () => 'original', scope).post('submitRows', options), /Offline/);
    await assert.rejects(createRetrySafeWriteClient(failing, () => 'other-user', { ...scope, userId: 'user-b' }).post('submitRows', options), /Offline/);
    assert.equal([...values.keys()].some((key) => key.includes('SYNTHETIC')), false);
    const recovered = { async post(_action, request) { received.push(request.body.clientRequestId); return { ok: true, jobId: 'existing-job' }; } };
    assert.equal((await createRetrySafeWriteClient(recovered, () => 'unexpected', scope).post('submitRows', options)).jobId, 'existing-job');
    assert.deepEqual(received, ['original', 'other-user', 'original']);
    assert.deepEqual([...values.values()], ['other-user']);
  } finally {
    delete globalThis.window;
  }
});
