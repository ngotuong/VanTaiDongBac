const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadWorker(options = {}) {
  const vmContext = vm.createContext({});
  new vm.Script(read('WriteJobWorker.gs'), { filename: 'WriteJobWorker.gs#test' }).runInContext(vmContext);
  const calls = { claims: [], processing: [], synced: [], failures: [], executions: [], releases: [] };
  const jobs = options.jobs || [];
  const context = {
    isEnabled: () => options.enabled !== false,
    createUuid: () => 'worker-uuid',
    claimJobs(payload) { calls.claims.push(payload); return jobs; },
    executeJob(job) {
      calls.executions.push(job.id);
      if (options.error) throw new Error(options.error);
      return { synthetic: true, jobId: job.id };
    },
    repository: {
      markProcessing(jobId, details) { calls.processing.push({ jobId, details }); },
      markSynced(jobId, result, syncedAt, workerId) { calls.synced.push({ jobId, result, syncedAt, workerId }); },
      markFailure(jobId, status, error, nextRunAt, details, workerId) { calls.failures.push({ jobId, status, error, nextRunAt, details, workerId }); }
    },
    releaseReservation: (jobId) => calls.releases.push(jobId),
    clean: (value) => String(value || '').trim(),
    nowISOString: () => 'synced-at',
    nextRunISOString: (attempts) => `retry-after-${attempts}`
  };
  return { worker: vmContext.WriteJobWorker, context, calls };
}

test('disabled and idle worker preserve response and atomic claim parameters', () => {
  const disabled = loadWorker({ enabled: false });
  assert.deepEqual(JSON.parse(JSON.stringify(disabled.worker.process(5, disabled.context))), {
    ok: true, disabled: true, processed: 0, message: 'Async write queue is disabled.'
  });
  assert.equal(disabled.calls.claims.length, 0);

  const idle = loadWorker();
  const result = idle.worker.process(100, idle.context);
  assert.equal(result.ok, true);
  assert.equal(result.processed, 0);
  assert.equal(result.workerId, 'gas-worker-uuid');
  assert.deepEqual(JSON.parse(JSON.stringify(idle.calls.claims)), [{ p_limit: 20, p_worker_id: 'gas-worker-uuid', p_stale_seconds: 900 }]);
});

test('successful lifecycle preserves processing details, result, and synced response', () => {
  const job = { id: 'job-1', attempts: 1, max_attempts: 3, claimed_at: 'claimed', idempotency_key: 'request-1' };
  const loaded = loadWorker({ jobs: [job] });
  const result = loaded.worker.process(1, loaded.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.results)), [{
    ok: true, jobId: 'job-1', status: 'synced', result: { synthetic: true, jobId: 'job-1' }
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls.processing)), [{
    jobId: 'job-1', details: { attempt: 1, workerId: 'gas-worker-uuid', claimedAt: 'claimed', idempotencyKey: 'request-1' }
  }]);
  assert.equal(loaded.calls.synced[0].syncedAt, 'synced-at');
  assert.equal(loaded.calls.synced[0].workerId, 'gas-worker-uuid');
  assert.deepEqual(loaded.calls.releases, ['job-1']);
});

test('failure remains pending below max attempts and permanent at max attempts', () => {
  const retryable = loadWorker({ jobs: [{ id: 'job-1', attempts: 2, max_attempts: 3 }], error: 'synthetic failure' });
  const retryResult = retryable.worker.process(1, retryable.context);
  assert.equal(retryResult.ok, false);
  assert.equal(retryResult.results[0].status, 'pending');
  assert.deepEqual(JSON.parse(JSON.stringify(retryable.calls.failures[0])), {
    jobId: 'job-1', status: 'pending', error: 'synthetic failure', nextRunAt: 'retry-after-2',
    details: { attempt: 2, retryable: true }, workerId: 'gas-worker-uuid'
  });

  const permanent = loadWorker({ jobs: [{ id: 'job-2', attempts: 3, max_attempts: 3 }], error: 'permanent failure' });
  const permanentResult = permanent.worker.process(1, permanent.context);
  assert.equal(permanentResult.results[0].status, 'failed');
  assert.equal(permanent.calls.failures[0].details.retryable, false);
});

test('SupabaseService delegates worker lifecycle and dispatches transport/fund handlers', () => {
  const service = read('SupabaseService.gs');
  assert.match(service, /return WriteJobWorker\.process\(maxJobs, writeJobWorkerContext_\(\)\)/);
  assert.match(service, /executeJob: executeWriteJob_/);
  assert.match(service, /releaseReservation: EntryService\.releaseWriteJobReservation/);
  assert.match(service, /function executeWriteJob_\(job\)/);
  assert.match(service, /TransportJobHandler\.execute/);
  assert.match(service, /FundJobHandler\.execute/);
  assert.doesNotMatch(service, /function processWriteJob_/);
});

test('R8 processing/log failure is isolated and does not abandon the rest of the claimed batch', () => {
  const loaded = loadWorker({ jobs: [{ id: 'first', attempts: 3 }, { id: 'second', attempts: 1 }] });
  loaded.context.repository.markProcessing = (id) => { if (id === 'first') throw new Error('processing log unavailable'); };
  loaded.context.repository.markFailure = () => { throw new Error('status persistence unavailable'); };
  const result = loaded.worker.process(2, loaded.context);
  assert.equal(result.results[0].status, 'processing');
  assert.match(result.results[0].persistenceError, /status persistence/);
  assert.equal(result.results[1].status, 'synced');
  assert.deepEqual(loaded.calls.executions, ['second']);
});

test('R8 uncertain Sheet state terminates immediately instead of automatically replaying', () => {
  const loaded = loadWorker({ jobs: [{ id: 'first', attempts: 1, max_attempts: 3 }], error: 'REQUIRES_RECONCILIATION: partial values' });
  const result = loaded.worker.process(1, loaded.context);
  assert.equal(result.results[0].status, 'failed'); assert.equal(loaded.calls.failures[0].details.retryable, false);
});

test('R8 persistence failure after successful Sheet execution reports uncertainty rather than success', () => {
  const loaded = loadWorker({ jobs: [{ id: 'first', attempts: 3 }] });
  loaded.context.repository.markSynced = () => { throw new Error('synced persistence unavailable'); };
  const result = loaded.worker.process(1, loaded.context);
  assert.equal(result.results[0].status, 'failed'); assert.deepEqual(loaded.calls.executions, ['first']);
});
