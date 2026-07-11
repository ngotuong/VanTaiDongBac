const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/queue-lifecycle.synthetic.json'));
const service = read('SupabaseService.gs');
const worker = read('WriteJobWorker.gs');
const sheetService = read('SheetService.gs');
const entryService = read('EntryService.gs');
const fundService = read('FundService.gs');
const migration = read('supabase/migrations/006_write_queue_hardening.sql');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canClaim(job, staleSeconds = 300) {
  if (job.attempts >= job.max_attempts) return false;
  if (job.status === 'pending') return true;
  return job.status === 'processing' && job.claimedSecondsAgo >= Math.max(staleSeconds, 60);
}

function claim(job, workerId) {
  assert.equal(canClaim(job), true);
  return { ...clone(job), status: 'processing', attempts: job.attempts + 1, worker_id: workerId, claimedSecondsAgo: 0 };
}

function finishFailure(job, message) {
  const permanent = job.attempts >= job.max_attempts;
  return {
    ...clone(job),
    status: permanent ? 'failed' : 'pending',
    last_error: message,
    worker_id: job.worker_id
  };
}

function enqueue(store, request) {
  const duplicate = store.find((job) =>
    job.module === request.module && job.idempotency_key === request.idempotency_key);
  if (duplicate) {
    if (duplicate.status === 'synced') {
      return { ...clone(duplicate.result), jobId: duplicate.id, status: 'synced', queued: false, duplicateRequest: true };
    }
    return { ...clone(duplicate), queued: true, duplicateRequest: true };
  }
  const inserted = { ...clone(request), status: 'pending', attempts: 0, max_attempts: 3 };
  store.push(inserted);
  return { ok: true, queued: true, jobId: inserted.id, status: 'pending' };
}

function evaluateFundReplay(vouchers, existingVouchers) {
  const existing = new Set(existingVouchers);
  const count = vouchers.filter((voucher) => existing.has(voucher)).length;
  if (count === vouchers.length) return { ok: true, inserted: vouchers.length, idempotentReplay: true };
  if (count > 0) throw new Error(fixture.fundReplay.partialConflictMessage);
  return { ok: true, inserted: vouchers.length, idempotentReplay: false };
}

test('queue fixture is synthetic and contains no production identifiers or credentials', () => {
  assert.equal(fixture.fixtureType, 'synthetic');
  const serialized = JSON.stringify(fixture);
  assert.equal(serialized.includes('spreadsheetId'), false);
  assert.equal(/service[_-]?role|authorization|bearer/i.test(serialized), false);
});

test('duplicate enqueue returns the existing job and creates no second business write', () => {
  const store = [{ ...clone(fixture.jobs.pending), result: null }];
  const result = enqueue(store, clone(fixture.jobs.pending));
  assert.equal(store.length, 1);
  assert.equal(result.jobId || result.id, fixture.jobs.pending.id);
  assert.equal(result.status, 'pending');
  assert.equal(result.queued, true);
  assert.equal(result.duplicateRequest, true);

  store[0].status = 'synced';
  store[0].result = { ok: true, inserted: 2 };
  const completed = enqueue(store, clone(fixture.jobs.pending));
  assert.deepEqual(completed, {
    ok: true,
    inserted: 2,
    jobId: fixture.jobs.pending.id,
    status: 'synced',
    queued: false,
    duplicateRequest: true
  });
});

test('atomic claim accepts pending and stale jobs but excludes fresh and exhausted jobs', () => {
  assert.equal(canClaim(fixture.jobs.pending), true);
  assert.equal(canClaim(fixture.jobs.staleProcessing), true);
  assert.equal(canClaim(fixture.jobs.freshProcessing), false);
  assert.equal(canClaim(fixture.jobs.exhausted), false);

  const claimed = claim(fixture.jobs.pending, 'worker-test-1');
  assert.equal(claimed.status, 'processing');
  assert.equal(claimed.attempts, 1);
  assert.equal(claimed.worker_id, 'worker-test-1');
});

test('failure retries below max attempts and becomes permanent at max attempts', () => {
  const retryable = finishFailure(claim(fixture.jobs.pending, 'worker-test-1'), 'synthetic failure');
  assert.equal(retryable.status, 'pending');
  assert.equal(retryable.last_error, 'synthetic failure');

  const finalAttempt = { ...clone(fixture.jobs.pending), status: 'processing', attempts: 3 };
  const failed = finishFailure(finalAttempt, 'synthetic permanent failure');
  assert.equal(failed.status, 'failed');
});

test('transport retry reuses WRITE_JOB_ID metadata and preserves the original row range', () => {
  assert.equal(fixture.transportReplay.metadataKey, 'WRITE_JOB_ID');
  assert.equal(fixture.transportReplay.replayResult.startRow, fixture.transportReplay.firstResult.startRow);
  assert.equal(fixture.transportReplay.replayResult.inserted, fixture.transportReplay.firstResult.inserted);
  assert.equal(fixture.transportReplay.replayResult.idempotentReplay, true);
  assert.match(service, /EntryService\.submitRows\(payload\.formType, payload\.rows \|\| \[\], \{ jobId: job\.id, idempotencyKey: job\.idempotency_key \}\)/);
  assert.match(entryService, /addDeveloperMetadata\([\s\S]*?'WRITE_JOB_ID'/);
  assert.match(entryService, /withKey\('WRITE_JOB_ID'\)[\s\S]*?withValue\(jobId\)/);
});

test('fund full replay succeeds while a partial voucher match stops the entire batch', () => {
  const full = evaluateFundReplay(fixture.fundReplay.vouchers, fixture.fundReplay.fullExisting);
  assert.deepEqual(full, { ok: true, inserted: 2, idempotentReplay: true });
  assert.throws(
    () => evaluateFundReplay(fixture.fundReplay.vouchers, fixture.fundReplay.partialExisting),
    new RegExp(fixture.fundReplay.partialConflictMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(fundService, /existingCount === rows\.length[\s\S]*?idempotentReplay: true/);
  assert.match(fundService, /existingCount > 0[\s\S]*?đã tồn tại một phần voucher/);
});

test('failure after a Sheet write remains retryable and replay guards prevent duplicate rows', () => {
  const claimed = claim(fixture.jobs.pending, 'worker-test-1');
  const afterPostWriteFailure = finishFailure(claimed, 'sync failed after Sheet write');
  assert.equal(afterPostWriteFailure.status, 'pending');
  assert.match(worker, /var result = context\.executeJob\(job\);[\s\S]*?status: 'synced'/);
  assert.match(entryService, /var idempotentReplay = Boolean\(reservedRange\)/);
  assert.match(fundService, /idempotentReplay: true/);
});

test('pending never has the synced success shape and synced result keeps its public status shape', () => {
  assert.equal(fixture.pendingShape.status, 'pending');
  assert.equal(fixture.pendingShape.ok, false);
  assert.equal(fixture.syncedShape.status, 'synced');
  assert.equal(fixture.syncedShape.ok, true);
  assert.notDeepEqual(fixture.pendingShape, fixture.syncedShape);
  assert.match(worker, /return \{ ok: false, jobId: jobId, status: failedPermanently \? 'failed' : 'pending'/);
  assert.match(worker, /return \{ ok: true, jobId: jobId, status: 'synced', result: result \}/);
});

test('runtime and migration retain atomic claim, stale reclaim, max-attempt and unique-idempotency guards', () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /attempts < max_attempts/i);
  assert.match(migration, /status = 'processing'[\s\S]*?p_stale_seconds/i);
  assert.match(migration, /create unique index[\s\S]*?on public\.write_jobs \(module, idempotency_key\)/i);
  assert.match(worker, /p_stale_seconds: STALE_SECONDS/);
  assert.match(worker, /STALE_SECONDS = 300/);
  assert.match(worker, /failedPermanently = attempts >= Number\(job\.max_attempts \|\| 3\)/);
});
