/** Executes queued Fund write actions and their cache sync side effects. */
var FundJobHandler = (function () {
  function canHandle(job, clean) {
    if (clean(job && job.module) !== 'fund') return false;
    return ['addFundTransactions', 'updateFundTransaction', 'deleteFundTransaction', 'addFundDebtPayment',
      'addFundLoan', 'addFundLoanPayment', 'saveFundCatalogItem', 'deleteFundCatalogItem',
      'updateFundSettings'].indexOf(clean(job && job.action)) !== -1;
  }

  function assertResult_(result) {
    if (result && result.ok !== false) return result;
    var errorMessage = result && (result.error || (result.errors && result.errors.join('; ')));
    throw new Error(errorMessage || 'Không thể ghi giao dịch Thu chi.');
  }

  function execute(job, context) {
    var payload = job.payload || {};
    var actionName = String(job.action || '').trim();
    context.assertWorkbook(payload.year, payload.spreadsheetId);
    var transactionMutation = ['updateFundTransaction', 'deleteFundTransaction', 'addFundDebtPayment'].indexOf(actionName) !== -1;
    var result;
    if (actionName === 'addFundTransactions') {
      result = context.addFundTransactions(payload.year, payload.transactions || [], {
        jobId: job.id,
        idempotencyKey: job.idempotency_key
      });
    } else if (actionName === 'updateFundTransaction') {
      result = context.updateFundTransaction(payload.year, payload.rowIndex, payload.transaction || {});
    } else if (actionName === 'deleteFundTransaction') {
      result = context.deleteFundTransaction(payload.year, payload.rowIndex, payload.expectedTransaction || {});
    } else if (actionName === 'addFundDebtPayment') {
      result = context.addFundDebtPayment(payload.year, payload.rowIndex, Object.assign({}, payload.payment || {}, { expectedTransaction: payload.expectedTransaction }), job.idempotency_key);
    } else if (actionName === 'addFundLoan') {
      result = context.addFundLoan(payload.year, payload.loan || {}, {
        jobId: job.id,
        idempotencyKey: job.idempotency_key
      });
    } else if (actionName === 'addFundLoanPayment') {
      result = context.addFundLoanPayment(payload.year, payload.payment || {}, {
        jobId: job.id,
        idempotencyKey: job.idempotency_key
      });
    } else if (actionName === 'saveFundCatalogItem') {
      result = context.saveFundCatalogItem(payload.year, payload.payload || {});
    } else if (actionName === 'deleteFundCatalogItem') {
      result = context.deleteFundCatalogItem(payload.year, payload.payload || {});
    } else if (actionName === 'updateFundSettings') {
      result = context.updateFundSettings(payload.year, payload.settings || {});
    } else {
      throw new Error('Fund write job action chưa được hỗ trợ: ' + actionName);
    }
    assertResult_(result);
    try {
      result.supabaseSync = actionName === 'addFundTransactions'
        ? context.syncFundTransactionsAfterWrite(payload.year, payload.transactions || [])
        : context.syncFundAfterWrite(payload.year, {
            transaction: payload.transaction || payload.payment || null,
            result: result,
            transportDownstream: transactionMutation,
            fundCatalog: actionName === 'saveFundCatalogItem' || actionName === 'deleteFundCatalogItem' || actionName === 'updateFundSettings'
          });
    } catch (err) {
      result.supabaseSync = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return result;
  }

  return { canHandle: canHandle, execute: execute };
})();
