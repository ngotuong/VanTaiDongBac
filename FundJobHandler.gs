/** Executes queued Fund write actions and their cache sync side effects. */
var FundJobHandler = (function () {
  function canHandle(job, clean) {
    return clean(job && job.module) === 'fund' && clean(job && job.action) === 'addFundTransactions';
  }

  function assertResult_(result) {
    if (result && result.ok !== false) return result;
    var errorMessage = result && (result.error || (result.errors && result.errors.join('; ')));
    throw new Error(errorMessage || 'Không thể ghi giao dịch Thu chi.');
  }

  function execute(job, context) {
    var payload = job.payload || {};
    var result = context.addFundTransactions(payload.year, payload.transactions || [], {
      jobId: job.id,
      idempotencyKey: job.idempotency_key
    });
    assertResult_(result);
    try {
      result.supabaseSync = context.syncFundTransactionsAfterWrite(payload.year, payload.transactions || []);
    } catch (err) {
      result.supabaseSync = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return result;
  }

  return { canHandle: canHandle, execute: execute };
})();
