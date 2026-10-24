const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadClient(options = {}) {
  const requests = [];
  const sleeps = [];
  const properties = {
    SUPABASE_URL: options.url === undefined ? ' https://project.test/ ' : options.url,
    SUPABASE_SERVICE_ROLE_KEY: options.key === undefined ? ' test-service-key ' : options.key
  };
  const responses = (options.responses || []).slice();
  const context = vm.createContext({
    encodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (name) => properties[name] })
    },
    UrlFetchApp: {
      fetch(url, requestOptions) {
        requests.push({ url, options: JSON.parse(JSON.stringify(requestOptions)) });
        const response = responses.shift() || { code: 200, body: '[]' };
        if (response.error) throw new Error(response.error);
        return {
          getResponseCode: () => response.code,
          getContentText: () => response.body
        };
      }
    },
    Utilities: { sleep: (delay) => sleeps.push(delay) }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#http-client-test' }).runInContext(context);
  new vm.Script(read('SupabaseHttpClient.gs'), { filename: 'SupabaseHttpClient.gs#test' }).runInContext(context);
  return { client: context.SupabaseHttpClient, requests, sleeps };
}

test('read request snapshot preserves URL encoding, omitted empty filters, and auth headers', () => {
  const { client, requests } = loadClient({ responses: [{ code: 200, body: '[{"id":1}]' }] });
  const rows = client.readRows('write jobs', {
    select: 'id,status',
    module: 'eq.vận tải',
    empty: '',
    nil: null,
    limit: 5
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{ id: 1 }]);
  assert.deepEqual(requests, [{
    url: 'https://project.test/rest/v1/write%20jobs?select=id%2Cstatus&module=eq.v%E1%BA%ADn%20t%E1%BA%A3i&limit=5',
    options: {
      method: 'get',
      muteHttpExceptions: true,
      headers: { apikey: 'test-service-key', Authorization: 'Bearer test-service-key' }
    }
  }]);
});

test('insert, update, and upsert request snapshots preserve methods, payloads, and Prefer headers', () => {
  const { client, requests } = loadClient();
  client.insertRows('write_jobs', [{ id: 'job-1' }]);
  client.updateRows('write_jobs', { status: 'synced' }, { id: 'eq.job-1', ignored: undefined });
  client.upsertRows('sync_status', [{ sync_key: 'dashboard' }], 'sync_key');
  assert.deepEqual(requests, [
    {
      url: 'https://project.test/rest/v1/write_jobs',
      options: {
        method: 'post', muteHttpExceptions: true, contentType: 'application/json',
        headers: { apikey: 'test-service-key', Authorization: 'Bearer test-service-key', Prefer: 'return=minimal' },
        payload: '[{"id":"job-1"}]'
      }
    },
    {
      url: 'https://project.test/rest/v1/write_jobs?id=eq.job-1',
      options: {
        method: 'patch', muteHttpExceptions: true, contentType: 'application/json',
        headers: { apikey: 'test-service-key', Authorization: 'Bearer test-service-key', Prefer: 'return=minimal' },
        payload: '{"status":"synced"}'
      }
    },
    {
      url: 'https://project.test/rest/v1/sync_status?on_conflict=sync_key',
      options: {
        method: 'post', muteHttpExceptions: true, contentType: 'application/json',
        headers: {
          apikey: 'test-service-key', Authorization: 'Bearer test-service-key',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        payload: '[{"sync_key":"dashboard"}]'
      }
    }
  ]);
});

test('conditional update returns affected rows only when representation is requested', () => {
  const { client, requests } = loadClient({ responses: [
    { code: 200, body: '[{"id":"job-1","status":"pending"}]' },
    { code: 200, body: '[]' }
  ] });
  const filters = { id: 'eq.job-1', status: 'eq.failed', updated_at: 'eq.2026-10-23T00:00:00Z' };
  const first = client.updateRows('write_jobs', { status: 'pending' }, filters, { returnRepresentation: true });
  const second = client.updateRows('write_jobs', { status: 'pending' }, filters, { returnRepresentation: true });
  assert.equal(first[0].status, 'pending');
  assert.equal(second.length, 0);
  assert.equal(requests[0].options.headers.Prefer, 'return=representation');
  assert.match(requests[0].url, /updated_at=eq\.2026-10-23T00%3A00%3A00Z/);
});

test('empty insert and upsert keep the legacy no-request behavior', () => {
  const { client, requests } = loadClient();
  assert.equal(client.insertRows('write_jobs', []), undefined);
  assert.equal(client.upsertRows('write_jobs', null, 'id'), undefined);
  assert.equal(requests.length, 0);
});

test('RPC snapshot and JSON result preserve the legacy transport contract', () => {
  const { client, requests } = loadClient({ responses: [{ code: 200, body: '[{"id":"job-1"}]' }] });
  const result = client.callRpc('claim_write_jobs', { p_limit: 5, p_worker_id: 'worker-1' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ id: 'job-1' }]);
  assert.deepEqual(requests[0], {
    url: 'https://project.test/rest/v1/rpc/claim_write_jobs',
    options: {
      method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { apikey: 'test-service-key', Authorization: 'Bearer test-service-key' },
      payload: '{"p_limit":5,"p_worker_id":"worker-1"}'
    }
  });
});

test('non-2xx errors retain exact operation, status, and response text', () => {
  const operations = [
    { response: { code: 409, body: 'duplicate' }, run: (client) => client.upsertRows('t', [{}], 'id'), message: 'Supabase upsert thất bại (409): duplicate' },
    { response: { code: 400, body: 'bad insert' }, run: (client) => client.insertRows('t', [{}]), message: 'Supabase insert thất bại (400): bad insert' },
    { response: { code: 401, body: 'denied' }, run: (client) => client.readRows('t', {}), message: 'Supabase select thất bại (401): denied' },
    { response: { code: 404, body: 'missing' }, run: (client) => client.updateRows('t', {}, {}), message: 'Supabase update thất bại (404): missing' },
    { response: { code: 500, body: 'rpc error' }, run: (client) => client.callRpc('fn', {}), message: 'Supabase RPC fn thất bại (500): rpc error' }
  ];
  operations.forEach((operation) => {
    const retryable = /upsert|select|update/.test(operation.message);
    const { client } = loadClient({ responses: retryable ? [operation.response, operation.response, operation.response] : [operation.response] });
    assert.throws(() => operation.run(client), { message: operation.message });
  });
});

test('retry-safe requests recover from transient transport and HTTP failures with bounded backoff', () => {
  const transport = loadClient({ responses: [{ error: 'Address unavailable' }, { code: 200, body: '[{"id":1}]' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(transport.client.readRows('t', {}))), [{ id: 1 }]);
  assert.equal(transport.requests.length, 2);
  assert.deepEqual(transport.sleeps, [250]);

  const unavailable = loadClient({ responses: [
    { code: 503, body: 'busy' },
    { code: 429, body: 'rate limited' },
    { code: 200, body: '[]' }
  ] });
  unavailable.client.upsertRows('t', [{ id: 1 }], 'id');
  assert.equal(unavailable.requests.length, 3);
  assert.deepEqual(unavailable.sleeps, [250, 750]);
});

test('non-idempotent insert and RPC requests are never retried automatically', () => {
  const insert = loadClient({ responses: [{ error: 'Address unavailable' }] });
  assert.throws(() => insert.client.insertRows('t', [{ id: 1 }]), /Address unavailable/);
  assert.equal(insert.requests.length, 1);
  assert.deepEqual(insert.sleeps, []);

  const rpc = loadClient({ responses: [{ code: 503, body: 'busy' }] });
  assert.throws(() => rpc.client.callRpc('claim', {}), /503/);
  assert.equal(rpc.requests.length, 1);
  assert.deepEqual(rpc.sleeps, []);
});

test('invalid JSON and empty successful bodies preserve legacy parsing behavior', () => {
  const invalidRead = loadClient({ responses: [{ code: 200, body: '{invalid' }] }).client;
  assert.throws(() => invalidRead.readRows('t', {}), (error) => error && error.name === 'SyntaxError');
  const emptyRpc = loadClient({ responses: [{ code: 200, body: '' }] }).client;
  assert.deepEqual(JSON.parse(JSON.stringify(emptyRpc.callRpc('fn', {}))), []);
});

test('missing Supabase configuration retains exact validation messages and makes no HTTP request', () => {
  const missingUrl = loadClient({ url: ' ', key: 'key' });
  assert.throws(() => missingUrl.client.readRows('t', {}), { message: 'Thiếu Script Property SUPABASE_URL.' });
  assert.equal(missingUrl.requests.length, 0);
  const missingKey = loadClient({ url: 'https://project.test', key: null });
  assert.throws(() => missingKey.client.readRows('t', {}), { message: 'Thiếu Script Property SUPABASE_SERVICE_ROLE_KEY.' });
  assert.equal(missingKey.requests.length, 0);
});

test('SupabaseService keeps RPC transport while write persistence uses WriteJobRepository', () => {
  const source = read('SupabaseService.gs');
  const repository = read('WriteJobRepository.gs');
  assert.match(source, /function callRpc_\([^)]*\) \{\s*return SupabaseHttpClient\.callRpc/);
  assert.match(repository, /SupabaseHttpClient\.upsertRows\(TABLE_WRITE_JOBS/);
  assert.match(repository, /SupabaseHttpClient\.insertRows\(TABLE_WRITE_JOB_LOGS/);
  assert.match(repository, /SupabaseHttpClient\.readRows\(TABLE_WRITE_JOBS/);
  assert.match(repository, /SupabaseHttpClient\.updateRows\(TABLE_WRITE_JOBS/);
  assert.doesNotMatch(source, /UrlFetchApp\.fetch/);
});
