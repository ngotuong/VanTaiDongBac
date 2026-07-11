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
  const calls = { claims: [], processing: [], synced: [], failures: [], executions: [] };
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
      markSynced(jobId, result, syncedAt) { calls.synced.push({ jobId, result, syncedAt }); },
      markFailure(jobId, status, error, nextRunAt, details) { calls.failures.push({ jobId, status, error, nextRunAt, details }); }
    },
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
  assert.deepEqual(JSON.parse(JSON.stringify(idle.calls.claims)), [{ p_limit: 20, p_worker_id: 'gas-worker-uuid', p_stale_seconds: 300 }]);
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
});

test('failure remains pending below max attempts and permanent at max attempts', () => {
  const retryable = loadWorker({ jobs: [{ id: 'job-1', attempts: 2, max_attempts: 3 }], error: 'synthetic failure' });
  const retryResult = retryable.worker.process(1, retryable.context);
  assert.equal(retryResult.ok, false);
  assert.equal(retryResult.results[0].status, 'pending');
  assert.deepEqual(JSON.parse(JSON.stringify(retryable.calls.failures[0])), {
    jobId: 'job-1', status: 'pending', error: 'synthetic failure', nextRunAt: 'retry-after-2',
    details: { attempt: 2, retryable: true }
  });

  const permanent = loadWorker({ jobs: [{ id: 'job-2', attempts: 3, max_attempts: 3 }], error: 'permanent failure' });
  const permanentResult = permanent.worker.process(1, permanent.context);
  assert.equal(permanentResult.results[0].status, 'failed');
  assert.equal(permanent.calls.failures[0].details.retryable, false);
});

test('SupabaseService delegates worker lifecycle but retains transport and fund action handlers', () => {
  const service = read('SupabaseService.gs');
  assert.match(service, /return WriteJobWorker\.process\(maxJobs, writeJobWorkerContext_\(\)\)/);
  assert.match(service, /executeJob: executeWriteJob_/);
  assert.match(service, /function executeWriteJob_\(job\)/);
  assert.match(service, /EntryService\.submitRows/);
  assert.match(service, /FundService\.addFundTransactions/);
  assert.doesNotMatch(service, /function processWriteJob_/);
});
