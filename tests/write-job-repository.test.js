const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadRepository(readQueue = []) {
  const calls = [];
  const context = vm.createContext({
    SupabaseHttpClient: {
      upsertRows(tableName, rows, onConflict) { calls.push({ operation: 'upsert', tableName, rows, onConflict }); },
      insertRows(tableName, rows) { calls.push({ operation: 'insert', tableName, rows }); },
      readRows(tableName, query) {
        calls.push({ operation: 'read', tableName, query });
        return readQueue.length ? readQueue.shift() : [];
      },
      updateRows(tableName, patch, filters) { calls.push({ operation: 'update', tableName, patch, filters }); }
    }
  });
  new vm.Script(read('WriteJobRepository.gs'), { filename: 'WriteJobRepository.gs#test' }).runInContext(context);
  return { repository: context.WriteJobRepository, calls };
}

const rawJob = {
  id: 'job-1', module: 'transport', action: 'submitRows', status: 'pending', payload: { rows: [] }, result: null,
  attempts: 0, max_attempts: 3, last_error: '', idempotency_key: 'request-1', worker_id: null,
  claimed_at: null, created_at: 'created', updated_at: 'updated', synced_at: null
};

test('create preserves write_jobs row and initial write_job_logs payload', () => {
  const { repository, calls } = loadRepository();
  repository.create(rawJob);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { operation: 'upsert', tableName: 'write_jobs', rows: [rawJob], onConflict: 'id' },
    {
      operation: 'insert', tableName: 'write_job_logs', rows: [{
        job_id: 'job-1', status: 'pending', message: 'Write job queued.',
        details: { action: 'submitRows', module: 'transport', idempotencyKey: 'request-1' }
      }]
    }
  ]);
});

test('idempotency, status, and recent reads preserve queries and normalized responses', () => {
  const { repository, calls } = loadRepository([[rawJob], [rawJob], [rawJob]]);
  const duplicate = repository.findByIdempotency('transport', 'request-1');
  const status = repository.get('job-1');
  const recent = repository.listRecent('transport', 'submitRows', 20);
  assert.equal(duplicate.jobId, 'job-1');
  assert.equal(status.maxAttempts, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(recent)), [JSON.parse(JSON.stringify(status))]);
  assert.equal(calls[0].query.module, 'eq.transport');
  assert.equal(calls[0].query.idempotency_key, 'eq.request-1');
  assert.equal(calls[1].query.id, 'eq.job-1');
  assert.equal(calls[2].query.order, 'created_at.desc');
  assert.equal(calls[2].query.limit, '20');
});

test('retry and worker lifecycle preserve patches, filters, logs, and retry status', () => {
  const { repository, calls } = loadRepository();
  repository.retry('job-1', 'retry-at');
  repository.markProcessing('job-1', { attempt: 1, workerId: 'worker-1', claimedAt: 'claimed', idempotencyKey: 'request-1' });
  repository.markSynced('job-1', { inserted: 1 }, 'synced-at', 'worker-1');
  repository.markFailure('job-1', 'pending', 'synthetic failure', 'next-run', { attempt: 1, retryable: true }, 'worker-1');
  const updates = calls.filter((call) => call.operation === 'update');
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [
    {
      operation: 'update', tableName: 'write_jobs',
      patch: { status: 'pending', attempts: 0, last_error: '', next_run_at: 'retry-at', locked_at: null, claimed_at: null, worker_id: null },
      filters: { id: 'eq.job-1' }
    },
    {
      operation: 'update', tableName: 'write_jobs',
      patch: { status: 'synced', result: { inserted: 1 }, synced_at: 'synced-at', locked_at: null, last_error: '' },
      filters: { id: 'eq.job-1', status: 'eq.processing', worker_id: 'eq.worker-1' }
    },
    {
      operation: 'update', tableName: 'write_jobs',
      patch: { status: 'pending', last_error: 'synthetic failure', locked_at: null, next_run_at: 'next-run' },
      filters: { id: 'eq.job-1', status: 'eq.processing', worker_id: 'eq.worker-1' }
    }
  ]);
  assert.deepEqual(calls.filter((call) => call.operation === 'insert').map((call) => call.rows[0].status), [
    'pending', 'processing', 'synced', 'pending'
  ]);
});

test('cancel changes only a pending job, preserves audit history, and returns terminal state', () => {
  const reason = 'CANCELED_BY_OPERATOR: requested';
  const canceledRaw = { ...rawJob, status: 'failed', last_error: reason, updated_at: 'canceled-at' };
  const { repository, calls } = loadRepository([[canceledRaw]]);
  const result = repository.cancel('job-1', reason, 'canceled-at');
  assert.equal(result.status, 'failed');
  assert.equal(result.lastError, reason);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    operation: 'update', tableName: 'write_jobs',
    patch: {
      status: 'failed', last_error: reason, next_run_at: 'canceled-at',
      locked_at: null, claimed_at: null, worker_id: null, updated_at: 'canceled-at'
    },
    filters: { id: 'eq.job-1', status: 'eq.pending' }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2].rows[0])), {
    job_id: 'job-1', status: 'failed', message: 'Write job canceled by operator.',
    details: { canceled: true, canceledAt: 'canceled-at' }
  });
});

test('SupabaseService delegates repository persistence and retains action execution', () => {
  const source = read('SupabaseService.gs');
  const worker = read('WriteJobWorker.gs');
  assert.match(source, /WriteJobRepository\.retry\(safeJobId/);
  assert.match(source, /WriteJobRepository\.cancel\(safeJobId/);
  assert.match(source, /CANCELED_BY_OPERATOR:/);
  assert.match(worker, /context\.repository\.markProcessing\(jobId/);
  assert.match(worker, /context\.repository\.markSynced\(jobId/);
  assert.match(worker, /context\.repository\.markFailure\(/);
  assert.match(source, /claimJobs: function \(payload\) \{ return callRpc_\('claim_write_jobs', payload\); \}/);
  assert.match(source, /function executeWriteJob_\(job\)/);
  assert.doesNotMatch(source, /function normalizeWriteJobRow_/);
});
