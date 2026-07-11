/** Atomic claim and lifecycle wrapper for Supabase write jobs. */
var WriteJobWorker = (function () {
  var DEFAULT_WRITE_JOB_LIMIT = 5;
  var MAX_WRITE_JOB_LIMIT = 20;
  var STALE_SECONDS = 300;

  function process(maxJobs, context) {
    if (!context.isEnabled()) {
      return { ok: true, disabled: true, processed: 0, message: 'Async write queue is disabled.' };
    }
    var limit = Math.max(1, Math.min(parseInt(maxJobs, 10) || DEFAULT_WRITE_JOB_LIMIT, MAX_WRITE_JOB_LIMIT));
    var workerId = 'gas-' + context.createUuid();
    var jobs = context.claimJobs({
      p_limit: limit,
      p_worker_id: workerId,
      p_stale_seconds: STALE_SECONDS
    });
    var results = [];
    (jobs || []).forEach(function (job) {
      results.push(processOne(job, workerId, context));
    });
    return {
      ok: results.every(function (item) { return item && item.ok !== false; }),
      workerId: workerId,
      processed: results.length,
      results: results
    };
  }

  function processOne(job, workerId, context) {
    var attempts = Number(job.attempts || 0);
    var jobId = context.clean(job.id);
    context.repository.markProcessing(jobId, {
      attempt: attempts,
      workerId: workerId || job.worker_id || '',
      claimedAt: job.claimed_at || '',
      idempotencyKey: job.idempotency_key || ''
    });
    try {
      var result = context.executeJob(job);
      context.repository.markSynced(jobId, result, context.nowISOString());
      return { ok: true, jobId: jobId, status: 'synced', result: result };
    } catch (err) {
      var errorMessage = err && err.message ? err.message : String(err);
      var failedPermanently = attempts >= Number(job.max_attempts || 3);
      context.repository.markFailure(
        jobId,
        failedPermanently ? 'failed' : 'pending',
        errorMessage,
        context.nextRunISOString(attempts),
        { attempt: attempts, retryable: !failedPermanently }
      );
      return { ok: false, jobId: jobId, status: failedPermanently ? 'failed' : 'pending', error: errorMessage };
    }
  }

  return { process: process, processOne: processOne };
})();
