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
    'NL_NghiVanHanh'
  ];
  var DEFAULT_MANAGE_FILTER_KEY = 'recent_500';
  var ASYNC_WRITE_ENABLED = false;
  var ASYNC_TRANSPORT_WRITE_ENABLED = true;
  var ASYNC_FUND_TRANSACTION_ADD_ENABLED = readBooleanProperty_('ASYNC_FUND_TRANSACTION_ADD_ENABLED', false);
  var REPORT_AUDIT_MONTHS = ['05/2026', '06/2026', '07/2026', 'Tất cả'];
  var REALTIME_TICK_INDEX_KEY = 'SUPABASE_REALTIME_TICK_INDEX';
  var REALTIME_TICK_RUNNING_CACHE_KEY = 'SUPABASE_REALTIME_TICK_RUNNING';
  var TRANSPORT_SHEET_SYNC_RUNNING_CACHE_KEY = 'SUPABASE_TRANSPORT_SHEET_SYNC_RUNNING';
  var REALTIME_TICK_INTERVAL_MINUTES = 1;
  var REALTIME_TICK_RUNNING_TTL_SECONDS = 300;
  var TRANSPORT_SHEET_SYNC_RUNNING_TTL_SECONDS = 120;

  function syncReportBundle(month) {
    return ReportSyncService.syncReportBundle(month, reportSyncContext_());
  }

  function testReportSync() {
    return syncReportBundle('latest');
  }

  function syncDashboard() {
    return ReportSyncService.syncDashboard(reportSyncContext_());
  }

  function syncAllReportBundles() {
    return ReportSyncService.syncAllReportBundles(reportSyncContext_());
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
    if (runtimeCache.get(REALTIME_TICK_RUNNING_CACHE_KEY)) {
      return {
        ok: true,
        mode: 'tick',
        skipped: true,
        reason: 'Previous syncRealtimeCache tick is still running.'
      };
    }
    runtimeCache.put(REALTIME_TICK_RUNNING_CACHE_KEY, new Date().toISOString(), REALTIME_TICK_RUNNING_TTL_SECONDS);

    try {
      var steps = buildRealtimeTickSteps_();
      var props = PropertiesService.getScriptProperties();
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
      if (!fastMode) {
        touchedMonthKeys.forEach(function (monthKey) {
          runSyncStep_(results, errors, 'manageData:' + safeSheetName + ':' + monthKey, function () {
            return syncManageMonthBundle(safeSheetName, monthKey);
          });
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
    return ManageSyncService.syncTransportSheetChange(eventType, sheetName, editedRange, manageSyncContext_());
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

  function syncUnknownTransportSheetChange_(eventType) {
    return ManageSyncService.syncUnknownTransportSheetChange(eventType, manageSyncContext_());
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
    var now = new Date();
    var voucherSeed = Utilities.formatDate(now, APP_CONFIG.timezone, 'yyMMddHHmmss') + String(now.getMilliseconds()).padStart(3, '0');
    var prepared = safeTransactions.map(function (transaction, index) {
      var copy = {};
      Object.keys(transaction || {}).forEach(function (key) { copy[key] = transaction[key]; });
      copy.voucher = clean_(copy.voucher) || voucherSeed + '-' + String(index + 1).padStart(2, '0');
      return copy;
    });
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

  function executeWriteJob_(job) {
    var actionName = clean_(job.action);
    var payload = job.payload || {};
    if (actionName === 'submitRows') {
      var result = EntryService.submitRows(payload.formType, payload.rows || [], { jobId: job.id, idempotencyKey: job.idempotency_key });
      assertWriteResultOk_(result, 'Không thể ghi dữ liệu Vận hành.');
      if (result && result.inserted) {
        try {
          result.supabaseSync = syncTransportAfterWrite(result.sheetName, payload.rows || [], { fast: true });
        } catch (syncErr) {
          result.supabaseSync = { ok: false, error: syncErr && syncErr.message ? syncErr.message : String(syncErr) };
        }
        try {
          result.dashboardSync = syncDashboard();
        } catch (dashboardErr) {
          result.dashboardSync = { ok: false, error: dashboardErr && dashboardErr.message ? dashboardErr.message : String(dashboardErr) };
        }
        try {
          result.reportSync = syncTransportReportsAfterWrite(result.sheetName, payload.rows || [], { includeAll: true });
        } catch (reportErr) {
          result.reportSync = { ok: false, error: reportErr && reportErr.message ? reportErr.message : String(reportErr) };
        }
      }
      return result;
    }
    if (actionName === 'saveSheetRow') {
      var saveResult = EntryService.saveSheetRow(payload.sheetName, payload.rowIndex, payload.rowData || {}, payload.previousRowData || null);
      assertWriteResultOk_(saveResult, 'Không thể sửa dòng Vận hành.');
      if (saveResult && saveResult.ok !== false) {
        try {
          saveResult.supabaseSync = syncTransportAfterWrite(payload.sheetName, [payload.rowData || {}], { fast: true });
        } catch (saveSyncErr) {
          saveResult.supabaseSync = { ok: false, error: saveSyncErr && saveSyncErr.message ? saveSyncErr.message : String(saveSyncErr) };
        }
        if (payload.sheetName === 'NL_VanChuyen') {
          try {
            saveResult.dashboardSync = syncDashboard();
          } catch (saveDashboardErr) {
            saveResult.dashboardSync = { ok: false, error: saveDashboardErr && saveDashboardErr.message ? saveDashboardErr.message : String(saveDashboardErr) };
          }
        }
        try {
          saveResult.reportSync = syncTransportReportsAfterWrite(payload.sheetName, [payload.previousRowData || {}, payload.rowData || {}], { includeAll: true });
        } catch (saveReportErr) {
          saveResult.reportSync = { ok: false, error: saveReportErr && saveReportErr.message ? saveReportErr.message : String(saveReportErr) };
        }
      }
      return saveResult;
    }
    if (actionName === 'deleteSheetRow') {
      if (!Array.isArray(payload.columnsToClear) || !payload.columnsToClear.length) {
        throw new Error('Job deleteSheetRow không có columnsToClear; từ chối deleteRow() để tránh xóa nhầm khi retry.');
      }
      var deleteResult = EntryService.deleteSheetRow(payload.sheetName, payload.rowIndex, payload.columnsToClear || null, payload.rowData || null);
      assertWriteResultOk_(deleteResult, 'Không thể xóa nội dung dòng Vận hành.');
      if (deleteResult && deleteResult.ok !== false) {
        try {
          deleteResult.supabaseSync = syncTransportAfterWrite(payload.sheetName, [], { fast: true });
        } catch (deleteSyncErr) {
          deleteResult.supabaseSync = { ok: false, error: deleteSyncErr && deleteSyncErr.message ? deleteSyncErr.message : String(deleteSyncErr) };
        }
        if (payload.sheetName === 'NL_VanChuyen') {
          try {
            deleteResult.dashboardSync = syncDashboard();
          } catch (deleteDashboardErr) {
            deleteResult.dashboardSync = { ok: false, error: deleteDashboardErr && deleteDashboardErr.message ? deleteDashboardErr.message : String(deleteDashboardErr) };
          }
        }
        try {
          deleteResult.reportSync = syncTransportReportsAfterWrite(payload.sheetName, [payload.rowData || {}], { includeAll: true });
        } catch (deleteReportErr) {
          deleteResult.reportSync = { ok: false, error: deleteReportErr && deleteReportErr.message ? deleteReportErr.message : String(deleteReportErr) };
        }
      }
      return deleteResult;
    }
    if (clean_(job.module) === 'fund' && actionName === 'addFundTransactions') {
      var fundResult = FundService.addFundTransactions(payload.year, payload.transactions || [], {
        jobId: job.id,
        idempotencyKey: job.idempotency_key
      });
      assertWriteResultOk_(fundResult, 'Không thể ghi giao dịch Thu chi.');
      try {
        fundResult.supabaseSync = syncFundTransactionsAfterWrite(payload.year, payload.transactions || []);
      } catch (fundSyncErr) {
        fundResult.supabaseSync = { ok: false, error: fundSyncErr && fundSyncErr.message ? fundSyncErr.message : String(fundSyncErr) };
      }
      return fundResult;
    }
    throw new Error('Write job action chưa được hỗ trợ: ' + actionName);
  }

  function assertWriteResultOk_(result, fallbackMessage) {
    if (result && result.ok !== false) return result;
    var errorMessage = result && (result.error || (result.errors && result.errors.join('; ')));
    throw new Error(errorMessage || fallbackMessage || 'Write job thất bại.');
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
      getReportBundle: function (month, forceRefresh) {
        return ReportService.getReportBundle(month, forceRefresh);
      },
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
      getFundFormOptions: function (year) { return FundService.getFundFormOptions(year); },
      getFundCatalog: function (year, group) { return FundService.getFundCatalog(year, group); },
      parseDateValue: parseDateValue_,
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); },
      upsertRows: function (tableName, rows, onConflict) {
        return SupabaseBundleRepository.upsertRows(tableName, rows, onConflict);
      },
      writeSyncStatus: writeSyncStatus_,
      runSyncStep: runSyncStep_
    };
  }

  function writeJobWorkerContext_() {
    return {
      isEnabled: isWriteJobEnabled_,
      createUuid: function () { return Utilities.getUuid(); },
      claimJobs: function (payload) { return callRpc_('claim_write_jobs', payload); },
      executeJob: executeWriteJob_,
      repository: WriteJobRepository,
      clean: clean_,
      nowISOString: function () { return new Date().toISOString(); },
      nextRunISOString: function (attempts) {
        return new Date(new Date().getTime() + attempts * 60000).toISOString();
      }
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
      return {
        syncKey: row.sync_key || '',
        module: row.module || '',
        status: row.status || '',
        message: row.message || '',
        syncedAt: syncedAt,
        ageSeconds: isNaN(syncedTime) ? null : Math.max(0, Math.round((now - syncedTime) / 1000))
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
    handleTransportSheetEdit: handleTransportSheetEdit,
    handleTransportSheetChange: handleTransportSheetChange,
    syncTransportSheetChange: syncTransportSheetChange,
    syncUnknownTransportSheetChange: syncUnknownTransportSheetChange_,
    installWriteJobTrigger: installWriteJobTrigger,
    processWriteJobs: processWriteJobs,
    retryWriteJob: retryWriteJob,
    syncRecentManageDataCache: syncRecentManageDataCache,
    testReportSync: testReportSync
  };
})();
