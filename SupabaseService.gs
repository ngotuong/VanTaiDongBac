var SupabaseService = (function () {
  var TABLE_REPORT_BUNDLES = 'report_bundles';
  var TABLE_MANAGE_DATA_BUNDLES = 'manage_data_bundles';
  var DEFAULT_FUND_YEAR = '2026';
  var DEFAULT_STARTUP_FORM_TYPE = 'vanChuyen';
  var MANAGE_SHEET_NAMES = [
    'NL_VanChuyen',
    'NL_TaiXe',
    'NL_Dau',
    'NL_ChamCong',
    'NL_Phat',
    'NL_NghiVanHanh',
    'NL_PhanCongLai'
  ];
  var TRANSPORT_CATALOG_SHEET_NAMES = [
    'DM_NhanSu', 'DM_Xe', 'DM_DuAn', 'DM_CheDoLuong', 'DM_LuongChuyen',
    'DM_ThamSo', 'DM_GiaDau', 'DM_DonGiaVanChuyen', 'DM_ThuongQuanLy',
    'DM_PhatNoiBo', 'DM_PhanCongXe', 'DM_UuDaiNoiBo'
  ];
  var DEFAULT_MANAGE_FILTER_KEY = 'recent_500';
  var ASYNC_WRITE_ENABLED = false;
  var ASYNC_TRANSPORT_WRITE_ENABLED = true;
  var ASYNC_FUND_TRANSACTION_ADD_ENABLED = readBooleanProperty_('ASYNC_FUND_TRANSACTION_ADD_ENABLED', false);
  var REPORT_AUDIT_MONTHS = ['05/2026', '06/2026', '07/2026', 'Tất cả'];
  var REALTIME_TICK_INDEX_KEY = 'SUPABASE_REALTIME_TICK_INDEX';
  var REALTIME_SWEEP_NEXT_AT_PROP = 'SUPABASE_REALTIME_SWEEP_NEXT_AT';
  var REALTIME_HEARTBEAT_NEXT_AT_PROP = 'SUPABASE_REALTIME_HEARTBEAT_NEXT_AT';
  var SOURCE_POLL_NEXT_AT_PROP = 'SUPABASE_SOURCE_POLL_NEXT_AT';
  var REALTIME_QUEUE_PREFERENCE_PROP = 'SUPABASE_REALTIME_QUEUE_PREFERENCE';
  var SOURCE_FINGERPRINT_PREFIX = 'SUPABASE_SOURCE_FINGERPRINT_';
  var REPORT_OUTPUT_FINGERPRINT_PROP = 'SUPABASE_SOURCE_FINGERPRINT_REPORT_OUTPUTS';
  var REALTIME_TICK_RUNNING_CACHE_KEY = 'SUPABASE_REALTIME_TICK_RUNNING';
  var REPORT_CACHE_E1_PARITY_RUNNING_PROP = 'REPORT_CACHE_E1_PARITY_RUNNING';
  var INTERNAL_REPORT_REFRESH_TOKENS_PROP = 'SUPABASE_INTERNAL_REPORT_REFRESH_TOKENS';
  var TRANSPORT_SHEET_SYNC_RUNNING_CACHE_KEY = 'SUPABASE_TRANSPORT_SHEET_SYNC_RUNNING';
  var REALTIME_TICK_INTERVAL_MINUTES = 1;
  var REALTIME_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
  var REALTIME_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
  var SOURCE_POLL_INTERVAL_MS = 5 * 60 * 1000;
  var SOURCE_POLL_RETRY_MS = 60 * 1000;
  var TRIP_NOTIFICATION_NEXT_AT_PROP = 'SUPABASE_TRIP_NOTIFICATION_NEXT_AT';
  var TRIP_NOTIFICATION_INTERVAL_MS = 5 * 60 * 1000;
  var REFRESH_QUEUE_LOCK_WAIT_MS = 30 * 1000;
  var REALTIME_TICK_RUNNING_TTL_SECONDS = 300;
  var TRANSPORT_SHEET_SYNC_RUNNING_TTL_SECONDS = 120;
  var TRANSPORT_REPORT_DEBOUNCE_MS = 15000;
  var TRANSPORT_REPORT_VERIFICATION_DELAY_MS = 120000;
  var TRANSPORT_REPORT_RETRY_DELAY_MS = 30000;
  var FUND_REFRESH_PROPERTY_KEY = 'SUPABASE_PENDING_FUND_SYNC';
  var FUND_REFRESH_DEBOUNCE_MS = 15000;
  var FUND_REFRESH_RETRY_DELAY_MS = 30000;
  var FUND_TO_TRANSPORT_DELAY_MS = 30 * 1000;
  var DEFAULT_FUND_SPREADSHEET_ID = '1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw';
  var INTERNAL_REPORT_REFRESH_GUARD_TTL_MS = 600000;

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
    runSyncStep_(results, errors, 'fund', function () { return syncAllFundBundles(DEFAULT_FUND_YEAR); });
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
    var runtimeCache = CacheService.getScriptCache();
    var props = PropertiesService.getScriptProperties();
    var startLock = LockService.getScriptLock();
    if (!startLock.tryLock(1000)) {
      return { ok: true, mode: 'tick', skipped: true, reason: 'Realtime start guard is busy.' };
    }
    try {
      if (props.getProperty(REPORT_CACHE_E1_PARITY_RUNNING_PROP) === 'true') {
        return { ok: true, mode: 'tick', skipped: true, reason: 'E1 report cache parity window is active.' };
      }
      if (runtimeCache.get(REALTIME_TICK_RUNNING_CACHE_KEY)) {
        return {
          ok: true,
          mode: 'tick',
          skipped: true,
          reason: 'Previous syncRealtimeCache tick is still running.'
        };
      }
      runtimeCache.put(REALTIME_TICK_RUNNING_CACHE_KEY, new Date().toISOString(), REALTIME_TICK_RUNNING_TTL_SECONDS);
    } finally {
      startLock.releaseLock();
    }

    try {
      var nowMillis = new Date().getTime();
      syncTripNotificationsIfDue_(props, nowMillis);
      enqueueDetectedSourceChangesIfDue_(props, nowMillis);
      var pendingWork = ManualReportRefreshQueueService.claimNextDue([
        { key: 'transport', context: manualReportRefreshQueueContext_() },
        { key: 'fund', context: fundRefreshQueueContext_() }
      ], props.getProperty(REALTIME_QUEUE_PREFERENCE_PROP) || 'transport');
      if (pendingWork.due) {
        props.setProperty(REALTIME_QUEUE_PREFERENCE_PROP, pendingWork.nextPreferredKey);
      }
      var pendingClaim = pendingWork.claims.transport || { due: false, pending: false };
      var pendingFundClaim = pendingWork.claims.fund || { due: false, pending: false };
      writeRealtimeHeartbeatIfDue_(props, nowMillis, pendingClaim, pendingFundClaim);
      if (pendingWork.key === 'transport') {
        return runPendingTransportReportSync_(pendingWork.item);
      }
      if (pendingWork.key === 'fund') {
        return runPendingFundSync_(pendingWork.item);
      }

      if (!claimRealtimeSweep_(props, nowMillis)) {
        return {
          ok: true,
          mode: 'tick',
          skipped: true,
          reason: 'No due refresh work; hourly safety sweep is not due.',
          pendingTransport: pendingClaim.pending === true,
          pendingFund: pendingFundClaim.pending === true
        };
      }
      var steps = buildRealtimeTickSteps_();
      var rawIndex = Number(props.getProperty(REALTIME_TICK_INDEX_KEY) || 0);
      var index = isNaN(rawIndex) || rawIndex < 0 ? 0 : rawIndex;
      var step = steps[index % steps.length];
      props.setProperty(REALTIME_TICK_INDEX_KEY, String((index + 1) % steps.length));

      var results = [];
      var errors = [];
      runRealtimeTickStep_(step, results, errors);
      var syncedAt = new Date().toISOString();
      writeSyncStatus_(
        'realtime_cache_tick',
        'system',
        errors.length ? 'error' : 'ok',
        errors.length ? JSON.stringify(errors) : 'Realtime cache tick synced: ' + step.name,
        syncedAt
      );
      return {
        ok: errors.length === 0,
        mode: 'tick',
        step: step.name,
        nextStep: steps[(index + 1) % steps.length].name,
        synced: results.length,
        failed: errors.length,
        results: results,
        errors: errors
      };
    } finally {
      runtimeCache.remove(REALTIME_TICK_RUNNING_CACHE_KEY);
    }
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

  function syncTripNotificationsIfDue_(props, nowMillis) {
    var nextAt = Number(props.getProperty(TRIP_NOTIFICATION_NEXT_AT_PROP) || 0);
    if (nextAt > nowMillis) return { checked: false };
    props.setProperty(TRIP_NOTIFICATION_NEXT_AT_PROP, String(nowMillis + TRIP_NOTIFICATION_INTERVAL_MS));
    var results = [];
    var errors = [];
    runSyncStep_(results, errors, 'tripNotifications', function () { return syncTripNotifications(); });
    runSyncStep_(results, errors, 'operationalNotifications', function () { return syncOperationalNotifications(); });
    runSyncStep_(results, errors, 'dailyBusinessSummary', function () { return syncDailyBusinessSummary(); });
    runSyncStep_(results, errors, 'notificationDispatch', function () { return dispatchNotifications(); });
    if (errors.length) {
      props.setProperty(TRIP_NOTIFICATION_NEXT_AT_PROP, String(nowMillis + SOURCE_POLL_RETRY_MS));
      writeSyncStatus_('notification_pipeline', 'system', 'error', JSON.stringify(errors), new Date(nowMillis).toISOString());
      console.log('notification_pipeline_failed: ' + JSON.stringify(errors));
      return { checked: true, ok: false, results: results, errors: errors };
    }
    writeSyncStatus_('notification_pipeline', 'system', 'ok', 'Notification bundles synced and delivery evaluated.', new Date(nowMillis).toISOString());
    return { checked: true, ok: true, results: results };
  }

  function enqueueDetectedSourceChangesIfDue_(props, nowMillis) {
    var nextAt = Number(props.getProperty(SOURCE_POLL_NEXT_AT_PROP) || 0);
    if (nextAt > nowMillis) return { checked: false };
    props.setProperty(SOURCE_POLL_NEXT_AT_PROP, String(nowMillis + SOURCE_POLL_INTERVAL_MS));
    var sources = [
      { key: 'transport', spreadsheetId: APP_CONFIG.spreadsheetId, sheetName: 'NL_VanChuyen', width: 8, kind: 'transport' },
      { key: 'fund_transactions', spreadsheetId: DEFAULT_FUND_SPREADSHEET_ID, sheetName: 'NHAP_THUCHI', width: 14, kind: 'fund' },
      { key: 'fund_loans', spreadsheetId: DEFAULT_FUND_SPREADSHEET_ID, sheetName: 'NHAP_VAY', width: 14, kind: 'fund' }
    ];
    var changed = [];
    sources.forEach(function (source) {
      try {
        var state = readSourceTailState_(source);
        var propertyKey = SOURCE_FINGERPRINT_PREFIX + source.key.toUpperCase();
        var previous = props.getProperty(propertyKey) || '';
        if (previous === state.fingerprint) return;
        changed.push({ key: source.key, months: state.months, lastRow: state.lastRow });
        var queued = null;
        if (source.kind === 'transport') {
          queued = enqueueManualReportRefresh_({ months: state.months, full: !state.months.length, source: 'poll:transport' });
        } else {
          queued = enqueueRefreshWithFallback_({
            months: state.months,
            full: !state.months.length,
            source: 'poll:' + source.key
          }, fundRefreshQueueContext_(), 'fund:' + source.key);
          if (source.key === 'fund_transactions') {
            var downstream = enqueueManualReportRefresh_({
              months: state.months,
              full: !state.months.length,
              delayMs: FUND_TO_TRANSPORT_DELAY_MS,
              verificationPasses: 1,
              source: 'poll:fund-downstream'
            });
            if (downstream && downstream.deferred) queued = downstream;
          }
        }
        if (queued && queued.deferred) throw new Error(queued.error || 'Refresh queue was deferred.');
        props.setProperty(propertyKey, state.fingerprint);
      } catch (err) {
        props.setProperty(SOURCE_POLL_NEXT_AT_PROP, String(nowMillis + SOURCE_POLL_RETRY_MS));
        console.log('source_poll_failed:' + source.key + ': ' + (err && err.message ? err.message : err));
      }
    });
    try {
      var reportOutputChanges = enqueueDetectedReportOutputChanges_(props);
      if (reportOutputChanges.changed) changed.push(reportOutputChanges);
    } catch (err) {
      props.setProperty(SOURCE_POLL_NEXT_AT_PROP, String(nowMillis + SOURCE_POLL_RETRY_MS));
      console.log('source_poll_failed:report_outputs: ' + (err && err.message ? err.message : err));
    }
    return { checked: true, changed: changed };
  }

  function enqueueDetectedReportOutputChanges_(props) {
    var state = readReportOutputState_();
    var previous = ReportOutputFreshnessService.parseFingerprintMap(props.getProperty(REPORT_OUTPUT_FINGERPRINT_PROP));
    var changedMonths = ReportOutputFreshnessService.changedMonths(previous, state.fingerprints);
    if (!changedMonths.length) return { key: 'report_outputs', changed: false, months: [] };
    var queued = enqueueManualReportRefresh_({
      months: changedMonths,
      full: false,
      includeAll: true,
      source: 'poll:report-outputs'
    });
    if (queued && queued.deferred) throw new Error(queued.error || 'Report output refresh queue was deferred.');
    props.setProperty(REPORT_OUTPUT_FINGERPRINT_PROP, JSON.stringify(state.fingerprints));
    return { key: 'report_outputs', changed: true, months: changedMonths, rows: state.rows };
  }

  function readReportOutputState_() {
    var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var tables = ReportTableService.readFreshnessTables(ss);
    return ReportOutputFreshnessService.buildState(tables, {
      resolveMonthKey: function (value) {
        var date = parseDateValue_(value);
        return date ? Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM') : normalizeYearMonthKey_(value);
      },
      hash: sha256Hex_
    });
  }

  function sha256Hex_(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || '')).map(function (item) {
      var byte = item < 0 ? item + 256 : item;
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }

  function readSourceTailState_(source) {
    var sheet = SpreadsheetApp.openById(source.spreadsheetId).getSheetByName(source.sheetName);
    if (!sheet) throw new Error('Không tìm thấy sheet ' + source.sheetName + '.');
    var lastRow = Math.max(1, Number(sheet.getLastRow() || 1));
    var startRow = Math.max(2, lastRow - 24);
    var numRows = lastRow >= 2 ? lastRow - startRow + 1 : 0;
    var values = numRows ? sheet.getRange(startRow, 1, numRows, source.width).getValues() : [];
    var months = {};
    values.forEach(function (row) {
      var date = parseDateValue_(row && row[1]);
      if (date) months[Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM')] = true;
    });
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify({ lastRow: lastRow, values: values })
    );
    var fingerprint = digest.map(function (value) {
      var byte = value < 0 ? value + 256 : value;
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
    return { fingerprint: fingerprint, lastRow: lastRow, months: Object.keys(months).sort().reverse() };
  }

  function claimRealtimeSweep_(props, nowMillis) {
    var nextAt = Number(props.getProperty(REALTIME_SWEEP_NEXT_AT_PROP) || 0);
    if (nextAt > nowMillis) return false;
    props.setProperty(REALTIME_SWEEP_NEXT_AT_PROP, String(nowMillis + REALTIME_SWEEP_INTERVAL_MS));
    return true;
  }

  function writeRealtimeHeartbeatIfDue_(props, nowMillis, pendingTransport, pendingFund) {
    var nextAt = Number(props.getProperty(REALTIME_HEARTBEAT_NEXT_AT_PROP) || 0);
    if (nextAt > nowMillis) return;
    props.setProperty(REALTIME_HEARTBEAT_NEXT_AT_PROP, String(nowMillis + REALTIME_HEARTBEAT_INTERVAL_MS));
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

  function enqueueRefreshWithFallback_(options, context, queueName) {
    try {
      return ManualReportRefreshQueueService.enqueue(options || {}, context);
    } catch (err) {
      var message = err && err.message ? err.message : String(err);
      PropertiesService.getScriptProperties().setProperty(SOURCE_POLL_NEXT_AT_PROP, '0');
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

  function runPendingTransportReportSync_(pending) {
    return withInternalReportRefreshGuard_(function () {
      return runPendingTransportReportSyncUnguarded_(pending);
    });
  }

  function runPendingTransportReportSyncUnguarded_(pending) {
    var results = [];
    var errors = [];
    var context = manualReportRefreshQueueContext_();
    runSyncStep_(results, errors, 'dashboard', function () { return syncDashboard(); });
    var polledTransport = (pending.sources || []).some(function (source) { return source === 'poll:transport'; });
    if (polledTransport) {
      runSyncStep_(results, errors, 'manageData:NL_VanChuyen', function () {
        return syncManageDataBundle('NL_VanChuyen');
      });
      (pending.months || []).forEach(function (monthKey) {
        runSyncStep_(results, errors, 'manageData:NL_VanChuyen:' + monthKey, function () {
          return syncManageMonthBundle('NL_VanChuyen', monthKey);
        });
      });
    }
    if (pending.full === true) {
      try {
        var fullResult = syncAllReportBundles();
        results.push({ name: 'reports:full', result: fullResult });
        if (!fullResult || fullResult.ok === false) {
          errors.push({ name: 'reports:full', error: JSON.stringify((fullResult && fullResult.errors) || ['Full report sync failed.']) });
        }
      } catch (err) {
        errors.push({ name: 'reports:full', error: err && err.message ? err.message : String(err) });
      }
    } else {
      (pending.months || []).forEach(function (monthKey) {
        runSyncStep_(results, errors, 'report:' + monthKey, function () {
          return syncReportBundle(formatMonthKeyForReport_(monthKey));
        });
      });
      if (pending.includeAll !== false) {
        runSyncStep_(results, errors, 'report:Tất cả', function () {
          return syncReportBundle('Tất cả');
        });
      }
    }

    var syncedAt = new Date().toISOString();
    var retry = null;
    if (errors.length) {
      retry = ManualReportRefreshQueueService.requeue(pending, context);
    } else if (Number(pending.verificationPasses || 0) > 0) {
      retry = enqueueManualReportRefresh_({
        full: pending.full === true,
        includeAll: pending.includeAll !== false,
        months: pending.months || [],
        delayMs: TRANSPORT_REPORT_VERIFICATION_DELAY_MS,
        verificationPasses: Number(pending.verificationPasses || 0) - 1,
        source: 'verification:report-formulas'
      });
    }
    writeSyncStatus_(
      'transport_reports_manual_sheet',
      'transport',
      errors.length ? 'error' : 'ok',
      errors.length ? JSON.stringify(errors) : 'Manual Sheet report cache synced.',
      syncedAt
    );
    return {
      ok: errors.length === 0,
      mode: 'tick',
      step: 'transportReportsPending',
      full: pending.full === true,
      months: (pending.months || []).slice(),
      synced: results.length,
      failed: errors.length,
      results: results,
      errors: errors,
      retry: retry
    };
  }

  function runPendingFundSync_(pending) {
    var results = [];
    var errors = [];
    var context = fundRefreshQueueContext_();
    if (pending.full === true) {
      try {
        var fullResult = syncAllFundBundles(DEFAULT_FUND_YEAR);
        results.push({ name: 'fund:full', result: fullResult });
        if (!fullResult || fullResult.ok === false) {
          errors.push({ name: 'fund:full', error: JSON.stringify((fullResult && fullResult.errors) || ['Full fund sync failed.']) });
        }
      } catch (err) {
        errors.push({ name: 'fund:full', error: err && err.message ? err.message : String(err) });
      }
    } else {
      try {
        var result = syncFundAfterWrite(DEFAULT_FUND_YEAR, { months: pending.months || [] });
        results.push({ name: 'fund:months', result: result });
        if (!result || result.ok === false) {
          errors.push({ name: 'fund:months', error: JSON.stringify((result && result.errors) || ['Fund month sync failed.']) });
        }
      } catch (err) {
        errors.push({ name: 'fund:months', error: err && err.message ? err.message : String(err) });
      }
    }

    var syncedAt = new Date().toISOString();
    var retry = null;
    if (errors.length) retry = ManualReportRefreshQueueService.requeue(pending, context);
    writeSyncStatus_(
      'fund_manual_sheet',
      'fund',
      errors.length ? 'error' : 'ok',
      errors.length ? JSON.stringify(errors) : 'Manual Fund Sheet cache synced.',
      syncedAt
    );
    return {
      ok: errors.length === 0,
      mode: 'tick',
      step: 'fundPending',
      full: pending.full === true,
      months: (pending.months || []).slice(),
      synced: results.length,
      failed: errors.length,
      results: results,
      errors: errors,
      retry: retry
    };
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
    var result = ManageSyncService.syncTransportSheetChange(eventType, sheetName, editedRange, manageSyncContext_());
    if (TRANSPORT_CATALOG_SHEET_NAMES.indexOf(safeSheetName) !== -1) {
      var displaySheetName = safeSheetName === 'DM_ThamSo' ? 'DM_ThamSo_TS' : safeSheetName;
      result.catalogSync = syncCatalogAfterWrite(displaySheetName);
      result.reportRefresh = enqueueManualReportRefresh_({
        months: [],
        full: true,
        verificationPasses: 1,
        source: 'catalog-sheet:' + safeSheetName + ':' + (clean_(eventType) || 'UNKNOWN')
      });
    } else if (!result.skipped) {
      result.reportRefresh = enqueueManualReportRefresh_({
        months: result.months || [],
        full: isStructuralSheetChange_(eventType),
        verificationPasses: 1,
        source: 'sheet:' + clean_(sheetName) + ':' + (clean_(eventType) || 'UNKNOWN')
      });
    }
    return result;
  }

  function handleTransportSheetEdit(e) {
    activateFromSpreadsheetEvent_(e);
    var range = e && e.range;
    var sheet = range && range.getSheet ? range.getSheet() : null;
    var sheetName = sheet && sheet.getName ? sheet.getName() : '';
    return syncTransportSheetChange('EDIT', sheetName, range || null);
  }

  function handleTransportSheetChange(e) {
    activateFromSpreadsheetEvent_(e);
    var sheet = getEventActiveSheet_(e);
    var sheetName = sheet && sheet.getName ? sheet.getName() : '';
    if (!sheetName) {
      return syncUnknownTransportSheetChange_((e && e.changeType) || 'CHANGE');
    }
    return syncTransportSheetChange((e && e.changeType) || 'CHANGE', sheetName, null);
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
    var range = e && e.range;
    var sheet = range && range.getSheet ? range.getSheet() : null;
    var sheetName = sheet && sheet.getName ? sheet.getName() : '';
    return syncFundSheetChange('EDIT', sheetName, range || null);
  }

  function handleFundSheetChange(e) {
    var sheet = getEventActiveSheet_(e);
    var sheetName = sheet && sheet.getName ? sheet.getName() : '';
    return syncFundSheetChange((e && e.changeType) || 'CHANGE', sheetName, null);
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
    var result = ManageSyncService.syncUnknownTransportSheetChange(eventType, manageSyncContext_());
    if (!result.skipped) {
      result.reportRefresh = enqueueManualReportRefresh_({
        full: true,
        source: 'sheet:unknown:' + (clean_(eventType) || 'CHANGE')
      });
    }
    return result;
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
    var raw = PropertiesService.getScriptProperties().getProperty(INTERNAL_REPORT_REFRESH_TOKENS_PROP);
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
    return FundSyncService.syncFundAfterWrite(year, options, fundSyncContext_());
  }

  function syncFundTransactionsAfterWrite(year, transactions) {
    return FundSyncService.syncFundTransactionsAfterWrite(year, transactions, fundSyncContext_());
  }

  function isWriteJobEnabled_() {
    return ASYNC_WRITE_ENABLED || ASYNC_TRANSPORT_WRITE_ENABLED || ASYNC_FUND_TRANSACTION_ADD_ENABLED;
  }

  function isWriteJobAllowed_(moduleName, actionName) {
    if (ASYNC_WRITE_ENABLED) return true;
    var safeModule = clean_(moduleName);
    var safeAction = clean_(actionName);
    if (ASYNC_TRANSPORT_WRITE_ENABLED && safeModule === 'transport') {
      return safeAction === 'submitRows' || safeAction === 'saveSheetRow' || safeAction === 'deleteSheetRow';
    }
    return ASYNC_FUND_TRANSACTION_ADD_ENABLED && safeModule === 'fund' && safeAction === 'addFundTransactions';
  }

  function shouldQueueFundTransactions() {
    return ASYNC_WRITE_ENABLED || ASYNC_FUND_TRANSACTION_ADD_ENABLED;
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
    var safeYear = clean_(year) || DEFAULT_FUND_YEAR;
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

  function getRecentWriteJobs(moduleName, actionName, limit) {
    var safeLimit = Math.min(Math.max(parseInt(limit || 20, 10) || 20, 1), 100);
    var safeModule = clean_(moduleName);
    var safeAction = clean_(actionName);
    var jobs = WriteJobRepository.listRecent(safeModule, safeAction, safeLimit);
    return {
      ok: true,
      jobs: jobs,
      count: jobs.length,
      checkedAt: new Date().toISOString()
    };
  }

  function getReportCacheAudit(months) {
    var requestedMonths = CacheAuditService.normalizeReportMonths(months, REPORT_AUDIT_MONTHS);
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
      var liveBundle = cached && cached.payload ? ReportService.getReportBundle(month, true) : null;
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
      sheet_name: 'in.(' + requestedSheets.map(CacheAuditService.encodeSupabaseInValue).join(',') + ')',
      filter_key: 'eq.' + DEFAULT_MANAGE_FILTER_KEY,
      select: 'sheet_name,payload,synced_at,updated_at',
      limit: String(requestedSheets.length)
    });
    var cachedBySheet = {};
    (rows || []).forEach(function (row) {
      cachedBySheet[clean_(row.sheet_name)] = row;
    });

    var checkedAt = new Date().toISOString();
    var results = requestedSheets.map(function (sheetName) {
      var cached = cachedBySheet[sheetName];
      var livePayload = cached && cached.payload ? ManageService.readManageData(sheetName, '', '', auditLimit) : null;
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
    WriteJobRepository.retry(safeJobId, new Date().toISOString());
    return getWriteJobStatus(safeJobId);
  }

  function processWriteJobs(maxJobs) {
    return WriteJobWorker.process(maxJobs, writeJobWorkerContext_());
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
    return {
      ok: true,
      spreadsheetId: targetSpreadsheetId,
      installed: 2,
      removed: removed,
      handlers: Object.keys(handlers)
    };
  }

  function installFundSheetSyncTrigger(spreadsheetId) {
    var targetSpreadsheetId = clean_(spreadsheetId) || DEFAULT_FUND_SPREADSHEET_ID;
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
    return {
      ok: true,
      spreadsheetId: targetSpreadsheetId,
      installed: 2,
      removed: removed,
      handlers: Object.keys(handlers)
    };
  }

  function installE16RTriggers() {
    return {
      ok: true,
      realtime: installSupabaseSyncTriggers(),
      transport: installTransportSheetSyncTrigger(APP_CONFIG.spreadsheetId),
      fund: installFundSheetSyncTrigger(DEFAULT_FUND_SPREADSHEET_ID),
      writeJobs: installWriteJobTrigger()
    };
  }

  function executeWriteJob_(job) {
    var actionName = clean_(job.action);
    if (TransportJobHandler.canHandle(actionName)) {
      return TransportJobHandler.execute(job, transportJobHandlerContext_());
    }
    if (FundJobHandler.canHandle(job, clean_)) {
      return FundJobHandler.execute(job, fundJobHandlerContext_());
    }
    throw new Error('Write job action chưa được hỗ trợ: ' + actionName);
  }

  function buildRealtimeTickSteps_() {
    var steps = [
      { name: 'dashboard' },
      { name: 'reportsRecent' },
      { name: 'reportsAll' },
      { name: 'fundRecent' },
      { name: 'fundCatalogs' },
      { name: 'startupCatalogs' }
    ];
    MANAGE_SHEET_NAMES.forEach(function (sheetName) {
      steps.push({ name: 'manageRecent:' + sheetName, sheetName: sheetName });
    });
    return steps;
  }

  function runRealtimeTickStep_(step, results, errors) {
    if (!step || !step.name) return;
    if (step.name === 'dashboard') {
      runSyncStep_(results, errors, 'dashboard', function () { return syncDashboard(); });
      return;
    }
    if (step.name === 'reportsRecent') {
      getRecentReportMonths_(2).forEach(function (month) {
        runSyncStep_(results, errors, 'report:' + month, function () {
          return syncReportBundle(month);
        });
      });
      return;
    }
    if (step.name === 'reportsAll') {
      runSyncStep_(results, errors, 'report:Tất cả', function () {
        return syncReportBundle('Tất cả');
      });
      return;
    }
    if (step.name === 'fundRecent') {
      runSyncStep_(results, errors, 'fundOverviewLatest', function () { return syncFundOverview(DEFAULT_FUND_YEAR, ''); });
      runSyncStep_(results, errors, 'fundTransactionsRecent', function () { return syncFundTransactions(DEFAULT_FUND_YEAR, { limit: 500 }); });
      runSyncStep_(results, errors, 'fundLoansLatest', function () { return syncFundLoanOverview(DEFAULT_FUND_YEAR, ''); });
      getRecentFundMonthKeys_(DEFAULT_FUND_YEAR, 2).forEach(function (monthKey) {
        runSyncStep_(results, errors, 'fundOverview:' + monthKey, function () {
          return syncFundOverview(DEFAULT_FUND_YEAR, monthKey);
        });
        runSyncStep_(results, errors, 'fundTransactions:' + monthKey, function () {
          return syncFundTransactionMonth(DEFAULT_FUND_YEAR, monthKey);
        });
        runSyncStep_(results, errors, 'fundLoans:' + monthKey, function () {
          return syncFundLoanOverview(DEFAULT_FUND_YEAR, monthKey);
        });
      });
      return;
    }
    if (step.name === 'fundCatalogs') {
      runSyncStep_(results, errors, 'fundCatalogs', function () {
        return syncAllFundCatalogBundles(DEFAULT_FUND_YEAR);
      });
      return;
    }
    if (step.name === 'startupCatalogs') {
      runSyncStep_(results, errors, 'startupCatalogs', function () { return syncAllStartupAndCatalogs(); });
      return;
    }
    if (step.sheetName) {
      runSyncStep_(results, errors, 'manageData:' + step.sheetName, function () {
        return syncManageDataBundle(step.sheetName);
      });
      getRecentManageMonthKeys_(step.sheetName, 2).forEach(function (monthKey) {
        runSyncStep_(results, errors, 'manageData:' + step.sheetName + ':' + monthKey, function () {
          return syncManageMonthBundle(step.sheetName, monthKey);
        });
      });
    }
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

  function startupCatalogSyncContext_() {
    return {
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      getStartupData: function (formType) { return SheetService.getStartupData(formType); },
      getCatalogs: function (formType) { return CatalogService.getCatalogs(formType); },
      readCatalogData: function (displaySheetName) { return CatalogService.readCatalogData(displaySheetName); },
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

  function manualReportRefreshQueueContext_() {
    var props = PropertiesService.getScriptProperties();
    return {
      debounceMs: TRANSPORT_REPORT_DEBOUNCE_MS,
      retryDelayMs: TRANSPORT_REPORT_RETRY_DELAY_MS,
      nowMillis: function () { return new Date().getTime(); },
      nowISOString: function () { return new Date().toISOString(); },
      normalizeYearMonthKey: normalizeYearMonthKey_,
      getProperty: function (key) { return props.getProperty(key); },
      setProperty: function (key, value) { props.setProperty(key, value); },
      deleteProperty: function (key) { props.deleteProperty(key); },
      withLock: function (fn) {
        var lock = LockService.getScriptLock();
        lock.waitLock(REFRESH_QUEUE_LOCK_WAIT_MS);
        try {
          return fn();
        } finally {
          lock.releaseLock();
        }
      }
    };
  }

  function fundRefreshQueueContext_() {
    var context = manualReportRefreshQueueContext_();
    context.propertyKey = FUND_REFRESH_PROPERTY_KEY;
    context.debounceMs = FUND_REFRESH_DEBOUNCE_MS;
    context.retryDelayMs = FUND_REFRESH_RETRY_DELAY_MS;
    return context;
  }

  function manageSyncContext_() {
    var ss = null;
    return {
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
        return ManageService.readManageData(sheetName, startDate, endDate, limit);
      },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_,
      syncDashboard: syncDashboard,
      runtimeCache: CacheService.getScriptCache(),
      runningKeyPrefix: TRANSPORT_SHEET_SYNC_RUNNING_CACHE_KEY,
      runningTtlSeconds: TRANSPORT_SHEET_SYNC_RUNNING_TTL_SECONDS
    };
  }

  function fundSyncContext_() {
    return {
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      encodeSearch: function (value) { return Utilities.base64EncodeWebSafe(value).replace(/=+$/, ''); },
      getFundOverview: function (year, filter) { return FundService.getFundOverview(year, filter); },
      getFundTransactions: function (year, filter) { return FundService.getFundTransactions(year, filter); },
      getFundLoanOverview: function (year, filter) { return FundService.getFundLoanOverview(year, filter); },
      getFundFormOptions: function (year, forceRefresh) { return FundService.getFundFormOptions(year, forceRefresh); },
      getFundCatalog: function (year, group, forceRefresh) { return FundService.getFundCatalog(year, group, forceRefresh); },
      parseDateValue: parseDateValue_,
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_
    };
  }

  function tripNotificationSyncContext_() {
    return {
      nowDate: function () { return new Date(); },
      nowISOString: function () { return new Date().toISOString(); },
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); },
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
      saveSheetRow: function (sheetName, rowIndex, rowData, previousRowData) {
        return EntryService.saveSheetRow(sheetName, rowIndex, rowData, previousRowData);
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
      addFundTransactions: function (year, transactions, options) {
        return FundService.addFundTransactions(year, transactions, options);
      },
      syncFundTransactionsAfterWrite: syncFundTransactionsAfterWrite
    };
  }

  function getSupabaseSyncStatus(limit, moduleName) {
    var safeLimit = Math.min(Math.max(parseInt(limit || 30, 10) || 30, 1), 100);
    var query = {
      select: 'sync_key,module,status,message,synced_at,updated_at',
      order: 'synced_at.desc',
      limit: safeLimit
    };
    var safeModule = clean_(moduleName);
    if (safeModule) query.module = 'eq.' + safeModule;
    var rows = SupabaseSyncStatusRepository.readRows(query);
    var now = new Date().getTime();
    rows = (rows || []).map(function (row) {
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
    return StartupCatalogSyncService.buildCatalogsKey(formType, clean_);
  }

  function buildCatalogDataKey_(displaySheetName) {
    return StartupCatalogSyncService.buildCatalogDataKey(displaySheetName, clean_);
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
    try {
      var value = PropertiesService.getScriptProperties().getProperty(propertyName);
      if (value === null || value === undefined || value === '') return Boolean(fallbackValue);
      return ['1', 'true', 'yes', 'on'].indexOf(String(value).trim().toLowerCase()) !== -1;
    } catch (err) {
      return Boolean(fallbackValue);
    }
  }

  return {
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
    syncManageDataBundle: syncManageDataBundle,
    syncManageMonthBundle: syncManageMonthBundle,
    syncAllManageDataBundles: syncAllManageDataBundles,
    syncFullRealtimeCache: syncFullRealtimeCache,
    syncRealtimeCache: syncRealtimeCache,
    syncTripNotifications: syncTripNotifications,
    syncOperationalNotifications: syncOperationalNotifications,
    dispatchNotifications: dispatchNotifications,
    getPendingTransportReportRefresh: getPendingTransportReportRefresh,
    getPendingFundRefresh: getPendingFundRefresh,
    auditManualReportFreshnessQueue: auditManualReportFreshnessQueue,
    getSupabaseSyncStatus: getSupabaseSyncStatus,
    getReportCacheAudit: getReportCacheAudit,
    getManageCacheAudit: getManageCacheAudit,
    syncReportBundle: syncReportBundle,
    syncAllReportBundles: syncAllReportBundles,
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
    syncRecentManageDataCache: syncRecentManageDataCache,
    testReportSync: testReportSync
  };
})();
