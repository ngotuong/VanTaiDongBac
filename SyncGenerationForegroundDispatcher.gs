/** D3 dispatcher/reconciler for the metadata-only foreground shadow lane. */
var SyncGenerationForegroundDispatcher = (function () {
  var ENABLED_PROPERTY = 'SYNC_FOREGROUND_SHADOW_ENABLED';
  var MAX_FOREGROUND_WAIT_MS = 15000;
  var RETRY_DELAY_SECONDS = 30;

  function dispatchRecorded(recordResult, context) {
    var ctx = context || defaultContext_();
    if (!ctx.isEnabled()) return { ok: true, enabled: false, dispatched: false };
    if (!recordResult || recordResult.recorded !== true || !recordResult.eventKey) {
      return { ok: true, enabled: true, dispatched: false, reason: 'not_recorded' };
    }
    if (!recordResult.row || String(recordResult.row.module || '') !== 'transport') {
      return { ok: true, enabled: true, dispatched: false, reason: 'unsupported_module' };
    }
    var requested = ctx.repository.requestDispatch(recordResult.eventKey, ctx.buildStamp);
    var waitMs = dueWaitMs_(requested && requested.not_before, ctx.nowMillis());
    if (waitMs > MAX_FOREGROUND_WAIT_MS) {
      return { ok: true, enabled: true, dispatched: true, claimed: false, reason: 'not_due' };
    }
    if (waitMs > 0) ctx.sleep(waitMs);
    var claimed = ctx.repository.claimOne(recordResult.eventKey, ctx.workerId(), 120, 180);
    if (!claimed) return { ok: true, enabled: true, dispatched: true, claimed: false, reason: 'not_claimable' };
    return processClaim_(claimed, ctx);
  }

  function reconcile(context) {
    var ctx = context || defaultContext_();
    if (!ctx.isEnabled()) return { ok: true, enabled: false, processed: 0 };
    var rows = ctx.repository.claimBatch(1, ctx.workerId(), 120, 180);
    var results = (rows || []).map(function (row) { return processClaim_(row, ctx); });
    return { ok: results.every(function (item) { return item.ok !== false; }), enabled: true, processed: results.length, results: results };
  }

  function processClaim_(claimed, context) {
    var outcome;
    try {
      outcome = context.worker.run(claimed, context.workerContext);
    } catch (error) {
      outcome = {
        action: 'retry',
        errorClass: 'shadow_runtime_error',
        retryAfterSeconds: RETRY_DELAY_SECONDS,
        shadowResult: 'runtime_error'
      };
    }
    var metadata = metadata_(claimed, outcome);
    if (outcome.action === 'complete') {
      var completed = context.repository.completeShadow(metadata);
      return { ok: true, eventKey: claimed.event_key, status: 'shadowed', shadowMatch: outcome.shadowMatch === true, row: completed };
    }
    metadata.errorClass = outcome.errorClass || 'shadow_retryable';
    metadata.terminal = outcome.terminal === true;
    metadata.nextAttemptAt = new Date(context.nowMillis() + Math.max(1, Number(outcome.retryAfterSeconds || RETRY_DELAY_SECONDS)) * 1000).toISOString();
    var retried = context.repository.retryShadow(metadata);
    return {
      ok: outcome.terminal !== true,
      eventKey: claimed.event_key,
      status: outcome.terminal === true ? 'failed' : 'retryable',
      errorClass: metadata.errorClass,
      row: retried
    };
  }

  function metadata_(claimed, outcome) {
    return {
      eventKey: claimed.event_key,
      leaseToken: claimed.lease_token,
      shadowResult: outcome.shadowResult || '',
      shadowMatch: outcome.shadowMatch === true,
      shadowMonth: outcome.shadowMonth || '',
      sourceReadyAt: outcome.sourceReadyAt || null,
      shadowSourceDataVersion: outcome.shadowSourceDataVersion || '',
      shadowLegacySourceDataVersion: outcome.shadowLegacySourceDataVersion || '',
      shadowSourceHash: outcome.shadowSourceHash || '',
      shadowDashboardHash: outcome.shadowDashboardHash || '',
      shadowReportHash: outcome.shadowReportHash || '',
      shadowLegacyDashboardHash: outcome.shadowLegacyDashboardHash || '',
      shadowLegacyReportHash: outcome.shadowLegacyReportHash || ''
    };
  }

  function dueWaitMs_(notBefore, nowMillis) {
    var due = new Date(notBefore || 0).getTime();
    if (!isFinite(due)) return 0;
    return Math.max(0, due - Number(nowMillis || 0));
  }

  function defaultContext_() {
    var props = PropertiesService.getScriptProperties();
    return {
      isEnabled: function () {
        return ['1', 'true', 'yes', 'on'].indexOf(String(props.getProperty(ENABLED_PROPERTY) || '').trim().toLowerCase()) !== -1;
      },
      repository: SupabaseSyncGenerationRepository,
      worker: SyncGenerationForegroundWorker,
      workerContext: null,
      buildStamp: String(typeof RUNTIME_BUILD_STAMP !== 'undefined' ? RUNTIME_BUILD_STAMP : 'unversioned-local'),
      nowMillis: function () { return new Date().getTime(); },
      sleep: function (milliseconds) { Utilities.sleep(milliseconds); },
      workerId: function () { return 'd3-shadow-' + Utilities.getUuid(); }
    };
  }

  return {
    dispatchRecorded: dispatchRecorded,
    reconcile: reconcile,
    dueWaitMs: dueWaitMs_
  };
})();
