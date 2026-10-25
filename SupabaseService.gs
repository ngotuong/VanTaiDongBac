var SupabaseService = (function () {
  var TABLE_REPORT_BUNDLES = 'report_bundles';
  var TABLE_MANAGE_DATA_BUNDLES = 'manage_data_bundles';
  var DEFAULT_STARTUP_FORM_TYPE = 'vanChuyen';
  var MANAGE_SHEET_NAMES = [
    'NL_VanChuyen',
    'NL_TaiXe',
    'NL_Dau',
    'NL_ChamCong',
    'NL_Phat',
    'NL_NghiVanHanh',
    'NL_PhanCongLai',
    'NL_SoDuLuong'
  ];
  var TRANSPORT_CATALOG_SHEET_NAMES = [
    'DM_NhanSu', 'DM_Xe', 'DM_DuAn', 'DM_CheDoLuong', 'DM_LuongChuyen',
    'DM_ThamSo', 'DM_GiaDau', 'DM_DonGiaVanChuyen', 'DM_ThuongQuanLy',
    'DM_PhatNoiBo', 'DM_PhanCongXe', 'DM_BaoHiem', 'DM_UuDaiNoiBo'
  ];
  var DEFAULT_MANAGE_FILTER_KEY = 'recent_500';
  var ASYNC_WRITE_ENABLED = false;
  var ASYNC_TRANSPORT_WRITE_ENABLED = true;
  function asyncFundTransactionAddEnabled_() { return readBooleanProperty_('ASYNC_FUND_TRANSACTION_ADD_ENABLED', false); }
  var REALTIME_TICK_INDEX_KEY = 'SUPABASE_REALTIME_TICK_INDEX';
  var REALTIME_SWEEP_NEXT_AT_PROP = 'SUPABASE_REALTIME_SWEEP_NEXT_AT';
  var REALTIME_HEARTBEAT_NEXT_AT_PROP = 'SUPABASE_REALTIME_HEARTBEAT_NEXT_AT';
  var SOURCE_POLL_NEXT_AT_PROP = 'SUPABASE_SOURCE_POLL_NEXT_AT';
  var SOURCE_POLL_CURSOR_PROP = 'SUPABASE_SOURCE_POLL_CURSOR_V1';
  var REPORT_OUTPUT_POLL_NEXT_AT_PROP = 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT';
  var REALTIME_QUEUE_PREFERENCE_PROP = 'SUPABASE_REALTIME_QUEUE_PREFERENCE';
  var SOURCE_FINGERPRINT_PREFIX = 'SUPABASE_SOURCE_FINGERPRINT_';
  var REPORT_OUTPUT_FINGERPRINT_PROP = 'SUPABASE_SOURCE_FINGERPRINT_REPORT_OUTPUTS';
  var REALTIME_TICK_RUNNING_CACHE_KEY = 'SUPABASE_REALTIME_TICK_RUNNING';
  var REPORT_CACHE_E1_PARITY_RUNNING_PROP = 'REPORT_CACHE_E1_PARITY_RUNNING';
  var INTERNAL_REPORT_REFRESH_TOKENS_PROP = 'SUPABASE_INTERNAL_REPORT_REFRESH_TOKENS';
  var TRANSPORT_SHEET_SYNC_RUNNING_CACHE_KEY = 'SUPABASE_TRANSPORT_SHEET_SYNC_RUNNING';
  var REALTIME_TICK_INTERVAL_MINUTES = 1;
  var REALTIME_STAGE_START_MIN_BUDGET_MS = 20000;
  var REALTIME_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
  var REALTIME_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
  var SOURCE_POLL_INTERVAL_MS = 5 * 60 * 1000;
  var REPORT_OUTPUT_POLL_INTERVAL_MS = 60 * 1000;
  var SOURCE_POLL_RETRY_MS = 60 * 1000;
  var TRIP_NOTIFICATION_NEXT_AT_PROP = 'SUPABASE_TRIP_NOTIFICATION_NEXT_AT';
  var NOTIFICATION_PIPELINE_FAILURE_COUNT_PROP = 'SUPABASE_NOTIFICATION_PIPELINE_FAILURE_COUNT';
  var TRIP_NOTIFICATION_INTERVAL_MS = 5 * 60 * 1000;
  var NOTIFICATION_PIPELINE_FAILURE_THRESHOLD = 3;
  var REALTIME_TICK_RUNNING_TTL_SECONDS = 420;
  var REALTIME_HOUSEKEEPING_INDEX_PROP = 'SUPABASE_REALTIME_HOUSEKEEPING_INDEX';
  var REALTIME_FAIRNESS_PROP = 'SUPABASE_REALTIME_FAIRNESS';
  var TRANSPORT_SHEET_SYNC_RUNNING_TTL_SECONDS = 120;
  var TRANSPORT_REPORT_DEBOUNCE_MS = 15000;
  var TRANSPORT_REPORT_VERIFICATION_DELAY_MS = 120000;
  var TRANSPORT_REPORT_RETRY_DELAY_MS = 30000;
  var FUND_REFRESH_PROPERTY_KEY = 'SUPABASE_PENDING_FUND_SYNC';
  var TRANSPORT_REFRESH_PROPERTY_KEY = 'SUPABASE_PENDING_TRANSPORT_REPORT_SYNC';
  var FUND_REFRESH_DEBOUNCE_MS = 15000;
  var FUND_REFRESH_RETRY_DELAY_MS = 30000;
  var FUND_TO_TRANSPORT_DELAY_MS = 30 * 1000;
  var INTERNAL_REPORT_REFRESH_GUARD_TTL_MS = 600000;
  var CANCELED_WRITE_JOB_PREFIX = 'CANCELED_BY_OPERATOR:';

  function syncReportBundle(month) {
    return withInternalReportRefreshGuard_(function () {
      return ReportSyncService.syncReportBundle(month, reportSyncContext_());
    });
  }

  function testReportSync() {
    return syncReportBundle('latest');
  }

  function syncDashboard() {
    return ReportSyncService.syncDashboard(reportSyncContext_());
  }

  function syncAllReportBundles() {
    return withInternalReportRefreshGuard_(function () {
      return ReportSyncService.syncAllReportBundles(reportSyncContext_());
    });
  }

  function syncPayrollExplanationMonth(month, sourceDataVersion) {
    try {
      return PayrollExplanationSyncService.syncMonth(month, payrollExplanationSyncContext_(), {
        sourceDataVersion: sourceDataVersion || ''
      });
    } catch (err) {
      var normalizedMonth = PayrollExplanationService.normalizeMonth(month) || clean_(month) || 'unknown';
      var message = err && err.message ? err.message : String(err);
      writeSyncStatus_('payroll_explanations:' + normalizedMonth, 'transport', 'error', message, new Date().toISOString());
      return { ok: false, reportMonth: normalizedMonth, error: message };
    }
  }

  function syncFundOverview(year, month) {
    return FundSyncService.syncFundOverview(year, month, fundSyncContext_());
  }

  function syncFundTransactions(year, options) {
    return FundSyncService.syncFundTransactions(year, options, fundSyncContext_());
  }

  function syncFundTransactionMonth(year, month) {
    return FundSyncService.syncFundTransactionMonth(year, month, fundSyncContext_());
  }

  function syncFundLoanOverview(year, month) {
    return FundSyncService.syncFundLoanOverview(year, month, fundSyncContext_());
  }

  function syncAllFundBundles(year) {
    return FundSyncService.syncAllFundBundles(year, fundSyncContext_());
  }

  function syncStartupBundle(formType) {
    return StartupCatalogSyncService.syncStartupBundle(formType, startupCatalogSyncContext_());
  }

  function syncCatalogsBundle(formType) {
    return StartupCatalogSyncService.syncCatalogsBundle(formType, startupCatalogSyncContext_());
  }

  function syncCatalogDataBundle(displaySheetName) {
    return StartupCatalogSyncService.syncCatalogDataBundle(displaySheetName, startupCatalogSyncContext_());
  }

  function syncFundFormOptionsBundle(year) {
    return FundSyncService.syncFundFormOptionsBundle(year, fundSyncContext_());
  }

  function syncFundCatalogBundle(year, group) {
    return FundSyncService.syncFundCatalogBundle(year, group, fundSyncContext_());
  }

  function syncAllFundCatalogBundles(year) {
    return FundSyncService.syncAllFundCatalogBundles(year, fundSyncContext_());
  }

  function syncAllStartupAndCatalogs() {
    return StartupCatalogSyncService.syncAllStartupAndCatalogs(startupCatalogSyncContext_());
  }

  function syncCatalogAfterWrite(displaySheetName) {
    return StartupCatalogSyncService.syncCatalogAfterWrite(displaySheetName, startupCatalogSyncContext_());
  }

  function syncCatalogWriteThrough(displaySheetName) {
    var safeDisplaySheetName = clean_(displaySheetName);
    var results = [];
    var errors = [];
    if (safeDisplaySheetName) {
      runSyncStep_(results, errors, 'catalogData:' + safeDisplaySheetName, function () {
        return syncCatalogDataBundle(safeDisplaySheetName);
      });
    }
    var props = PropertiesService.getScriptProperties();
    props.setProperty(yearPropertyKey_(REALTIME_SWEEP_NEXT_AT_PROP), '0');
    props.setProperty(yearPropertyKey_(REALTIME_TICK_INDEX_KEY), '5');
    var reportRefresh = enqueueManualReportRefresh_({
      months: [],
      full: true,
      verificationPasses: 1,
      source: 'catalog-web:' + safeDisplaySheetName
    });
    return {
      ok: errors.length === 0 && !(reportRefresh && reportRefresh.deferred),
      deferred: true,
      handler: 'syncRealtimeCache',
      synced: results.length,
      errors: errors,
      reportRefresh: reportRefresh
    };
  }

  function syncManageDataBundle(sheetName) {
    return ManageSyncService.syncManageDataBundle(sheetName, manageSyncContext_());
  }

  function syncManageMonthBundle(sheetName, monthKey) {
    return ManageSyncService.syncManageMonthBundle(sheetName, monthKey, manageSyncContext_());
  }

  function syncAllManageDataBundles() {
    return ManageSyncService.syncAllManageDataBundles(manageSyncContext_());
  }

  function syncFullRealtimeCache() {
    var results = [];
    var errors = [];
    runSyncStep_(results, errors, 'startupCatalogs', function () { return syncAllStartupAndCatalogs(); });
    runSyncStep_(results, errors, 'dashboard', function () { return syncDashboard(); });
    runSyncStep_(results, errors, 'reports', function () { return syncAllReportBundles(); });
    runSyncStep_(results, errors, 'fund', function () { return syncAllFundBundles(activeWorkbookYear_()); });
    runSyncStep_(results, errors, 'manageData', function () { return syncAllManageDataBundles(); });
    runSyncStep_(results, errors, 'tripNotifications', function () { return syncTripNotifications(); });
    runSyncStep_(results, errors, 'operationalNotifications', function () { return syncOperationalNotifications(); });
    var syncedAt = new Date().toISOString();
    writeSyncStatus_('realtime_cache', 'system', errors.length ? 'error' : 'ok', errors.length ? JSON.stringify(errors) : 'Realtime cache synced.', syncedAt);
    return {
      ok: errors.length === 0,
      synced: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    };
  }

  function syncRealtimeCache() {
    var tickStartedAt = new Date().getTime();
    try {
      if (typeof SupabaseHttpClient !== 'undefined' && SupabaseHttpClient.getCooldown) {
        var cooldown = SupabaseHttpClient.getCooldown();
        if (cooldown.active) return { ok: false, deferred: true, skipped: true, mode: 'tick', reason: 'Supabase transport cooldown.', retryAtMillis: cooldown.retryAtMillis };
      }
      var props = PropertiesService.getScriptProperties();
      var leaseToken;
      var fairness;
      var startLock = LockService.getScriptLock();
      if (!startLock.tryLock(1000)) {
        return { ok: true, mode: 'tick', skipped: true, reason: 'Realtime start guard is busy.' };
      }
      try {
        if (props.getProperty(REPORT_CACHE_E1_PARITY_RUNNING_PROP) === 'true') {
          return { ok: true, mode: 'tick', skipped: true, reason: 'E1 report cache parity window is active.' };
        }
        var running = {};
        var runningRaw = props.getProperty(yearPropertyKey_(REALTIME_TICK_RUNNING_CACHE_KEY));
        try { running = JSON.parse(runningRaw || '{}'); } catch (ignore) {}
        if (Number(running.expiresAt || 0) > new Date().getTime()) {
          return {
            ok: true,
            mode: 'tick',
            skipped: true,
            reason: 'Previous syncRealtimeCache tick is still running.'
          };
        }
        leaseToken = Utilities.getUuid();
        props.setProperty(yearPropertyKey_(REALTIME_TICK_RUNNING_CACHE_KEY), JSON.stringify({ token: leaseToken, expiresAt: new Date().getTime() + REALTIME_TICK_RUNNING_TTL_SECONDS * 1000 }));
        fairness = Number(props.getProperty(yearPropertyKey_(REALTIME_FAIRNESS_PROP)) || 0) + 1;
        props.setProperty(yearPropertyKey_(REALTIME_FAIRNESS_PROP), String(fairness % 4));
      } finally {
        startLock.releaseLock();
      }

    } catch (startError) {
      if (!isTransientGoogleError_(startError) && !startError.transportDeferred && !startError.refreshDeferred) throw startError;
      console.log('realtime_start_deferred:ownership_retained');
      return { ok: false, deferred: true, skipped: true, mode: 'tick', reason: 'Realtime admission deferred; ownership retained.' };
    }

    var tickResult;
    try {
      tickResult = SupabaseSyncStatusRepository.withBatch
        ? SupabaseSyncStatusRepository.withBatch(function () { return runRealtimeTick_(props, fairness, tickStartedAt); })
        : runRealtimeTick_(props, fairness, tickStartedAt);
      return tickResult;
    } catch (error) {
      if (!error || !(error.refreshDeferred || error.transportDeferred || isTransientGoogleError_(error))) throw error;
      tickResult = { ok: false, deferred: true, mode: 'tick', error: 'Realtime deferred; durable scope/ownership retained.', retryAtMillis: error.retryAtMillis || 0 };
      console.log('realtime_tick_deferred');
      return tickResult;
    } finally {
      try {
        var releaseLock = LockService.getScriptLock();
        if (releaseLock.tryLock(1000)) {
          try {
            var currentLease = JSON.parse(props.getProperty(yearPropertyKey_(REALTIME_TICK_RUNNING_CACHE_KEY)) || '{}');
            if (currentLease.token === leaseToken) props.deleteProperty(yearPropertyKey_(REALTIME_TICK_RUNNING_CACHE_KEY));
          } finally { releaseLock.releaseLock(); }
        }
      } catch (error) {
        if (!isTransientGoogleError_(error)) throw error;
        if (tickResult) { tickResult.ok = false; tickResult.releaseDeferred = true; }
        console.log('realtime_release_deferred:ownership_retained');
      }
    }
  }

  function runRealtimeTick_(props, fairness, tickStartedAt) {
      var nowMillis = new Date().getTime();
      drainSheetChangeSignals_(props);
      enqueueSafetySweepIfDue_(props, nowMillis);
      if (Number(props.getProperty(yearPropertyKey_(REALTIME_HEARTBEAT_NEXT_AT_PROP)) || 0) <= nowMillis) {
        writeRealtimeHeartbeatIfDue_(props, nowMillis,
          { pending: !!ManualReportRefreshQueueService.getPending(manualReportRefreshQueueContext_()) },
          { pending: !!ManualReportRefreshQueueService.getPending(fundRefreshQueueContext_()) });
      }
      // Even a sustained edit burst must leave turns for polling/notifications.
      if (fairness % 4 === 0 || props.getProperty(yearPropertyKey_('SUPABASE_NOTIFICATION_PIPELINE_CURSOR_V1')) || props.getProperty(yearPropertyKey_(SOURCE_POLL_CURSOR_PROP))) {
        var background = runRealtimeHousekeeping_(props, nowMillis, tickStartedAt + 60000);
        if (background.checked && new Date().getTime() - tickStartedAt >= 60000) return background;
      }
      var pendingWork = ManualReportRefreshQueueService.claimNextDue([
        { key: 'transport', context: manualReportRefreshQueueContext_() },
        { key: 'fund', context: fundRefreshQueueContext_() }
      ], props.getProperty(yearPropertyKey_(REALTIME_QUEUE_PREFERENCE_PROP)) || 'transport');
      if (pendingWork.due) {
        props.setProperty(yearPropertyKey_(REALTIME_QUEUE_PREFERENCE_PROP), pendingWork.nextPreferredKey);
      }
      var pendingClaim = pendingWork.claims.transport || { due: false, pending: false };
      var pendingFundClaim = pendingWork.claims.fund || { due: false, pending: false };
      writeRealtimeHeartbeatIfDue_(props, nowMillis, pendingClaim, pendingFundClaim);
      var primaryBudget = Math.min(45000, 60000 - (new Date().getTime() - tickStartedAt));
      if (primaryBudget < REALTIME_STAGE_START_MIN_BUDGET_MS && pendingWork.due) {
        // The coordinator already claimed the item: yield without executing it.
        ManualReportRefreshQueueService.saveProgress(pendingWork.item,
          pendingWork.key === 'fund' ? fundRefreshQueueContext_() : manualReportRefreshQueueContext_(), 0);
        return { ok: true, mode: 'tick', skipped: true, reason: 'Tick yielded before refresh stage without safe runway.' };
      }
      if (pendingWork.key === 'transport') {
        var transportResult = runPendingTransportReportSync_(pendingWork.item, primaryBudget, tickStartedAt + 60000);
        return finishRealtimeRefresh_(runCompanionRefresh_(transportResult, 'fund', tickStartedAt), background);
      }
      if (pendingWork.key === 'fund') {
        var fundResult = runPendingFundSync_(pendingWork.item, primaryBudget, tickStartedAt + 60000);
        return finishRealtimeRefresh_(runCompanionRefresh_(fundResult, 'transport', tickStartedAt), background);
      }

      if (background && background.checked) return background;
      var housekeeping = runRealtimeHousekeeping_(props, nowMillis, tickStartedAt + 60000);
      if (housekeeping.checked) return housekeeping;

      return {
        ok: true, mode: 'tick', skipped: true,
        reason: 'No due refresh work; safety scopes are processed by durable stages.',
        pendingTransport: pendingClaim.pending === true,
        pendingFund: pendingFundClaim.pending === true
      };
  }

  function finishRealtimeRefresh_(result, background) {
    if (background && background.checked) {
      result.housekeeping = background;
      result.ok = result.ok && background.ok !== false;
    }
    return result;
  }

  // Give both modules progress in a minute when RPCs are short. The whole tick
  // shares a 60s between-stage budget; never start a companion after it expires.
  function runCompanionRefresh_(result, module, startedAt) {
    var remaining = 60000 - (new Date().getTime() - startedAt);
    if (!result.ok || remaining < REALTIME_STAGE_START_MIN_BUDGET_MS) return result;
    var context = module === 'fund' ? fundRefreshQueueContext_() : manualReportRefreshQueueContext_();
    var next = ManualReportRefreshQueueService.claimDue(context);
    if (!next.due) return result;
    var companion = module === 'fund' ? runPendingFundSync_(next.item, remaining, startedAt + 60000)
      : runPendingTransportReportSync_(next.item, remaining, startedAt + 60000);
    result.companion = companion;
    result.ok = result.ok && companion.ok;
    return result;
  }

  function runRealtimeHousekeeping_(props, nowMillis, deadlineMillis) {
    var index = Number(props.getProperty(yearPropertyKey_(REALTIME_HOUSEKEEPING_INDEX_PROP)) || 0) % 3;
    // Notifications get the first due housekeeping turn, including under a
    // sustained queue. Failed pipeline retries still leave three worker turns.
    var notifications = syncTripNotificationsIfDue_(props, nowMillis, deadlineMillis);
    if (notifications && notifications.checked) {
      return { ok: notifications.ok !== false, mode: 'tick', checked: true, step: 'housekeeping:notifications', result: notifications };
    }
    var steps = [enqueueDetectedReportOutputChangesIfDue_, enqueueDetectedSourceChangesIfDue_];
    index = index % steps.length;
    for (var offset = 0; offset < steps.length; offset++) {
      var selected = (index + offset) % steps.length;
      var result = steps[selected](props, nowMillis, deadlineMillis);
      if (result && result.checked) {
        props.setProperty(yearPropertyKey_(REALTIME_HOUSEKEEPING_INDEX_PROP), String((selected + 1) % steps.length));
        return { ok: result.ok !== false, mode: 'tick', checked: true, step: 'housekeeping:' + selected, result: result };
      }
    }
    return { checked: false };
  }

  function syncTripNotifications() {
    return TripNotificationSyncService.sync(tripNotificationSyncContext_());
  }

  function syncOperationalNotifications() {
    return OperationalNotificationSyncService.sync(tripNotificationSyncContext_());
  }

  function syncDailyBusinessSummary() {
    return DailyBusinessSummaryService.sync(tripNotificationSyncContext_());
  }

  function dispatchNotifications() {
    return NotificationDispatchService.dispatch(tripNotificationSyncContext_());
  }

  function syncTripNotificationsIfDue_(props, nowMillis, deadlineMillis) {
    return NotificationPipelineService.run({
      nowMillis: nowMillis,
      nowISOString: new Date(nowMillis).toISOString(),
      nextAtKey: yearPropertyKey_(TRIP_NOTIFICATION_NEXT_AT_PROP),
      cursorKey: yearPropertyKey_('SUPABASE_NOTIFICATION_PIPELINE_CURSOR_V1'),
      now: function () { return new Date().getTime(); },
      deadlineMillis: Math.min(deadlineMillis || Infinity, new Date().getTime() + 45000),
      failureCountKey: yearPropertyKey_(NOTIFICATION_PIPELINE_FAILURE_COUNT_PROP),
      intervalMs: TRIP_NOTIFICATION_INTERVAL_MS,
      retryMs: SOURCE_POLL_RETRY_MS,
      failureThreshold: NOTIFICATION_PIPELINE_FAILURE_THRESHOLD,
      getProperty: function (key) { return props.getProperty(key); },
      setProperty: function (key, value) { props.setProperty(key, value); },
      deleteProperty: function (key) { props.deleteProperty(key); },
      runStep: runSyncStep_,
      syncTripNotifications: function () { return syncTripNotifications(); },
      syncOperationalNotifications: function () { return syncOperationalNotifications(); },
      syncDailyBusinessSummary: function () { return syncDailyBusinessSummary(); },
      dispatchNotifications: function () { return dispatchNotifications(); },
      writeStatus: writeSyncStatus_,
      log: function (message) { console.log(message); }
    });
  }

  function enqueueDetectedSourceChangesIfDue_(props, nowMillis, deadlineMillis) {
    var sourcePollNextAtKey = yearPropertyKey_(SOURCE_POLL_NEXT_AT_PROP);
    var sourcePollCursorKey = yearPropertyKey_(SOURCE_POLL_CURSOR_PROP);
    var nextAt = Number(props.getProperty(sourcePollNextAtKey) || 0);
    if (nextAt > nowMillis) return { checked: false };
    var deadline = Math.min(deadlineMillis || Infinity, new Date().getTime() + 45000);
    var sources = [
      { key: 'transport', spreadsheetId: APP_CONFIG.spreadsheetId, sheetName: 'NL_VanChuyen', width: 8, kind: 'transport' },
      { key: 'fuel', spreadsheetId: APP_CONFIG.spreadsheetId, sheetName: 'NL_Dau', kind: 'transport' },
      { key: 'payroll_history', spreadsheetId: APP_CONFIG.spreadsheetId, sheetName: 'DM_LichSuNhanSu', width: 12, kind: 'transport' },
      { key: 'payroll_recruitment_totals', spreadsheetId: APP_CONFIG.spreadsheetId, sheetName: 'SYS_AggThuongTuyen', width: 4, kind: 'transport' },
      { key: 'fund_transactions', spreadsheetId: activeFundSpreadsheetId_(), sheetName: 'NHAP_THUCHI', width: 14, kind: 'fund', transformVersion: 'non-fund-v1' },
      { key: 'fund_loans', spreadsheetId: activeFundSpreadsheetId_(), sheetName: 'NHAP_VAY', width: 14, kind: 'fund', transformVersion: 'non-fund-v1' }
    ];
    var changed = [];
    var cursor = Number(props.getProperty(sourcePollCursorKey) || 0);
    if (!(cursor >= 0 && cursor < sources.length && Math.floor(cursor) === cursor)) cursor = 0;
    for (; cursor < sources.length; cursor++) {
      if (new Date().getTime() >= deadline) return { checked: true, ok: true, continuing: true, changed: changed };
      var source = sources[cursor];
      try {
        var state = readSourceFingerprintState_(source);
        var propertyKey = yearPropertyKey_(SOURCE_FINGERPRINT_PREFIX + source.key.toUpperCase());
        var previous = SourceFingerprintService.parse(props.getProperty(propertyKey));
        var changeSet = SourceFingerprintService.diff(previous, state);
        if (changeSet.changed) {
          changed.push({ key: source.key, months: changeSet.months, lastRow: state.lastRow, full: changeSet.full });
          var queued = null;
          if (source.kind === 'transport') {
            queued = enqueueManualReportRefresh_({ months: changeSet.months, full: changeSet.full || !changeSet.months.length, sheets: isManageSheetName_(source.sheetName) ? [source.sheetName] : [], source: 'poll:' + source.key });
          } else {
            queued = enqueueRefreshWithFallback_({
              months: changeSet.months,
              full: changeSet.full || !changeSet.months.length,
              source: 'poll:' + source.key
            }, fundRefreshQueueContext_(), 'fund:' + source.key);
            if (source.key === 'fund_transactions') {
              var downstream = enqueueManualReportRefresh_({
                months: changeSet.months,
                full: changeSet.full || !changeSet.months.length,
                refreshDashboard: true,
                delayMs: FUND_TO_TRANSPORT_DELAY_MS,
                verificationPasses: 1,
                source: 'poll:fund-downstream'
              });
              if (downstream && downstream.deferred) queued = downstream;
            }
          }
          if (queued && queued.deferred) throw new Error(queued.error || 'Refresh queue was deferred.');
          props.setProperty(propertyKey, SourceFingerprintService.serialize(state));
        }
        props.setProperty(sourcePollCursorKey, String(cursor + 1));
      } catch (err) {
        props.setProperty(sourcePollNextAtKey, String(nowMillis + SOURCE_POLL_RETRY_MS));
        console.log('source_poll_failed:' + source.key);
        return { checked: true, ok: false, continuing: true, changed: changed, source: source.key };
      }
    }
    props.deleteProperty(sourcePollCursorKey);
    props.setProperty(sourcePollNextAtKey, String(new Date().getTime() + SOURCE_POLL_INTERVAL_MS));
    return { checked: true, changed: changed };
  }

  function enqueueDetectedReportOutputChangesIfDue_(props, nowMillis) {
    var reportPollNextAtKey = yearPropertyKey_(REPORT_OUTPUT_POLL_NEXT_AT_PROP);
    var nextAt = Number(props.getProperty(reportPollNextAtKey) || 0);
    if (nextAt > nowMillis) return { checked: false };
    props.setProperty(reportPollNextAtKey, String(nowMillis + REPORT_OUTPUT_POLL_INTERVAL_MS));
    try {
      var result = enqueueDetectedReportOutputChanges_(props);
      result.checked = true;
      return result;
    } catch (err) {
      props.setProperty(reportPollNextAtKey, String(nowMillis + SOURCE_POLL_RETRY_MS));
      console.log('source_poll_failed:report_outputs: ' + (err && err.message ? err.message : err));
      return { checked: true, changed: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function enqueueDetectedReportOutputChanges_(props) {
    var state = readReportOutputState_();
    var reportOutputFingerprintKey = yearPropertyKey_(REPORT_OUTPUT_FINGERPRINT_PROP);
    var previous = ReportOutputFreshnessService.parseFingerprintMap(props.getProperty(reportOutputFingerprintKey));
    var changedMonths = ReportOutputFreshnessService.changedMonths(previous, state.fingerprints);
    if (!changedMonths.length) return { key: 'report_outputs', changed: false, months: [] };
    var queued = enqueueManualReportRefresh_({
      months: changedMonths,
      full: false,
      includeAll: true,
      source: 'poll:report-outputs'
    });
    if (queued && queued.deferred) throw new Error(queued.error || 'Report output refresh queue was deferred.');
    props.setProperty(reportOutputFingerprintKey, JSON.stringify(state.fingerprints));
    return { key: 'report_outputs', changed: true, months: changedMonths, rows: state.rows };
  }

  function readReportOutputState_() {
    var started = new Date().getTime();
    console.log('report_output_read_start');
    var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var tables = ReportTableService.readFreshnessTables(ss);
    var state = ReportOutputFreshnessService.buildState(tables, {
      resolveMonthKey: function (value) {
        var date = parseDateValue_(value);
        return date ? Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM') : normalizeYearMonthKey_(value);
      },
      hash: sha256Hex_
    });
    console.log('report_output_read_done:' + (new Date().getTime() - started) + 'ms');
    return state;
  }

  function sha256Hex_(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || '')).map(function (item) {
      var byte = item < 0 ? item + 256 : item;
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }

  function readSourceFingerprintState_(source) {
    var started = new Date().getTime();
    console.log('source_fingerprint_start:' + source.key);
    var sheet = SpreadsheetApp.openById(source.spreadsheetId).getSheetByName(source.sheetName);
    if (!sheet) throw new Error('Không tìm thấy sheet ' + source.sheetName + '.');
    var lastRow = Math.max(1, Number(sheet.getLastRow() || 1));
    var numRows = Math.max(0, lastRow - 1);
    var values = numRows ? sheet.getRange(2, 1, numRows, source.width || sheet.getLastColumn()).getValues() : [];
    var state = SourceFingerprintService.build(values, {
      resolveMonthKey: function (value) {
        var date = parseDateValue_(value);
        return date ? Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM') : '';
      },
      hash: sha256Hex_,
      versionTag: source.transformVersion || ''
    });
    state.lastRow = lastRow;
    console.log('source_fingerprint_done:' + source.key + ':' + (new Date().getTime() - started) + 'ms:rows=' + numRows);
    return state;
  }

  function enqueueSafetySweepIfDue_(props, nowMillis) {
    var nextAt = Number(props.getProperty(yearPropertyKey_(REALTIME_SWEEP_NEXT_AT_PROP)) || 0);
    if (nextAt > nowMillis) return { queued: false };
    var transport = enqueueManualReportRefresh_({ full: true, sheets: MANAGE_SHEET_NAMES,
      catalogs: TRANSPORT_CATALOG_SHEET_NAMES.map(function (sheet) { return sheet === 'DM_ThamSo' ? 'DM_ThamSo_TS' : sheet; }),
      verificationPasses: 1, source: 'safety:transport' });
    if (transport.deferred) throw new Error(transport.error || 'Safety transport enqueue failed.');
    var fund = enqueueRefreshWithFallback_({ full: true, source: 'safety:fund' }, fundRefreshQueueContext_(), 'fund');
    if (fund.deferred) throw new Error(fund.error || 'Safety fund enqueue failed.');
    // A completed enqueue covers every scope; there is no 14-hour index cycle.
    props.setProperty(yearPropertyKey_(REALTIME_SWEEP_NEXT_AT_PROP), String(nowMillis + REALTIME_SWEEP_INTERVAL_MS));
    return { queued: true };
  }

  function sheetSignalContext_(props) {
    return { year: activeWorkbookYear_(), getProperty: function (key) { return props.getProperty(key); },
      setProperty: function (key, value) { props.setProperty(key, value); },
      nowMillis: function () { return new Date().getTime(); }, createUuid: function () { return Utilities.getUuid(); } };
  }

  function drainSheetChangeSignals_(props) {
    ['transport', 'fund'].forEach(function (module) {
      if (!props.getProperty('SUPABASE_SHEET_SIGNAL_' + module.toUpperCase() + '_' + activeWorkbookYear_())) return;
      var context = sheetSignalContext_(props);
      context.enqueue = function (signal) {
        var scopes = signal && signal.eventType === 'EDIT' && Array.isArray(signal.scopes) ? signal.scopes : [];
        if (module === 'transport' && scopes.length) {
          var transportResult;
          var transportSpreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
          var transportSheetNames = buildSignalSheetNameMap_(transportSpreadsheet);
          scopes.forEach(function (scope) {
            var sheetName = resolveSignalScopeSheetName_(transportSheetNames, scope);
            transportResult = syncTransportSheetChange(signal.eventType, sheetName, null);
            if (transportResult && transportResult.skipped) transportResult = syncUnknownTransportSheetChange_(signal.eventType);
          });
          return transportResult || { queued: false };
        }
        if (module === 'transport') return enqueueManualReportRefresh_({ full: true, sheets: MANAGE_SHEET_NAMES,
          catalogs: TRANSPORT_CATALOG_SHEET_NAMES.map(function (sheet) { return sheet === 'DM_ThamSo' ? 'DM_ThamSo_TS' : sheet; }),
          verificationPasses: 1, source: 'signal:transport:' + signal.eventType });
        if (scopes.length) {
          var fundSpreadsheet = SpreadsheetApp.openById(activeFundSpreadsheetId_());
          var fundSheetNames = buildSignalSheetNameMap_(fundSpreadsheet);
          var fundResult;
          var fundDeferred = null;
          scopes.forEach(function (scope) {
            var sheetName = resolveSignalScopeSheetName_(fundSheetNames, scope);
            var sheet = sheetName ? fundSpreadsheet.getSheetByName(sheetName) : null;
            var range = sheet && Number(scope.startRow || 0) > 0 && Number(scope.numRows || 0) > 0
              ? sheet.getRange(Number(scope.startRow), 1, Number(scope.numRows), 1) : null;
            fundResult = syncFundSheetChange(signal.eventType, sheetName, range);
            if (fundResult && fundResult.fundRefresh && fundResult.fundRefresh.deferred) fundDeferred = fundResult.fundRefresh;
            if (fundResult && fundResult.reportRefresh && fundResult.reportRefresh.deferred) fundDeferred = fundResult.reportRefresh;
          });
          if (fundDeferred) return fundDeferred;
          props.setProperty(yearPropertyKey_(REALTIME_QUEUE_PREFERENCE_PROP), 'transport');
          return { queued: true, result: fundResult };
        }
        var fund = enqueueRefreshWithFallback_({ full: true, source: 'signal:fund:' + signal.eventType }, fundRefreshQueueContext_(), 'fund');
        if (fund.deferred) return fund;
        var downstream = enqueueManualReportRefresh_({ full: true, refreshDashboard: true, delayMs: FUND_TO_TRANSPORT_DELAY_MS,
          verificationPasses: 1, source: 'signal:fund-downstream' });
        return downstream.deferred ? downstream : fund;
      };
      SheetChangeSignalService.drain(module, context);
    });
  }

  function registerSheetTriggerBindings() {
    var context = sheetSignalContext_(PropertiesService.getScriptProperties());
    context.handlers = {
      handleTransportSheetEdit: { spreadsheetId: APP_CONFIG.spreadsheetId, eventType: 'ON_EDIT' },
      handleTransportSheetChange: { spreadsheetId: APP_CONFIG.spreadsheetId, eventType: 'ON_CHANGE' },
      handleFundSheetEdit: { spreadsheetId: activeFundSpreadsheetId_(), eventType: 'ON_EDIT' },
      handleFundSheetChange: { spreadsheetId: activeFundSpreadsheetId_(), eventType: 'ON_CHANGE' }
    };
    return SheetChangeSignalService.register(ScriptApp.getProjectTriggers(), context);
  }

  function buildSignalSheetNameMap_(spreadsheet) {
    var result = {};
    if (!spreadsheet || !spreadsheet.getSheets) return result;
    spreadsheet.getSheets().forEach(function (sheet) {
      result[String(sheet.getSheetId())] = sheet.getName();
    });
    return result;
  }

  function resolveSignalScopeSheetName_(sheetNamesByGridId, scope) {
    if (scope && scope.sheetName) return clean_(scope.sheetName);
    if (!scope || scope.gridId === null || scope.gridId === undefined) return '';
    var gridId = Number(scope.gridId);
    return gridId >= 0 ? clean_((sheetNamesByGridId || {})[String(gridId)]) : '';
  }

  function writeRealtimeHeartbeatIfDue_(props, nowMillis, pendingTransport, pendingFund) {
    var realtimeHeartbeatKey = yearPropertyKey_(REALTIME_HEARTBEAT_NEXT_AT_PROP);
    var nextAt = Number(props.getProperty(realtimeHeartbeatKey) || 0);
    if (nextAt > nowMillis) return;
    props.setProperty(realtimeHeartbeatKey, String(nowMillis + REALTIME_HEARTBEAT_INTERVAL_MS));
    writeSyncStatus_(
      'realtime_cache_worker',
      'system',
      'ok',
      'Worker alive; transport pending=' + (pendingTransport.pending === true) + ', fund pending=' + (pendingFund.pending === true) + '.',
      new Date(nowMillis).toISOString()
    );
  }

  function enqueueManualReportRefresh_(options) {
    return enqueueRefreshWithFallback_(options || {}, manualReportRefreshQueueContext_(), 'transport');
  }

  function requestPayrollExplanationRefresh(month) {
    var normalizedMonth = PayrollExplanationService.normalizeMonth(month);
    if (!normalizedMonth) throw new Error('Tháng giải trình phải có dạng MM/YYYY.');
    var parts = normalizedMonth.split('/');
    var monthKey = parts[1] + '-' + parts[0];
    var queued = enqueueManualReportRefresh_({
      months: [monthKey],
      full: false,
      includeAll: false,
      verificationPasses: 0,
      source: 'payroll-explanation-stale'
    });
    if (!queued || queued.deferred || queued.queued === false) {
      throw new Error((queued && queued.error) || 'Không thể đưa giải trình lương vào hàng đợi đồng bộ.');
    }
    return { ok: true, queued: true, reportMonth: normalizedMonth };
  }

  function enqueueRefreshWithFallback_(options, context, queueName) {
    try {
      var queued = ManualReportRefreshQueueService.enqueue(options || {}, context);
      writeSyncStatus_(
        'refresh_queue_deferred:' + clean_(queueName),
        'system',
        'ok',
        'Refresh request queued successfully.',
        new Date().toISOString()
      );
      return queued;
    } catch (err) {
      var message = err && err.message ? err.message : String(err);
      PropertiesService.getScriptProperties().setProperty(yearPropertyKey_(SOURCE_POLL_NEXT_AT_PROP), '0');
      try {
        writeSyncStatus_('refresh_queue_deferred:' + clean_(queueName), 'system', 'error', message, new Date().toISOString());
      } catch (statusError) {
        console.log('refresh_queue_status_failed:' + (statusError && statusError.message ? statusError.message : statusError));
      }
      console.log('refresh_queue_deferred:' + clean_(queueName) + ': ' + message);
      return { queued: false, deferred: true, error: message };
    }
  }

  function getPendingTransportReportRefresh() {
    return {
      ok: true,
      pending: ManualReportRefreshQueueService.getPending(manualReportRefreshQueueContext_())
    };
  }

  function getPendingFundRefresh() {
    return {
      ok: true,
      pending: ManualReportRefreshQueueService.getPending(fundRefreshQueueContext_())
    };
  }

  function auditManualReportFreshnessQueue() {
    var status = getSupabaseSyncStatus(20, 'transport');
    var result = {
      ok: true,
      pending: ManualReportRefreshQueueService.getPending(manualReportRefreshQueueContext_()),
      status: (status.rows || []).filter(function (row) {
        return row.syncKey === 'transport_reports_manual_sheet';
      }).slice(0, 1),
      checkedAt: new Date().toISOString()
    };
    console.log('E1.6 audit: ' + JSON.stringify(result));
    return result;
  }

  function runPendingTransportReportSync_(pending, budgetMs, deadlineMillis) {
    return withInternalReportRefreshGuard_(function () {
      return runPendingTransportReportSyncUnguarded_(pending, budgetMs, deadlineMillis);
    });
  }

  function runPendingTransportReportSyncUnguarded_(pending, budgetMs, deadlineMillis) {
    var context = manualReportRefreshQueueContext_();
    var polledTransport = (pending.sources || []).some(function (source) { return source === 'poll:transport'; });
    if (polledTransport && !Array.isArray(pending.tasks)) {
      pending.sheets = (pending.sheets || []).concat(['NL_VanChuyen']);
    }
    var workerContext = {
      nowMillis: context.nowMillis,
      planVersion: 3,
      currentMonth: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'yyyy-MM'),
      maxStages: 30,
      minStageStartBudgetMs: REALTIME_STAGE_START_MIN_BUDGET_MS,
      turnBudgetMs: budgetMs || 45000,
      deadlineMillis: deadlineMillis,
      claimNext: function () { return ManualReportRefreshQueueService.claimDue(context); },
      saveProgress: function (item, delay) { return ManualReportRefreshQueueService.saveProgress(item, context, delay); },
      acknowledge: function (item) { return ManualReportRefreshQueueService.acknowledge(item, context); },
      requeue: function (item) { return ManualReportRefreshQueueService.requeue(item, context); },
      enqueueVerification: function (item) {
        var queued = enqueueManualReportRefresh_({
          full: item.full === true, includeAll: item.includeAll !== false,
          months: item.months || [], delayMs: TRANSPORT_REPORT_VERIFICATION_DELAY_MS,
          verificationPasses: Number(item.verificationPasses || 0) - 1,
          source: 'verification:report-formulas'
        });
        if (queued.deferred) throw new Error(queued.error || 'Verification refresh was deferred.');
      },
      manageMonths: function (sheet) { return ManageSyncService.getManageRefreshMonthKeys(sheet, manageSyncContext_()); },
      reportMonths: function () { return getReportMonths_().map(normalizeYearMonthKey_).filter(Boolean); },
      syncManage: syncManageDataBundle,
      syncManageMonth: syncManageMonthBundle,
      catalogForms: (pending.catalogs || []).length ? StartupCatalogSyncService.getCatalogFormTypes() : [],
      syncCatalog: syncCatalogDataBundle,
      syncCatalogOptions: syncCatalogsBundle,
      syncStartup: function () { return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE); },
      syncDashboard: syncDashboard,
      syncReport: function (month) { return syncReportBundle(month === 'Tất cả' ? 'Tất cả' : formatMonthKeyForReport_(month)); },
      writeStatus: function (status, message) { writeSyncStatus_('transport_reports_manual_sheet', 'transport', status, message, new Date().toISOString()); },
      log: function (message) { console.log(message); }
    };
    if (TransportSourceProbeService.eligible(pending) || pending.inputHashes) {
      var probeReader = TransportSourceProbeService.createReader({
        openSpreadsheet: function () { return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId); },
        nowMillis: context.nowMillis,
        log: workerContext.log,
        hash: sha256Hex_,
        monthKeys: function (sheet, values, display) {
          return MANAGE_SHEET_NAMES.indexOf(sheet) >= 0
            ? ManageSyncService.getManageMonthKeysFromSnapshot(sheet, values, display, manageSyncContext_()) : [];
        }
      });
      workerContext.buildTasks = function (item) {
        var sources = MANAGE_SHEET_NAMES.map(function (sheet) { return { sheet: sheet, kind: 'manage' }; })
          .concat(TRANSPORT_CATALOG_SHEET_NAMES.map(function (sheet) {
            return { sheet: sheet, kind: 'catalog', display: sheet === 'DM_ThamSo' ? 'DM_ThamSo_TS' : sheet };
          }))
          .concat([{ sheet: 'DM_LichSuNhanSu', kind: 'report' }, { sheet: 'SYS_AggThuongTuyen', kind: 'report' }]);
        return TransportSourceProbeService.tasks(item, sources);
      };
      workerContext.runTask = function (task, item) {
        return TransportSourceProbeService.run(task, item, {
          getProperty: context.getProperty, setProperty: context.setProperty,
          measure: probeReader.measure,
          currentMonth: workerContext.currentMonth,
          commit: function (fn) { return ManualReportRefreshQueueService.withOwnedLease(item, context, fn); },
          cachePresent: function (task) {
            if (task[2] === 'catalog') {
              return SupabaseBundleRepository.readRows('catalog_bundles', {
                select: 'catalog_key', catalog_key: 'eq.' + buildCatalogDataKey_(task[3]), limit: 1
              }).length === 1;
            }
            if (task[2] !== 'manage') return true;
            var expected = ['recent_500'].concat(probeReader.monthKeys(task[1]).map(function (month) { return 'month:' + month; }));
            var found = []; var rows; var offset = 0;
            do {
              rows = SupabaseBundleRepository.readRows('manage_data_bundles', {
                select: 'filter_key', sheet_name: 'eq.' + activeWorkbookYear_() + ':' + task[1], order: 'filter_key.asc', limit: 100, offset: offset
              });
              if (!Array.isArray(rows)) throw new Error('Invalid manage cache index.');
              found = found.concat(rows.map(function (row) { return row.filter_key; }));
              offset += rows.length;
            } while (rows.length === 100);
            return expected.every(function (key) { return found.indexOf(key) >= 0; });
          },
          safetyCatalogTasks: function () { return workerContext.catalogForms.map(function (form) { return ['catalogOptions', form]; }).concat([['startup']]); },
          readHash: probeReader.readHash,
          buildCacheTasks: function (scope) { return TransportRefreshWorker.buildCacheTasks(scope, workerContext); }
        });
      };
    }
    return TransportRefreshWorker.run(pending, workerContext);
  }

  function runPendingFundSync_(pending, budgetMs, deadlineMillis) {
    var context = fundRefreshQueueContext_();
    var year = activeWorkbookYear_();
    var props = PropertiesService.getScriptProperties();
    var captureContext = {
      uuid: function () { return Utilities.getUuid(); }, hash: sha256Hex_, cache: CacheService.getScriptCache(),
      stamp: function () { var year = activeWorkbookYear_(); return (props.getProperty('SUPABASE_SHEET_SIGNAL_FUND_' + year) || '') + '|' + (props.getProperty('FUND_DATA_VERSION_V1_' + year) || (year === '2026' ? props.getProperty('FUND_DATA_VERSION_V1') : '') || ''); },
      read: function (part, startRow, limit) { return FundService.readOverviewSourcePage(year, part, startRow, limit); }
    };
    var transactionCaptureContext = {
      uuid: captureContext.uuid, hash: sha256Hex_, cache: captureContext.cache, stamp: captureContext.stamp,
      readPage: function (row) { return FundService.readTransactionSourcePage(year, row); },
      begin: function (month) { return FundService.beginTransactionCapture(year, { month: month, limit: month ? 1000 : 500, completeCapture: Boolean(month) }); },
      append: function (state, page, month) { return FundService.appendTransactionCapture(state, page, { month: month }); },
      finish: function (state) { return FundTransactionService.finishCapture(state); },
      publish: function (month, payload) { return FundSyncService.syncFundTransactions(year, { month: month, limit: month ? 1000 : 500 }, fundSyncContext_(null, payload)); },
      log: function (message) { console.log(message); }
    };
    function monthTasks(months) {
      var tasks = [];
      months.forEach(function (month) {
        tasks.push(['fundOverview', month], ['fundTransactions', month], ['fundLoans', month]);
      });
      return tasks;
    }
    return TransportRefreshWorker.run(pending, {
      step: 'fundPending', planVersion: 3, nowMillis: context.nowMillis, maxStages: 30,
      minStageStartBudgetMs: REALTIME_STAGE_START_MIN_BUDGET_MS,
      turnBudgetMs: budgetMs || 45000, deadlineMillis: deadlineMillis,
      shouldYieldAfterStage: function (result) {
        return /^(fundCapture|fundTransactionsScan):/.test(result.stage || '') && Number(result.elapsedMs || 0) >= 25000;
      },
      claimNext: function () { return ManualReportRefreshQueueService.claimDue(context); },
      saveProgress: function (item, delay) { return ManualReportRefreshQueueService.saveProgress(item, context, delay); },
      acknowledge: function (item) { return ManualReportRefreshQueueService.acknowledge(item, context); },
      requeue: function (item) { return ManualReportRefreshQueueService.requeue(item, context); },
      buildTasks: function (item) {
        var priorityMonths = (item.priorityMonths || item.months || []).map(normalizeYearMonthKey_).filter(Boolean);
        var currentMonth = Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'yyyy-MM');
        if (priorityMonths.indexOf(currentMonth) < 0) priorityMonths.push(currentMonth);
        item.priorityMonths = priorityMonths.sort().reverse();
        // Publish the lists the browser reads before paged overview capture.
        var tasks = [['fundTransactions', ''], ['fundLoans', '']];
        priorityMonths.forEach(function (month) { tasks.push(['fundTransactions', month], ['fundLoans', month]); });
        tasks.push(FundOverviewSnapshotService.start(item, captureContext), ['fundOverview', '']);
        priorityMonths.forEach(function (month) { tasks.push(['fundOverview', month]); });
        tasks.push(['background']);
        if (item.full === true) {
          tasks.push(['fundDiscover']);
          tasks.push(['fundOptions']);
          ['incomeCategories', 'expenseCategories', 'actors', 'partners', 'loanPartners'].forEach(function (group) {
            tasks.push(['fundCatalog', group]);
          });
        } else {
          var months = (item.months || []).map(normalizeYearMonthKey_).filter(Boolean);
          if (!months.length) throw new Error('Fund refresh has no valid month scope.');
          tasks = tasks.concat(monthTasks(months.filter(function (month) { return priorityMonths.indexOf(month) < 0; })));
        }
        return tasks;
      },
      runTask: function (task, item) {
        var result;
        var added = [];
        if (task[0] === 'background') { item.background = true; return { result: { ok: true } }; }
        if (task[0] === 'fundCapture') return FundOverviewSnapshotService.run(task, item, captureContext);
        if (/^fundTransactions(?:Scan|Publish)?$/.test(task[0])) return FundTransactionSnapshotService.run(task, item, transactionCaptureContext);
        var snapshot;
        if (task[0] === 'fundOverview' || task[0] === 'fundDiscover') {
          snapshot = FundOverviewSnapshotService.load(item, captureContext);
          if (!snapshot) return { result: { ok: true }, added: [FundOverviewSnapshotService.start(item, captureContext), task] };
        }
        if (task[0] === 'fundOverview') result = FundSyncService.syncFundOverview(year, task[1], fundSyncContext_(snapshot));
        else if (task[0] === 'fundLoans') result = syncFundLoanOverview(year, task[1]);
        else if (task[0] === 'fundOptions') result = syncFundFormOptionsBundle(year);
        else if (task[0] === 'fundCatalog') result = syncFundCatalogBundle(year, task[1]);
        else if (task[0] === 'fundDiscover') {
          // Read the source directly: the legacy month helper swallows read errors.
          var overview = FundService.getFundOverviewFromSnapshot({ month: '' }, snapshot);
          if (!overview || overview.ok === false || !Array.isArray(overview.months)) throw new Error('Fund month discovery failed.');
          var seen = {};
          overview.months.forEach(function (month) {
            var key = normalizeYearMonthKey_(month && month.key);
            if (key) seen[key] = true;
          });
          item.months = Object.keys(seen).concat(item.months || []).filter(function (month, index, all) { return all.indexOf(month) === index; }).sort().reverse();
          if (!item.months.length) throw new Error('Fund month discovery returned no months.');
          added = monthTasks(item.months.filter(function (month) { return (item.priorityMonths || []).indexOf(month) < 0; }));
          result = { ok: true };
        } else throw new Error('Unknown Fund refresh stage: ' + task[0]);
        return { result: result, added: added };
      },
      enqueueVerification: function (item) {
        ManualReportRefreshQueueService.enqueue({ full: item.full === true, months: item.months || [],
          delayMs: TRANSPORT_REPORT_VERIFICATION_DELAY_MS, verificationPasses: Number(item.verificationPasses || 0) - 1,
          source: 'verification:fund-cache' }, context);
      },
      writeStatus: function (status, message) { writeSyncStatus_('fund_manual_sheet', 'fund', status, message, new Date().toISOString()); },
      log: function (message) { console.log(message); }
    });
  }

  function syncTransportAfterWrite(sheetName, rows, options) {
    var results = [];
    var errors = [];
    var fastMode = options && options.fast === true;
    var safeSheetName = clean_(sheetName);
    var touchedMonthKeys = getTransportRowsMonthKeys_(rows);
    if (!fastMode) {
      runSyncStep_(results, errors, 'dashboard', function () { return syncDashboard(); });
      runSyncStep_(results, errors, 'latestReport', function () { return syncReportBundle('latest'); });
      runSyncStep_(results, errors, 'startup', function () { return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE); });
    }
    if (safeSheetName && safeSheetName.indexOf('NL_') === 0) {
      runSyncStep_(results, errors, 'manageData:' + safeSheetName, function () { return syncManageDataBundle(safeSheetName); });
      touchedMonthKeys.forEach(function (monthKey) {
        runSyncStep_(results, errors, 'manageData:' + safeSheetName + ':' + monthKey, function () {
          return syncManageMonthBundle(safeSheetName, monthKey);
        });
      });
      if (!fastMode) {
        touchedMonthKeys.forEach(function (monthKey) {
          runSyncStep_(results, errors, 'report:' + monthKey, function () {
            return syncReportBundle(formatMonthKeyForReport_(monthKey));
          });
        });
        getRecentManageMonthKeys_(safeSheetName, 2).forEach(function (monthKey) {
          runSyncStep_(results, errors, 'manageDataRecent:' + safeSheetName + ':' + monthKey, function () {
            return syncManageMonthBundle(safeSheetName, monthKey);
          });
          if (!touchedMonthKeys.length) {
          runSyncStep_(results, errors, 'reportRecent:' + monthKey, function () {
            return syncReportBundle(formatMonthKeyForReport_(monthKey));
          });
          }
        });
      }
    }
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, errors: errors };
  }

  function syncTransportReportsAfterWrite(sheetName, rows, options) {
    return ReportSyncService.syncTransportReportsAfterWrite(sheetName, rows, options, reportSyncContext_());
  }

  function syncTransportSheetChange(eventType, sheetName, editedRange) {
    var safeSheetName = clean_(sheetName);
    var catalog = TRANSPORT_CATALOG_SHEET_NAMES.indexOf(safeSheetName) !== -1;
    var manage = isManageSheetName_(safeSheetName);
    if (!catalog && !manage) return { ok: true, skipped: true, reason: 'Sheet is not a transport input sheet.' };
    // No Sheet reads, cache rebuilds or network calls on the edit trigger.
    var queued = ManualReportRefreshQueueService.enqueue({
      sheets: manage ? [safeSheetName] : [],
      catalogs: catalog ? [safeSheetName === 'DM_ThamSo' ? 'DM_ThamSo_TS' : safeSheetName] : [],
      full: true,
      includeAll: true, verificationPasses: 1,
      source: 'sheet:' + safeSheetName + ':' + (clean_(eventType) || 'UNKNOWN')
    }, manualReportRefreshQueueContext_());
    return { ok: true, queued: true, sheetName: safeSheetName, reportRefresh: queued };
  }

  function handleTransportSheetEdit(e) {
    return recordSheetChangeSignal_(e, 'transport', 'handleTransportSheetEdit', APP_CONFIG.spreadsheetId);
  }

  function handleTransportSheetChange(e) {
    var eventType = (e && e.changeType) || 'CHANGE';
    if (isInternalReportSheetChangeEvent_(eventType) && isInternalReportRefreshRunning_()) {
      return { ok: true, skipped: true, reason: 'Ignored internal report refresh sheet change.' };
    }
    return recordSheetChangeSignal_(e, 'transport', 'handleTransportSheetChange', APP_CONFIG.spreadsheetId);
  }

  function syncFundSheetChange(eventType, sheetName, editedRange) {
    var safeSheetName = clean_(sheetName);
    var safeEventType = clean_(eventType) || 'CHANGE';
    var isTransactionSheet = safeSheetName === 'NHAP_THUCHI' || safeSheetName === 'NHAP_VAY';
    var months = isTransactionSheet ? getFundEditedMonthKeys_(editedRange) : [];
    var full = isStructuralSheetChange_(safeEventType) || !isTransactionSheet || !months.length;
    var fundRefresh = enqueueRefreshWithFallback_({
      months: months,
      full: full,
      source: 'fund-sheet:' + safeSheetName + ':' + safeEventType
    }, fundRefreshQueueContext_(), 'fund');
    var reportRefresh = null;
    if (safeSheetName === 'NHAP_THUCHI' || !safeSheetName) {
      reportRefresh = enqueueManualReportRefresh_({
        months: months,
        full: full,
        refreshDashboard: true,
        delayMs: FUND_TO_TRANSPORT_DELAY_MS,
        verificationPasses: 1,
        source: 'fund-sheet-downstream:' + (safeSheetName || 'unknown') + ':' + safeEventType
      });
    }
    return {
      ok: true,
      eventType: safeEventType,
      sheetName: safeSheetName,
      months: months,
      full: full,
      fundRefresh: fundRefresh,
      reportRefresh: reportRefresh
    };
  }

  function handleFundSheetEdit(e) {
    return recordSheetChangeSignal_(e, 'fund', 'handleFundSheetEdit', activeFundSpreadsheetId_());
  }

  function handleFundSheetChange(e) {
    return recordSheetChangeSignal_(e, 'fund', 'handleFundSheetChange', activeFundSpreadsheetId_());
  }

  function recordSheetChangeSignal_(event, moduleName, handlerName, spreadsheetId) {
    try {
      return SheetChangeSignalService.record(event, moduleName, handlerName, spreadsheetId,
        sheetSignalContext_(PropertiesService.getScriptProperties()));
    } catch (error) {
      if (!isTransientGoogleError_(error)) throw error;
      console.log('sheet_signal_deferred:' + moduleName + ':google_platform');
      return { ok: false, deferred: true, queued: false, category: 'google_platform' };
    }
  }

  function getFundEditedMonthKeys_(range) {
    if (!range || !range.getSheet || !range.getRow || !range.getNumRows) return [];
    if (Number(range.getRow() || 0) < 2) return [];
    var sheet = range.getSheet();
    var startRow = Math.max(2, Number(range.getRow() || 2));
    var numRows = Math.max(1, Number(range.getNumRows() || 1));
    var lastRow = Math.max(startRow, Number(sheet.getLastRow ? sheet.getLastRow() : startRow));
    numRows = Math.min(numRows, lastRow - startRow + 1);
    if (numRows < 1) return [];
    var values = sheet.getRange(startRow, 2, numRows, 1).getValues();
    var seen = {};
    values.forEach(function (row) {
      var date = parseDateValue_(row && row[0]);
      if (date) seen[Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM')] = true;
    });
    return Object.keys(seen).sort().reverse();
  }

  function syncUnknownTransportSheetChange_(eventType) {
    if (isInternalReportRefreshRunning_() && isInternalReportSheetChangeEvent_(eventType)) {
      return {
        ok: true,
        skipped: true,
        eventType: clean_(eventType) || 'CHANGE',
        reason: 'Ignored internal report refresh sheet change.'
      };
    }
    var queued = ManualReportRefreshQueueService.enqueue({
      full: true, sheets: MANAGE_SHEET_NAMES, catalogs: TRANSPORT_CATALOG_SHEET_NAMES.map(function (sheet) { return sheet === 'DM_ThamSo' ? 'DM_ThamSo_TS' : sheet; }),
      includeAll: true, verificationPasses: 1,
      source: 'sheet:unknown:' + (clean_(eventType) || 'CHANGE')
    }, manualReportRefreshQueueContext_());
    return { ok: true, queued: true, reportRefresh: queued };
  }

  function isStructuralSheetChange_(eventType) {
    var safeEventType = (clean_(eventType) || 'CHANGE').toUpperCase();
    return safeEventType !== 'EDIT' && safeEventType !== 'MANUAL_TEST';
  }

  function isInternalReportSheetChangeEvent_(eventType) {
    var safeEventType = (clean_(eventType) || '').toUpperCase();
    return safeEventType === 'INSERT_GRID' || safeEventType === 'REMOVE_GRID';
  }

  function withInternalReportRefreshGuard_(fn) {
    var token = Utilities.getUuid();
    updateInternalReportRefreshTokens_(function (tokens) {
      tokens.push({ id: token, expiresAt: new Date().getTime() + INTERNAL_REPORT_REFRESH_GUARD_TTL_MS });
      return tokens;
    });
    try {
      return fn();
    } finally {
      updateInternalReportRefreshTokens_(function (tokens) {
        return tokens.filter(function (value) { return value.id !== token; });
      });
    }
  }

  function isInternalReportRefreshRunning_() {
    var raw;
    try {
      raw = PropertiesService.getScriptProperties().getProperty(INTERNAL_REPORT_REFRESH_TOKENS_PROP);
    } catch (error) {
      if (!isTransientGoogleError_(error)) throw error;
      console.log('internal_report_guard_deferred:google_platform');
      return false;
    }
    if (!raw) return false;
    try {
      var tokens = JSON.parse(raw);
      var now = new Date().getTime();
      return Array.isArray(tokens) && tokens.some(function (value) {
        return value && value.id && Number(value.expiresAt || 0) > now;
      });
    } catch (err) {
      return false;
    }
  }

  function updateInternalReportRefreshTokens_(mutate) {
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      var props = PropertiesService.getScriptProperties();
      var tokens = [];
      try {
        tokens = JSON.parse(props.getProperty(INTERNAL_REPORT_REFRESH_TOKENS_PROP) || '[]');
        if (!Array.isArray(tokens)) tokens = [];
      } catch (err) {
        tokens = [];
      }
      var now = new Date().getTime();
      tokens = tokens.filter(function (value) {
        return value && value.id && Number(value.expiresAt || 0) > now;
      });
      tokens = mutate(tokens) || [];
      if (tokens.length) props.setProperty(INTERNAL_REPORT_REFRESH_TOKENS_PROP, JSON.stringify(tokens));
      else props.deleteProperty(INTERNAL_REPORT_REFRESH_TOKENS_PROP);
    } finally {
      lock.releaseLock();
    }
  }

  function syncCatalogAfterWrite(displaySheetName) {
    return StartupCatalogSyncService.syncCatalogAfterWrite(displaySheetName, startupCatalogSyncContext_());
  }

  function syncFundAfterWrite(year, options) {
    var input = options || {};
    var result = FundSyncService.syncFundAfterWrite(year, input, fundSyncContext_());
    if (input.transportDownstream === true) {
      result.reportRefresh = enqueueTransportReportsAfterFundWrite_(year, input);
    }
    return result;
  }

  function syncFundTransactionsAfterWrite(year, transactions) {
    var input = { transactions: transactions || [] };
    var result = FundSyncService.syncFundTransactionsAfterWrite(year, transactions, fundSyncContext_());
    result.reportRefresh = enqueueTransportReportsAfterFundWrite_(year, input);
    return result;
  }

  function enqueueTransportReportsAfterFundWrite_(year, options) {
    var monthKeys = FundSyncService.getFundWriteMonthKeys(year, options || {}, fundSyncContext_());
    return enqueueManualReportRefresh_({
      months: monthKeys,
      full: !monthKeys.length,
      refreshDashboard: true,
      delayMs: FUND_TO_TRANSPORT_DELAY_MS,
      verificationPasses: 1,
      source: 'fund-web-write:NHAP_THUCHI'
    });
  }

  function isWriteJobEnabled_() {
    if (readBooleanProperty_('WRITE_QUEUE_PAUSED', false)) return false;
    return ASYNC_WRITE_ENABLED || ASYNC_TRANSPORT_WRITE_ENABLED || asyncFundTransactionAddEnabled_();
  }

  function isWriteJobAllowed_(moduleName, actionName) {
    if (ASYNC_WRITE_ENABLED) return true;
    var safeModule = clean_(moduleName);
    var safeAction = clean_(actionName);
    if (ASYNC_TRANSPORT_WRITE_ENABLED && safeModule === 'transport') {
      return safeAction === 'submitRows' || safeAction === 'saveSheetRow' || safeAction === 'deleteSheetRow';
    }
    return asyncFundTransactionAddEnabled_() && safeModule === 'fund' && safeAction === 'addFundTransactions';
  }

  function shouldQueueFundTransactions() {
    return ASYNC_WRITE_ENABLED || asyncFundTransactionAddEnabled_();
  }

  function enqueueWriteJob(moduleName, actionName, payload, idempotencyKey) {
    var safeModule = clean_(moduleName) || 'transport';
    var safeAction = clean_(actionName);
    if (!isWriteJobAllowed_(safeModule, safeAction)) {
      throw new Error('Async write queue đang tắt. Dùng luồng ghi Apps Script trực tiếp.');
    }
    var safeIdempotencyKey = clean_(idempotencyKey);
    if (safeIdempotencyKey) {
      var existingJob = WriteJobRepository.findByIdempotency(safeModule, safeIdempotencyKey);
      if (existingJob) {
        if (existingJob.status === 'synced' && existingJob.result && typeof existingJob.result === 'object') {
          var completedResult = {};
          Object.keys(existingJob.result).forEach(function (key) { completedResult[key] = existingJob.result[key]; });
          completedResult.jobId = existingJob.jobId;
          completedResult.status = 'synced';
          completedResult.queued = false;
          completedResult.duplicateRequest = true;
          return completedResult;
        }
        existingJob.queued = existingJob.status !== 'synced';
        existingJob.duplicateRequest = true;
        return existingJob;
      }
    }
    var jobId = safeIdempotencyKey ? buildIdempotentJobId_(safeModule, safeIdempotencyKey) : Utilities.getUuid();
    var row = {
      id: jobId,
      module: safeModule,
      action: safeAction,
      status: 'pending',
      payload: payload || {},
      attempts: 0,
      max_attempts: 3,
      last_error: '',
      next_run_at: new Date().toISOString(),
      idempotency_key: safeIdempotencyKey || jobId
    };
    WriteJobRepository.create(row);
    var triggerResult = null;
    try {
      triggerResult = installWriteJobTrigger();
    } catch (triggerErr) {
      WriteJobRepository.appendLog({
        job_id: jobId,
        status: 'pending',
        message: 'Không cài được trigger worker tự động: ' + (triggerErr && triggerErr.message ? triggerErr.message : triggerErr)
      });
    }
    try {
      installManageDataSyncTrigger();
    } catch (manageTriggerErr) {
      WriteJobRepository.appendLog({
        job_id: jobId,
        status: 'pending',
        message: 'Không cài được trigger sync Vận hành tự động: ' + (manageTriggerErr && manageTriggerErr.message ? manageTriggerErr.message : manageTriggerErr)
      });
    }
    return {
      ok: true,
      queued: true,
      jobId: jobId,
      status: 'pending',
      module: row.module,
      action: row.action,
      idempotencyKey: row.idempotency_key,
      trigger: triggerResult
    };
  }

  function enqueueTransportSubmitRows(formType, rows) {
    return enqueueWriteJob('transport', 'submitRows', {
      formType: clean_(formType),
      rows: rows || [],
      queuedAt: new Date().toISOString()
    });
  }

  function enqueueTransportSaveSheetRow(sheetName, rowIndex, rowData, previousRowData) {
    var safeSheetName = clean_(sheetName);
    if (!isManageSheetName_(safeSheetName)) {
      throw new Error('Async save chỉ hỗ trợ sheet Vận hành NL_* ở bước này.');
    }
    return enqueueWriteJob('transport', 'saveSheetRow', {
      sheetName: safeSheetName,
      rowIndex: rowIndex,
      rowData: rowData || {},
      previousRowData: previousRowData || null,
      queuedAt: new Date().toISOString()
    });
  }

  function enqueueTransportDeleteSheetRow(sheetName, rowIndex, columnsToClear, rowData) {
    var safeSheetName = clean_(sheetName);
    if (!isManageSheetName_(safeSheetName)) {
      throw new Error('Async delete chỉ hỗ trợ sheet Vận hành NL_* ở bước này.');
    }
    if (!Array.isArray(columnsToClear) || !columnsToClear.length) {
      throw new Error('Xóa bất đồng bộ chỉ được phép xóa nội dung các cột chỉ định; không được deleteRow().');
    }
    return enqueueWriteJob('transport', 'deleteSheetRow', {
      sheetName: safeSheetName,
      rowIndex: rowIndex,
      columnsToClear: columnsToClear || null,
      rowData: rowData || null,
      queuedAt: new Date().toISOString()
    });
  }

  function enqueueFundTransactions(year, transactions, clientRequestId) {
    var safeYear = clean_(year) || activeWorkbookYear_();
    if (!/^\d{4}$/.test(safeYear)) throw new Error('Năm Thu chi không hợp lệ: ' + safeYear);
    var safeTransactions = Array.isArray(transactions) ? transactions : [];
    if (!safeTransactions.length) throw new Error('Chưa có giao dịch thu chi nào để ghi.');
    FundService.validateFundTransactions(safeTransactions);
    var requestId = clean_(clientRequestId) || Utilities.getUuid();
    if (requestId.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
      throw new Error('clientRequestId không hợp lệ.');
    }
    var prepared = FundService.prepareFundTransactionVouchers(safeYear, safeTransactions);
    return enqueueWriteJob('fund', 'addFundTransactions', {
      year: safeYear,
      transactions: prepared,
      clientRequestId: requestId,
      queuedAt: new Date().toISOString()
    }, 'fund:add:' + safeYear + ':' + requestId);
  }

  function getWriteJobStatus(jobId) {
    var safeJobId = clean_(jobId);
    if (!safeJobId) throw new Error('Thiếu mã job cần kiểm tra.');
    var job = WriteJobRepository.get(safeJobId);
    if (!job) {
      return { ok: false, error: 'Không tìm thấy job: ' + safeJobId };
    }
    return job;
  }

  function getRecentWriteJobs(moduleName, actionName, limit, year) {
    var safeLimit = Math.min(Math.max(parseInt(limit || 20, 10) || 20, 1), 100);
    var safeModule = clean_(moduleName);
    var safeAction = clean_(actionName);
    var safeYear = clean_(year) || activeWorkbookYear_();
    if (!/^20\d{2}$/.test(safeYear)) throw new Error('Năm write job không hợp lệ.');
    var jobs = WriteJobRepository.listRecent(safeModule, safeAction, safeLimit, safeYear);
    return {
      ok: true,
      jobs: jobs,
      count: jobs.length,
      checkedAt: new Date().toISOString()
    };
  }

  function getReportCacheAudit(months) {
    var recentMonths = ReportSyncService.getRecentReportMonths(3, reportSyncContext_());
    var requestedMonths = CacheAuditService.normalizeReportMonths(months, recentMonths.slice(0, 1));
    if (requestedMonths.length !== 1) throw new Error('Audit Báo cáo chỉ kiểm tra một kỳ mỗi yêu cầu.');
    var rows = SupabaseBundleRepository.readRows(TABLE_REPORT_BUNDLES, {
      spreadsheet_id: 'eq.' + APP_CONFIG.spreadsheetId,
      report_month: 'in.(' + requestedMonths.map(CacheAuditService.encodeSupabaseInValue).join(',') + ')',
      select: 'report_month,payload,synced_at,updated_at',
      limit: String(requestedMonths.length)
    });
    var cachedByMonth = {};
    (rows || []).forEach(function (row) {
      cachedByMonth[clean_(row.report_month)] = row;
    });

    var checkedAt = new Date().toISOString();
    var results = requestedMonths.map(function (month) {
      var cached = cachedByMonth[month];
      var liveBundle = cached && cached.payload ? ReportService.getReportBundle(month, true, {
        skipInvalidation: true,
        suppressSupabaseWrite: true
      }) : null;
      return CacheAuditService.buildReportResult(month, cached, liveBundle);
    });

    return {
      ok: results.every(function (item) { return item.ok; }),
      spreadsheetId: APP_CONFIG.spreadsheetId,
      checkedAt: checkedAt,
      months: requestedMonths,
      results: results
    };
  }

  function getManageCacheAudit(sheetNames, limit) {
    var requestedSheets = CacheAuditService.normalizeManageSheets(sheetNames, MANAGE_SHEET_NAMES);
    var auditLimit = Math.min(Math.max(parseInt(limit || 50, 10) || 50, 1), 500);
    var rows = SupabaseBundleRepository.readRows(TABLE_MANAGE_DATA_BUNDLES, {
      sheet_name: 'in.(' + requestedSheets.map(function (sheetName) { return CacheAuditService.encodeSupabaseInValue(activeWorkbookYear_() + ':' + sheetName); }).join(',') + ')',
      filter_key: 'eq.' + DEFAULT_MANAGE_FILTER_KEY,
      select: 'sheet_name,payload,synced_at,updated_at',
      limit: String(requestedSheets.length)
    });
    var cachedBySheet = {};
    (rows || []).forEach(function (row) {
      cachedBySheet[clean_(row.sheet_name).replace(/^20\d{2}:/, '')] = row;
    });

    var checkedAt = new Date().toISOString();
    var results = requestedSheets.map(function (sheetName) {
      var cached = cachedBySheet[sheetName];
      var livePayload = cached && cached.payload ? ManageService.readManageData(sheetName, '', '', auditLimit, { forceRefresh: true }) : null;
      return CacheAuditService.buildManageResult(sheetName, auditLimit, cached, livePayload);
    });

    return {
      ok: results.every(function (item) { return item.ok; }),
      spreadsheetId: APP_CONFIG.spreadsheetId,
      checkedAt: checkedAt,
      sheets: requestedSheets,
      limit: auditLimit,
      results: results
    };
  }

  function retryWriteJob(jobId) {
    var safeJobId = clean_(jobId);
    if (!safeJobId) throw new Error('Thiếu mã job cần retry.');
    var currentJob = WriteJobRepository.get(safeJobId);
    if (!currentJob) throw new Error('Không tìm thấy job: ' + safeJobId);
    assertActiveWriteJobYear_(currentJob);
    if (isCanceledWriteJob_(currentJob)) throw new Error('Job đã bị hủy và không thể đưa lại vào hàng chờ.');
    if (/^REQUIRES_RECONCILIATION:/.test(clean_(currentJob.lastError))) {
      throw new Error('Lệnh có thể đã ghi Google Sheet; cần đối soát đúng mã lệnh trước khi mở lại retry.');
    }
    if (clean_(currentJob.status).toLowerCase() !== 'failed') {
      throw new Error('Chỉ có thể retry job đang ở trạng thái failed.');
    }
    WriteJobRepository.retry(safeJobId, new Date().toISOString(), currentJob);
    return getWriteJobStatus(safeJobId);
  }

  function assertActiveWriteJobYear_(job) {
    var props = PropertiesService.getScriptProperties();
    var activeYear = clean_(props.getProperty('DEFAULT_WORKBOOK_YEAR')) || clean_(props.getProperty('ACTIVE_WORKBOOK_YEAR')) || activeWorkbookYear_();
    var jobYear = clean_(job && job.payload && job.payload.year) || activeYear;
    if (jobYear !== activeYear) throw new Error('Job năm ' + jobYear + ' đã khóa chỉ đọc; không thể retry sau khi chuyển năm.');
  }

  function cancelWriteJob(jobId) {
    var safeJobId = clean_(jobId);
    if (!safeJobId) throw new Error('Thiếu mã job cần hủy.');
    var currentJob = WriteJobRepository.get(safeJobId);
    if (!currentJob) throw new Error('Không tìm thấy job: ' + safeJobId);
    if (isCanceledWriteJob_(currentJob)) {
      currentJob.canceled = true;
      return currentJob;
    }
    var currentStatus = clean_(currentJob.status).toLowerCase();
    if (currentStatus === 'processing') {
      throw new Error('Job đang được worker xử lý; không thể hủy an toàn. Hãy đối soát Google Sheet trước.');
    }
    if (currentStatus === 'synced') {
      throw new Error('Job đã ghi xong; không thể hủy. Hãy đối soát dòng dữ liệu trên Google Sheet.');
    }
    if (currentStatus !== 'pending') throw new Error('Chỉ có thể hủy job đang ở trạng thái pending.');
    var canceledAt = new Date().toISOString();
    var reason = CANCELED_WRITE_JOB_PREFIX + ' Đã hủy theo yêu cầu người dùng để tránh ghi trùng dữ liệu đã nhập trực tiếp.';
    var canceledJob = WriteJobRepository.cancel(safeJobId, reason, canceledAt);
    if (!isCanceledWriteJob_(canceledJob)) {
      throw new Error('Không thể hủy job vì trạng thái đã thay đổi. Hãy tải lại và đối soát Google Sheet.');
    }
    canceledJob.canceled = true;
    return canceledJob;
  }

  function isCanceledWriteJob_(job) {
    return Boolean(job && clean_(job.lastError).indexOf(CANCELED_WRITE_JOB_PREFIX) === 0);
  }

  function processWriteJobs(maxJobs) {
    try { return WriteJobWorker.process(maxJobs, writeJobWorkerContext_()); }
    catch (error) {
      if (!isTransientGoogleError_(error)) throw error;
      console.log('write_worker_admission_deferred:google_platform');
      return { ok: false, deferred: true, processed: 0, phase: 'admission', category: 'google_platform',
        error: 'Writer admission unavailable; no pause guard fallback.' };
    }
  }

  function installWriteJobTrigger() {
    if (!isWriteJobEnabled_()) {
      return { ok: true, disabled: true, installed: false, handler: 'processWriteJobs' };
    }
    var triggers = ScriptApp.getProjectTriggers();
    var exists = triggers.some(function (trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'processWriteJobs';
    });
    if (!exists) {
      ScriptApp.newTrigger('processWriteJobs').timeBased().everyMinutes(1).create();
    }
    return {
      ok: true,
      installed: !exists,
      handler: 'processWriteJobs',
      intervalMinutes: 1
    };
  }

  function syncRecentManageDataCache() {
    if (!ASYNC_WRITE_ENABLED) {
      return { ok: true, disabled: true, synced: 0, message: 'Automatic manage cache trigger is disabled.' };
    }
    var results = [];
    var errors = [];
    MANAGE_SHEET_NAMES.forEach(function (sheetName) {
      runSyncStep_(results, errors, 'manageData:' + sheetName, function () {
        return syncManageDataBundle(sheetName);
      });
    });
    return {
      ok: errors.length === 0,
      synced: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    };
  }

  function installManageDataSyncTrigger() {
    if (!ASYNC_WRITE_ENABLED) {
      return { ok: true, disabled: true, installed: false, handler: 'syncRecentManageDataCache' };
    }
    var triggers = ScriptApp.getProjectTriggers();
    var exists = triggers.some(function (trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'syncRecentManageDataCache';
    });
    if (!exists) {
      ScriptApp.newTrigger('syncRecentManageDataCache').timeBased().everyMinutes(1).create();
    }
    return {
      ok: true,
      installed: !exists,
      handler: 'syncRecentManageDataCache',
      intervalMinutes: 1
    };
  }

  function installTransportSheetSyncTrigger(spreadsheetId) {
    var targetSpreadsheetId = clean_(spreadsheetId) || APP_CONFIG.spreadsheetId;
    if (!targetSpreadsheetId) throw new Error('Thiếu Spreadsheet ID để cài trigger đồng bộ Sheet -> Supabase.');
    var handlers = {
      handleTransportSheetEdit: true,
      handleTransportSheetChange: true
    };
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;
    triggers.forEach(function (trigger) {
      var handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
      if (handlers[handler]) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    ScriptApp.newTrigger('handleTransportSheetEdit').forSpreadsheet(targetSpreadsheetId).onEdit().create();
    ScriptApp.newTrigger('handleTransportSheetChange').forSpreadsheet(targetSpreadsheetId).onChange().create();
    registerSheetTriggerBindingsIfComplete_();
    return {
      ok: true,
      spreadsheetId: targetSpreadsheetId,
      installed: 2,
      removed: removed,
      handlers: Object.keys(handlers)
    };
  }

  function installFundSheetSyncTrigger(spreadsheetId) {
    var targetSpreadsheetId = clean_(spreadsheetId) || activeFundSpreadsheetId_();
    if (!targetSpreadsheetId) throw new Error('Thiếu Spreadsheet ID ThuChi để cài trigger đồng bộ Sheet -> Supabase.');
    var handlers = {
      handleFundSheetEdit: true,
      handleFundSheetChange: true
    };
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;
    triggers.forEach(function (trigger) {
      var handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
      if (handlers[handler]) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    ScriptApp.newTrigger('handleFundSheetEdit').forSpreadsheet(targetSpreadsheetId).onEdit().create();
    ScriptApp.newTrigger('handleFundSheetChange').forSpreadsheet(targetSpreadsheetId).onChange().create();
    registerSheetTriggerBindingsIfComplete_();
    return {
      ok: true,
      spreadsheetId: targetSpreadsheetId,
      installed: 2,
      removed: removed,
      handlers: Object.keys(handlers)
    };
  }

  function registerSheetTriggerBindingsIfComplete_() {
    var names = ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); });
    if (['handleTransportSheetEdit', 'handleTransportSheetChange', 'handleFundSheetEdit', 'handleFundSheetChange'].every(function (handler) { return names.indexOf(handler) >= 0; })) {
      return registerSheetTriggerBindings();
    }
    return { ok: true, incomplete: true };
  }

  function installE16RTriggers() {
    return {
      ok: true,
      realtime: installSupabaseSyncTriggers(),
      transport: installTransportSheetSyncTrigger(APP_CONFIG.spreadsheetId),
      fund: installFundSheetSyncTrigger(activeFundSpreadsheetId_()),
      writeJobs: installWriteJobTrigger()
    };
  }

  function executeWriteJob_(job) {
    var actionName = clean_(job.action);
    var payload = job.payload || {};
    AppConfig.assertWritableYear(payload.year);
    if (TransportJobHandler.canHandle(actionName)) {
      if (!payload.spreadsheetId) throw new Error('Job Vận tải thiếu workbook đã khóa khi enqueue.');
      AppConfig.activate({ spreadsheetId: payload.spreadsheetId, year: payload.year });
      return TransportJobHandler.execute(job, transportJobHandlerContext_());
    }
    if (FundJobHandler.canHandle(job, clean_)) {
      return FundJobHandler.execute(job, fundJobHandlerContext_());
    }
    throw new Error('Write job action chưa được hỗ trợ: ' + actionName);
  }

  function getRecentReportMonths_(maxCount) {
    return ReportSyncService.getRecentReportMonths(maxCount, reportSyncContext_());
  }

  function getRecentReportMonthKeysForSync_(maxCount) {
    return ReportSyncService.getRecentReportMonthKeys(maxCount, reportSyncContext_());
  }

  function installSupabaseSyncTriggers() {
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;
    triggers.forEach(function (trigger) {
      if (trigger.getHandlerFunction && trigger.getHandlerFunction() === 'syncRealtimeCache') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    ScriptApp.newTrigger('syncRealtimeCache').timeBased().everyMinutes(REALTIME_TICK_INTERVAL_MINUTES).create();
    return {
      ok: true,
      installed: true,
      removed: removed,
      handler: 'syncRealtimeCache',
      intervalMinutes: REALTIME_TICK_INTERVAL_MINUTES,
      mode: 'tick'
    };
  }

  function callRpc_(functionName, payload) {
    return SupabaseHttpClient.callRpc(functionName, payload);
  }

  function writeSyncStatus_(syncKey, moduleName, status, message, syncedAt) {
    try {
      SupabaseSyncStatusRepository.upsert({
        sync_key: syncKey,
        module: moduleName,
        status: status,
        message: message || '',
        synced_at: syncedAt || new Date().toISOString()
      });
    } catch (err) {
      console.log('sync_status_failed: ' + (err && err.message ? err.message : err));
    }
  }

  function activeWorkbookYear_() {
    var year = clean_(APP_CONFIG && APP_CONFIG.year);
    if (!/^20\d{2}$/.test(year)) throw new Error('ACTIVE_WORKBOOK_YEAR chưa được cấu hình hợp lệ.');
    return year;
  }

  function activeFundSpreadsheetId_() {
    return FundService.resolveFundSpreadsheetId(activeWorkbookYear_());
  }

  function yearPropertyKey_(baseKey) {
    return String(baseKey) + '_' + activeWorkbookYear_();
  }

  function startupCatalogSyncContext_() {
    return {
      year: activeWorkbookYear_(),
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      getStartupData: function (formType) { return SheetService.getStartupData(formType, true); },
      getCatalogs: function (formType) { return CatalogService.getCatalogs(formType, true); },
      readCatalogData: function (displaySheetName) { return CatalogService.readCatalogData(displaySheetName, true); },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_
    };
  }

  function reportSyncContext_() {
    return {
      spreadsheetId: APP_CONFIG.spreadsheetId,
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      getReportBundle: function (month, forceRefresh, options) {
        return ReportService.getReportBundle(month, forceRefresh, options);
      },
      beginReportRefreshBatch: function () { return ReportService.beginReportRefreshBatch(); },
      getReportDataVersion: function () { return ReportService.getReportDataVersion(); },
      getReportCacheVersion: function () { return ReportService.getReportCacheVersion(); },
      upsertReportBundle: function (options) { return SupabaseReportCacheRepository.upsertBundle(options); },
      syncPayrollExplanations: syncPayrollExplanationMonth,
      getDashboard: function (month, forceRefresh) {
        return ReportService.getDashboard(month, forceRefresh);
      },
      getReportSheet: function () {
        return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId).getSheetByName('BC_TongQuan');
      },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_,
      isManageSheetName: isManageSheetName_,
      getTransportRowsMonthKeys: getTransportRowsMonthKeys_,
      normalizeYearMonthKey: normalizeYearMonthKey_,
      formatMonthKeyForReport: formatMonthKeyForReport_
    };
  }

  function payrollExplanationSyncContext_() {
    return {
      spreadsheetId: APP_CONFIG.spreadsheetId,
      nowISOString: function () { return new Date().toISOString(); },
      getReportDataVersion: function () { return ReportService.getReportDataVersion(); },
      getSpreadsheet: function () { return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId); },
      hashPayload: function (payload) { return SupabaseReportCacheRepository.hashDetails(payload); },
      replaceMonth: function (spreadsheetId, reportMonth, rows) {
        return callRpc_('replace_payroll_explanation_month_v6', {
          p_spreadsheet_id: spreadsheetId,
          p_report_month: reportMonth,
          p_rows: rows || []
        });
      },
      writeSyncStatus: writeSyncStatus_
    };
  }

  function manualReportRefreshQueueContext_() {
    var props = PropertiesService.getScriptProperties();
    return {
      propertyKey: yearPropertyKey_(TRANSPORT_REFRESH_PROPERTY_KEY),
      debounceMs: TRANSPORT_REPORT_DEBOUNCE_MS,
      retryDelayMs: TRANSPORT_REPORT_RETRY_DELAY_MS,
      nowMillis: function () { return new Date().getTime(); },
      nowISOString: function () { return new Date().toISOString(); },
      normalizeYearMonthKey: normalizeYearMonthKey_,
      getProperty: function (key) { return props.getProperty(key); },
      setProperty: function (key, value) { props.setProperty(key, value); },
      deleteProperty: function (key) { props.deleteProperty(key); },
      withLock: withRefreshQueueLock_
    };
  }

  function isTransientGoogleError_(error) {
    return /server error occurred|error code INTERNAL|DEADLINE_EXCEEDED|reading from storage/i.test(String(error && error.message || error));
  }

  function withRefreshQueueLock_(fn) {
    var lock = LockService.getScriptLock();
    try {
      if (!lock.tryLock(1000)) {
        var busy = new Error('REFRESH_LOCK_DEFERRED: queue lock busy.');
        busy.refreshDeferred = true;
        throw busy;
      }
      try { return fn(); } finally { lock.releaseLock(); }
    } catch (error) {
      if (isTransientGoogleError_(error)) error.refreshDeferred = true;
      throw error;
    }
  }

  function fundRefreshQueueContext_() {
    var context = manualReportRefreshQueueContext_();
    context.propertyKey = yearPropertyKey_(FUND_REFRESH_PROPERTY_KEY);
    context.debounceMs = FUND_REFRESH_DEBOUNCE_MS;
    context.retryDelayMs = FUND_REFRESH_RETRY_DELAY_MS;
    return context;
  }

  function manageSyncContext_() {
    var ss = null;
    return {
      year: activeWorkbookYear_(),
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      normalizeYearMonthKey: normalizeYearMonthKey_,
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); },
      parseDateValue: parseDateValue_,
      getHeaderRow: getHeaderRowForSheet_,
      getSheet: function (sheetName) {
        if (!ss) ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
        return ss.getSheetByName(sheetName);
      },
      readManageData: function (sheetName, startDate, endDate, limit) {
        return ManageService.readManageData(sheetName, startDate, endDate, limit, { forceRefresh: true });
      },
      readCacheRows: function (tableName, query) {
        return SupabaseBundleRepository.readRows(tableName, query);
      },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_,
      syncDashboard: syncDashboard,
      runtimeCache: CacheService.getScriptCache(),
      runningKeyPrefix: yearPropertyKey_(TRANSPORT_SHEET_SYNC_RUNNING_CACHE_KEY),
      runningTtlSeconds: TRANSPORT_SHEET_SYNC_RUNNING_TTL_SECONDS
    };
  }

  function fundSyncContext_(snapshot, transactionPayload) {
    return {
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      encodeSearch: function (value) { return Utilities.base64EncodeWebSafe(value).replace(/=+$/, ''); },
      getFundOverview: function (year, filter) {
        if (snapshot) return FundService.getFundOverviewFromSnapshot(filter, snapshot);
        filter.forceRefresh = true; return FundService.getFundOverview(year, filter);
      },
      getFundTransactions: function (year, filter) { if (transactionPayload) return transactionPayload; filter.forceRefresh = true; return FundService.getFundTransactions(year, filter); },
      getFundLoanOverview: function (year, filter) { filter.forceRefresh = true; return FundService.getFundLoanOverview(year, filter); },
      getFundFormOptions: function (year, forceRefresh) { return FundService.getFundFormOptions(year, forceRefresh); },
      getFundCatalog: function (year, group, forceRefresh) { return FundService.getFundCatalog(year, group, forceRefresh); },
      parseDateValue: parseDateValue_,
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      deleteRows: function (tableName, filters) {
        return SupabaseBundleRepository.deleteRows(tableName, filters);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_
    };
  }

  function tripNotificationSyncContext_() {
    return {
      year: activeWorkbookYear_(),
      nowDate: function () { return new Date(); },
      nowISOString: function () { return new Date().toISOString(); },
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); },
      readRows: function (tableName, query) {
        return SupabaseBundleRepository.readRows(tableName, query);
      },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_
    };
  }

  function writeJobWorkerContext_() {
    return {
      isEnabled: isWriteJobEnabled_,
      createUuid: function () { return Utilities.getUuid(); },
      claimJobs: function (payload) { return callRpc_('claim_write_jobs', payload); },
      deferredError: function (error) {
        var deferred = SupabaseHttpClient.deferredResult(error);
        if (deferred) return deferred;
        return isTransientGoogleError_(error) ? { ok: false, deferred: true, category: 'google_platform',
          error: 'Claim unavailable; preserve ownership and do not replay an unknown result.' } : null;
      },
      executeJob: executeWriteJob_,
      repository: WriteJobRepository,
      releaseReservation: EntryService.releaseWriteJobReservation,
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      nextRunISOString: function (attempts) {
        return new Date(new Date().getTime() + attempts * 60000).toISOString();
      }
    };
  }

  function transportJobHandlerContext_() {
    return {
      clean: clean_,
      submitRows: function (formType, rows, options) { return EntryService.submitRows(formType, rows, options); },
      saveSheetRow: function (sheetName, rowIndex, rowData, previousRowData, writeContext) {
        return EntryService.saveSheetRow(sheetName, rowIndex, rowData, previousRowData, writeContext);
      },
      deleteSheetRow: function (sheetName, rowIndex, columnsToClear, rowData) {
        return EntryService.deleteSheetRow(sheetName, rowIndex, columnsToClear, rowData);
      },
      syncTransportAfterWrite: syncTransportAfterWrite,
      syncDashboard: syncDashboard,
      syncTransportReportsAfterWrite: syncTransportReportsAfterWrite,
      syncCatalogAfterWrite: syncCatalogAfterWrite,
      syncAllReportBundles: syncAllReportBundles
    };
  }

  function fundJobHandlerContext_() {
    return {
      assertWorkbook: function (year, expectedSpreadsheetId) {
        var actualSpreadsheetId = FundService.resolveFundSpreadsheetId(year);
        if (!expectedSpreadsheetId || clean_(expectedSpreadsheetId) !== clean_(actualSpreadsheetId)) {
          throw new Error('Workbook Thu chi của job không còn khớp cấu hình đã khóa khi enqueue.');
        }
      },
      addFundTransactions: function (year, transactions, options) {
        return FundService.addFundTransactions(year, transactions, options);
      },
      updateFundTransaction: FundService.updateFundTransaction,
      deleteFundTransaction: FundService.deleteFundTransaction,
      addFundDebtPayment: FundService.addFundDebtPayment,
      addFundLoan: FundService.addFundLoan,
      addFundLoanPayment: FundService.addFundLoanPayment,
      saveFundCatalogItem: FundService.saveFundCatalogItem,
      deleteFundCatalogItem: FundService.deleteFundCatalogItem,
      updateFundSettings: FundService.updateFundSettings,
      syncFundTransactionsAfterWrite: syncFundTransactionsAfterWrite,
      syncFundAfterWrite: syncFundAfterWrite
    };
  }

  function getSupabaseSyncStatus(limit, moduleName, year) {
    var safeLimit = Math.min(Math.max(parseInt(limit || 30, 10) || 30, 1), 100);
    var safeYear = clean_(year) || activeWorkbookYear_();
    if (!/^20\d{2}$/.test(safeYear)) throw new Error('Năm trạng thái đồng bộ không hợp lệ.');
    var query = {
      select: 'sync_key,module,status,message,synced_at,updated_at',
      order: 'synced_at.desc',
      limit: 200
    };
    var safeModule = clean_(moduleName);
    if (safeModule) query.module = 'eq.' + safeModule;
    var rows = SupabaseSyncStatusRepository.readRows(query);
    var now = new Date().getTime();
    rows = (rows || []).filter(function (row) {
      return syncKeyBelongsToYear_(row.sync_key, safeYear);
    }).slice(0, safeLimit).map(function (row) {
      var syncedAt = row.synced_at || '';
      var syncedTime = syncedAt ? new Date(syncedAt).getTime() : NaN;
      var ageSeconds = isNaN(syncedTime) ? null : Math.max(0, Math.round((now - syncedTime) / 1000));
      var workerStale = row.sync_key === 'realtime_cache_worker' && ageSeconds !== null && ageSeconds > 600;
      return {
        syncKey: row.sync_key || '',
        module: row.module || '',
        status: workerStale ? 'error' : row.status || '',
        message: workerStale ? 'Worker heartbeat is stale; cache refresh triggers may be stopped.' : row.message || '',
        syncedAt: syncedAt,
        ageSeconds: ageSeconds
      };
    });
    return {
      ok: true,
      rows: rows,
      count: rows.length,
      checkedAt: new Date().toISOString()
    };
  }

  function syncKeyBelongsToYear_(syncKey, year) {
    var key = clean_(syncKey);
    var colonYear = key.match(/(?:^|:)(20\d{2})(?=:|$)/);
    if (colonYear) return colonYear[1] === year;
    var reportYear = key.match(/(?:^|:)(?:0?[1-9]|1[0-2])\/(20\d{2})(?=:|$)/);
    return !reportYear || reportYear[1] === year;
  }

  function buildIdempotentJobId_(moduleName, idempotencyKey) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      clean_(moduleName) + ':' + clean_(idempotencyKey),
      Utilities.Charset.UTF_8
    );
    return 'idem-' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '').substring(0, 43);
  }

  function runSyncStep_(results, errors, name, fn) {
    try {
      results.push({ name: name, result: fn() });
    } catch (err) {
      errors.push({ name: name, error: err && err.message ? err.message : String(err) });
    }
  }

  function getReportMonths_() {
    return ReportSyncService.getReportMonths(reportSyncContext_());
  }

  function normalizeFundMonthKey_(month) {
    return FundSyncService.normalizeFundMonthKey(month, clean_);
  }

  function buildCatalogsKey_(formType) {
    return StartupCatalogSyncService.buildCatalogsKey(formType, activeWorkbookYear_(), clean_);
  }

  function buildCatalogDataKey_(displaySheetName) {
    return StartupCatalogSyncService.buildCatalogDataKey(displaySheetName, activeWorkbookYear_(), clean_);
  }

  function buildFundTransactionFilterKey_(filter) {
    return FundSyncService.buildFundTransactionFilterKey(filter, {
      clean: clean_,
      encodeSearch: function (value) { return Utilities.base64EncodeWebSafe(value).replace(/=+$/, ''); }
    });
  }

  function buildFundFormOptionsKey_(year) {
    return FundSyncService.buildFundFormOptionsKey(year, clean_);
  }

  function buildFundCatalogKey_(year, group) {
    return FundSyncService.buildFundCatalogKey(year, group, clean_);
  }

  function buildManageMonthFilterKey_(monthKey) {
    return ManageSyncService.buildManageMonthFilterKey(monthKey, {
      normalizeYearMonthKey: normalizeYearMonthKey_
    });
  }

  function getManageMonthKeys_(sheetName) {
    return ManageSyncService.getManageMonthKeys(sheetName, manageSyncContext_());
  }

  function getRecentManageMonthKeys_(sheetName, maxCount) {
    return ManageSyncService.getRecentManageMonthKeys(sheetName, maxCount, manageSyncContext_());
  }

  function getEditedManageMonthKeys_(sheetName, editedRange) {
    return ManageSyncService.getEditedManageMonthKeys(sheetName, editedRange, manageSyncContext_());
  }

  function getRecentFundMonthKeys_(year, maxCount) {
    return FundSyncService.getRecentFundMonthKeys(year, maxCount, fundSyncContext_());
  }

  function getHeaderRowForSheet_(sheetName) {
    for (var key in APP_CONFIG.sheets) {
      if (APP_CONFIG.sheets[key].name === sheetName) return APP_CONFIG.sheets[key].headerRow;
    }
    return 1;
  }

  function normalizeYearMonthKey_(monthKey) {
    var text = clean_(monthKey);
    var iso = text.match(/^(\d{4})-(\d{1,2})/);
    if (iso) return iso[1] + '-' + ('0' + Number(iso[2])).slice(-2);
    var vn = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (vn) return vn[2] + '-' + ('0' + Number(vn[1])).slice(-2);
    return '';
  }

  function parseDateValue_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    var text = clean_(value);
    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (vn) {
      var year = Number(vn[3].length === 2 ? '20' + vn[3] : vn[3]);
      return new Date(year, Number(vn[2]) - 1, Number(vn[1]));
    }
    return null;
  }

  function getTransportRowsMonthKeys_(rows) {
    var seen = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var date = parseDateValue_(row && (
        row.date
        || row.fromDate
        || row.toDate
        || row['Ngày']
        || row['Ngày chạy']
        || row['Ngày tiếp dầu']
        || row['Ngày lập biên bản']
        || row['Ngày báo nghỉ']
        || row['Từ ngày']
        || row['Đến ngày']
        || row['Đến ngày (Gồm cả)']
      ));
      if (!date) return;
      seen[Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM')] = true;
    });
    return Object.keys(seen).sort().reverse();
  }

  function formatMonthKeyForReport_(monthKey) {
    var normalized = normalizeYearMonthKey_(monthKey);
    if (!normalized) return monthKey;
    var parts = normalized.split('-');
    return parts[1] + '/' + parts[0];
  }

  function isManageSheetName_(sheetName) {
    return ManageSyncService.isManageSheetName(sheetName, clean_);
  }

  function activateFromSpreadsheetEvent_(e) {
    try {
      var source = e && e.source;
      var spreadsheetId = source && source.getId ? source.getId() : '';
      if (spreadsheetId) AppConfig.activate({ spreadsheetId: spreadsheetId });
    } catch (err) {
      console.log('activate_from_spreadsheet_event_failed: ' + (err && err.message ? err.message : err));
    }
  }

  function getEventActiveSheet_(e) {
    try {
      var source = e && e.source;
      if (source && source.getActiveSheet) return source.getActiveSheet();
    } catch (err) {
      console.log('get_event_active_sheet_failed: ' + (err && err.message ? err.message : err));
    }
    return null;
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  function readBooleanProperty_(propertyName, fallbackValue) {
    // Absence uses the configured default; a failed read must fail closed.
    var value = PropertiesService.getScriptProperties().getProperty(propertyName);
    if (value === null || value === undefined || value === '') return Boolean(fallbackValue);
    return ['1', 'true', 'yes', 'on'].indexOf(String(value).trim().toLowerCase()) !== -1;
  }

  return {
    registerSheetTriggerBindings: registerSheetTriggerBindings,
    installSupabaseSyncTriggers: installSupabaseSyncTriggers,
    syncDashboard: syncDashboard,
    syncFundAfterWrite: syncFundAfterWrite,
    syncFundTransactionsAfterWrite: syncFundTransactionsAfterWrite,
    syncFundLoanOverview: syncFundLoanOverview,
    syncFundOverview: syncFundOverview,
    syncFundTransactionMonth: syncFundTransactionMonth,
    syncFundTransactions: syncFundTransactions,
    syncFundFormOptionsBundle: syncFundFormOptionsBundle,
    syncFundCatalogBundle: syncFundCatalogBundle,
    syncAllFundCatalogBundles: syncAllFundCatalogBundles,
    syncAllFundBundles: syncAllFundBundles,
    syncStartupBundle: syncStartupBundle,
    syncCatalogsBundle: syncCatalogsBundle,
    syncCatalogDataBundle: syncCatalogDataBundle,
    syncAllStartupAndCatalogs: syncAllStartupAndCatalogs,
    syncCatalogAfterWrite: syncCatalogAfterWrite,
    syncCatalogWriteThrough: syncCatalogWriteThrough,
    syncManageDataBundle: syncManageDataBundle,
    syncManageMonthBundle: syncManageMonthBundle,
    syncAllManageDataBundles: syncAllManageDataBundles,
    syncFullRealtimeCache: syncFullRealtimeCache,
    syncRealtimeCache: syncRealtimeCache,
    syncTripNotifications: syncTripNotifications,
    syncOperationalNotifications: syncOperationalNotifications,
    syncDailyBusinessSummary: syncDailyBusinessSummary,
    dispatchNotifications: dispatchNotifications,
    getPendingTransportReportRefresh: getPendingTransportReportRefresh,
    getPendingFundRefresh: getPendingFundRefresh,
    auditManualReportFreshnessQueue: auditManualReportFreshnessQueue,
    getSupabaseSyncStatus: getSupabaseSyncStatus,
    getReportCacheAudit: getReportCacheAudit,
    getManageCacheAudit: getManageCacheAudit,
    syncReportBundle: syncReportBundle,
    syncAllReportBundles: syncAllReportBundles,
    syncPayrollExplanationMonth: syncPayrollExplanationMonth,
    requestPayrollExplanationRefresh: requestPayrollExplanationRefresh,
    syncTransportAfterWrite: syncTransportAfterWrite,
    syncTransportReportsAfterWrite: syncTransportReportsAfterWrite,
    enqueueWriteJob: enqueueWriteJob,
    enqueueTransportSubmitRows: enqueueTransportSubmitRows,
    enqueueTransportSaveSheetRow: enqueueTransportSaveSheetRow,
    enqueueTransportDeleteSheetRow: enqueueTransportDeleteSheetRow,
    enqueueFundTransactions: enqueueFundTransactions,
    shouldQueueFundTransactions: shouldQueueFundTransactions,
    getRecentWriteJobs: getRecentWriteJobs,
    getWriteJobStatus: getWriteJobStatus,
    installManageDataSyncTrigger: installManageDataSyncTrigger,
    installTransportSheetSyncTrigger: installTransportSheetSyncTrigger,
    installFundSheetSyncTrigger: installFundSheetSyncTrigger,
    installE16RTriggers: installE16RTriggers,
    handleTransportSheetEdit: handleTransportSheetEdit,
    handleTransportSheetChange: handleTransportSheetChange,
    handleFundSheetEdit: handleFundSheetEdit,
    handleFundSheetChange: handleFundSheetChange,
    syncFundSheetChange: syncFundSheetChange,
    syncTransportSheetChange: syncTransportSheetChange,
    syncUnknownTransportSheetChange: syncUnknownTransportSheetChange_,
    installWriteJobTrigger: installWriteJobTrigger,
    processWriteJobs: processWriteJobs,
    retryWriteJob: retryWriteJob,
    cancelWriteJob: cancelWriteJob,
    syncRecentManageDataCache: syncRecentManageDataCache,
    testReportSync: testReportSync
  };
})();
