function health() {
  return SheetService.health();
}

function getInitialData() {
  return SheetService.getInitialData();
}

function getBootstrap() {
  return SheetService.getBootstrap();
}

function getStartupData(formType) {
  return SheetService.getStartupData(formType);
}

function getCatalogs(formType) {
  return CatalogService.getCatalogs(formType);
}

function getDashboard(month, forceRefresh) {
  return ReportService.getDashboard(month, forceRefresh);
}

function getReports(forceRefresh) {
  return ReportService.getReports(forceRefresh);
}

function getReport(type, month, forceRefresh) {
  return ReportService.getReport(type, month, forceRefresh);
}

function getReportBundle(month, forceRefresh) {
  return ReportService.getReportBundle(month, forceRefresh);
}

function invalidateCaches() {
  return SheetService.invalidateCaches();
}

function cleanupOverviewTempSheets() {
  return SheetService.cleanupOverviewTempSheets();
}

function submitRows(formType, rows) {
  return withTransportSync_(rows, function () {
    return EntryService.submitRows(formType, rows);
  });
}

function checkTripReconciliation(rows) {
  return EntryService.checkTripReconciliation(rows);
}

function readSheetData(sheetName, startDate, endDate, limit) {
  return SheetReadService.readSheetData(sheetName, startDate, endDate, limit);
}

function readManageData(sheetName, startDate, endDate, limit) {
  return ManageService.readManageData(sheetName, startDate, endDate, limit);
}

function readCatalogData(displaySheetName) {
  return CatalogService.readCatalogData(displaySheetName);
}

function saveSheetRow(sheetName, rowIndex, rowData) {
  return withSheetRowSync_(sheetName, function () {
    return EntryService.saveSheetRow(sheetName, rowIndex, rowData);
  });
}

function deleteSheetRow(sheetName, rowIndex, columnsToClear) {
  return withSheetRowSync_(sheetName, function () {
    return EntryService.deleteSheetRow(sheetName, rowIndex, columnsToClear);
  });
}

function getFundTransactions(year, filter) {
  return FundService.getFundTransactions(year, filter);
}

function getFundFormOptions(year, forceRefresh) {
  return FundService.getFundFormOptions(year, forceRefresh);
}

function getFundCatalog(year, group, forceRefresh) {
  return FundService.getFundCatalog(year, group, forceRefresh);
}

function updateFundTransaction(year, rowIndex, transaction) {
  return withFundSync_(year, { transaction: transaction }, function () {
    return FundService.updateFundTransaction(year, rowIndex, transaction);
  });
}

function deleteFundTransaction(year, rowIndex, expectedTransaction) {
  return withFundSync_(year, {}, function () {
    return FundService.deleteFundTransaction(year, rowIndex, expectedTransaction);
  });
}

function addFundTransaction(year, transaction) {
  return withFundSync_(year, { transaction: transaction }, function () {
    return FundService.addFundTransaction(year, transaction);
  });
}

function addFundTransactions(year, transactions) {
  return withFundSync_(year, { transactions: transactions }, function () {
    return FundService.addFundTransactions(year, transactions);
  });
}

function addFundDebtPayment(year, rowIndex, payment, clientRequestId) {
  return withFundSync_(year, { transaction: payment }, function () {
    return FundService.addFundDebtPayment(year, rowIndex, payment, clientRequestId);
  });
}

function getFundOverview(year, filter) {
  return FundService.getFundOverview(year, filter);
}

function getFundLoanOverview(year, filter) {
  return FundService.getFundLoanOverview(year, filter);
}

function auditFundLoanCase(year, partner, amount) {
  var data = FundService.getFundLoanOverview(requireWorkbookYear_(year), {});
  var partnerKey = String(partner || '').trim().toLowerCase();
  var targetAmount = Number(amount || 0);
  return {
    ok: true,
    loans: (data.loans || []).filter(function (item) {
      return (!partnerKey || String(item.partner || '').trim().toLowerCase() === partnerKey) &&
        (!targetAmount || Math.abs(Number(item.borrowed || 0) - targetAmount) < 0.5);
    }),
    history: (data.recentRows || []).filter(function (item) {
      return (!partnerKey || String(item.partner || '').trim().toLowerCase() === partnerKey) &&
        (!targetAmount || Math.abs(Number(item.amount || 0) - targetAmount) < 0.5);
    })
  };
}

function addFundLoan(year, loan) {
  return withFundSync_(year, { loan: loan }, function () {
    return FundService.addFundLoan(year, loan);
  });
}

function addFundLoanPayment(year, payment) {
  return withFundSync_(year, { payment: payment }, function () {
    return FundService.addFundLoanPayment(year, payment);
  });
}

function saveFundCatalogItem(year, item) {
  return withFundSync_(year, { fundCatalog: true }, function () {
    return FundService.saveFundCatalogItem(year, item);
  });
}

function deleteFundCatalogItem(year, item) {
  return withFundSync_(year, { fundCatalog: true }, function () {
    return FundService.deleteFundCatalogItem(year, item);
  });
}

function updateFundSettings(year, settings) {
  return withFundSync_(year, { fundCatalog: true }, function () {
    return FundService.updateFundSettings(year, settings);
  });
}

function syncReportBundleToSupabase(month) {
  return SupabaseService.syncReportBundle(month);
}

function testSupabaseReportSync() {
  return SupabaseService.testReportSync();
}

function syncAllReportBundlesToSupabase() {
  return SupabaseService.syncAllReportBundles();
}

function syncPayrollExplanationMonthToSupabase(month) {
  var targetMonth = String(month || '').trim();
  if (!targetMonth) {
    targetMonth = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
      'MM/yyyy'
    );
  }
  var result = SupabaseService.syncPayrollExplanationMonth(targetMonth);
  console.log(JSON.stringify(result));
  return result;
}

/** Editor-only Preview cache backfill; never writes business Sheets or v5 cache. */
function syncPayrollExplanationPreviewMonthsForR8() {
  if (ScriptApp.getScriptId() !== '1hNKU7xNvhORJSgv8mNIWKNguHU8bmCmM7mQBjxXLfv5FhawbN2HfJ2GX' ||
      APP_CONFIG.spreadsheetId !== '1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA') {
    throw new Error('R8 Preview backfill requires canonical project/workbook.');
  }
  var now = new Date();
  var parts = Utilities.formatDate(now, APP_CONFIG.timezone, 'yyyy-MM').split('-');
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var months = [month, month - 1].map(function (value) {
    var targetYear = value ? year : year - 1;
    return ('0' + (value || 12)).slice(-2) + '/' + targetYear;
  });
  var before = String(ReportService.getReportDataVersion());
  var results = months.map(function (targetMonth) {
    return SupabaseService.syncPayrollExplanationMonth(targetMonth, before);
  });
  var result = {
    ok: results.every(function (item) { return item.ok === true; }),
    sourceStable: before === String(ReportService.getReportDataVersion()),
    sourceDataVersion: before,
    results: results
  };
  console.log(JSON.stringify(result));
  if (!result.ok || !result.sourceStable) throw new Error('R8 Preview cache backfill gate failed; inspect metadata.');
  return result;
}

function requestPayrollExplanationRefresh(month) {
  return SupabaseService.requestPayrollExplanationRefresh(month);
}

function syncDashboardToSupabase() {
  return SupabaseService.syncDashboard();
}

function syncStartupToSupabase(formType) {
  return SupabaseService.syncStartupBundle(formType || 'vanChuyen');
}

function syncCatalogsToSupabase(formType) {
  return SupabaseService.syncCatalogsBundle(formType);
}

function syncCatalogDataToSupabase(displaySheetName) {
  return SupabaseService.syncCatalogDataBundle(displaySheetName);
}

function syncAllStartupAndCatalogsToSupabase() {
  return SupabaseService.syncAllStartupAndCatalogs();
}

function syncManageDataToSupabase(sheetName) {
  return SupabaseService.syncManageDataBundle(sheetName);
}

function syncManageMonthToSupabase(sheetName, monthKey) {
  return SupabaseService.syncManageMonthBundle(sheetName, monthKey);
}

function syncAllManageDataToSupabase() {
  return SupabaseService.syncAllManageDataBundles();
}

function syncFundOverviewToSupabase(year, month) {
  return SupabaseService.syncFundOverview(year, month);
}

function syncFundTransactionsToSupabase(year) {
  return SupabaseService.syncFundTransactions(year, { limit: 500 });
}

function syncFundTransactionMonthToSupabase(year, month) {
  return SupabaseService.syncFundTransactionMonth(requireWorkbookYear_(year), month);
}

function syncFundLoanOverviewToSupabase(year, month) {
  return SupabaseService.syncFundLoanOverview(year, month);
}

function syncAllFundBundlesToSupabase(year) {
  return SupabaseService.syncAllFundBundles(requireWorkbookYear_(year));
}

function syncAllFundCatalogsToSupabase(year) {
  return SupabaseService.syncAllFundCatalogBundles(requireWorkbookYear_(year));
}

function requireWorkbookYear_(year) {
  var value = String(year || APP_CONFIG.year || '').trim();
  if (!/^20\d{2}$/.test(value)) throw new Error('Thiếu năm workbook hợp lệ.');
  return value;
}

function syncRealtimeCache() {
  return SupabaseService.syncRealtimeCache();
}

function getPendingTransportReportRefresh() {
  return SupabaseService.getPendingTransportReportRefresh();
}

function getPendingFundRefresh() {
  return SupabaseService.getPendingFundRefresh();
}

function auditManualReportFreshnessQueue() {
  return SupabaseService.auditManualReportFreshnessQueue();
}

function syncFullRealtimeCache() {
  return SupabaseService.syncFullRealtimeCache();
}

function getSupabaseSyncStatus(limit, moduleName) {
  return SupabaseService.getSupabaseSyncStatus(limit, moduleName);
}

function getReportCacheAudit(months) {
  return SupabaseService.getReportCacheAudit(months);
}

function getManageCacheAudit(sheetNames, limit) {
  return SupabaseService.getManageCacheAudit(sheetNames, limit);
}

function installSupabaseSyncTriggers() {
  return SupabaseService.installSupabaseSyncTriggers();
}

function installWriteJobTrigger() {
  return SupabaseService.installWriteJobTrigger();
}

function processWriteJobs(maxJobs) {
  return SupabaseService.processWriteJobs(maxJobs);
}

function installManageDataSyncTrigger() {
  return SupabaseService.installManageDataSyncTrigger();
}

function syncRecentManageDataCache() {
  return SupabaseService.syncRecentManageDataCache();
}

function syncTripNotifications() {
  return SupabaseService.syncTripNotifications();
}

function syncOperationalNotifications() {
  return SupabaseService.syncOperationalNotifications();
}

/**
 * Editor-only maintenance entrypoint for refreshing the previous-day summary.
 * This function is intentionally not registered as a public API action and does
 * not dispatch notifications.
 */
function syncDailyBusinessSummary() {
  return SupabaseService.syncDailyBusinessSummary();
}

function dispatchNotifications() {
  return SupabaseService.dispatchNotifications();
}

function installTransportSheetSyncTrigger(spreadsheetId) {
  return SupabaseService.installTransportSheetSyncTrigger(spreadsheetId);
}

function installFundSheetSyncTrigger(spreadsheetId) {
  return SupabaseService.installFundSheetSyncTrigger(spreadsheetId);
}

function installE16RTriggers() {
  return SupabaseService.installE16RTriggers();
}

// Owner-only editor entrypoint; intentionally absent from the HTTP registry.
function registerSheetTriggerBindings() {
  return SupabaseService.registerSheetTriggerBindings();
}

function recoverSyncInfrastructure() {
  var triggers = SupabaseService.installE16RTriggers();
  var sync = SupabaseService.syncRealtimeCache();
  return {
    ok: Boolean(triggers && triggers.ok !== false && sync && sync.ok !== false),
    triggers: triggers,
    sync: sync
  };
}

/**
 * Read-only editor diagnostic. Run this exact function from the Apps Script
 * editor to distinguish missing OAuth from trigger/deployment access issues.
 * It is intentionally not registered as a public API action.
 */
function diagnoseSyncAuthorization() {
  var authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  var authorizationStatus = authorization.getAuthorizationStatus();
  var triggers = ScriptApp.getProjectTriggers().map(function (trigger) {
    return {
      handler: trigger.getHandlerFunction ? trigger.getHandlerFunction() : '',
      eventType: trigger.getEventType ? String(trigger.getEventType()) : '',
      source: trigger.getTriggerSource ? String(trigger.getTriggerSource()) : ''
    };
  });
  return {
    ok: true,
    authorizationStatus: String(authorizationStatus),
    authorizationRequired: authorizationStatus === ScriptApp.AuthorizationStatus.REQUIRED,
    authorizedScopes: authorization.getAuthorizedScopes ? authorization.getAuthorizedScopes() : [],
    triggerCount: triggers.length,
    triggers: triggers,
    checkedAt: new Date().toISOString()
  };
}

function handleTransportSheetEdit(e) {
  return SupabaseService.handleTransportSheetEdit(e);
}

function handleTransportSheetChange(e) {
  return SupabaseService.handleTransportSheetChange(e);
}

function handleFundSheetEdit(e) {
  return SupabaseService.handleFundSheetEdit(e);
}

function handleFundSheetChange(e) {
  return SupabaseService.handleFundSheetChange(e);
}

function syncFundSheetChange(eventType, sheetName) {
  return SupabaseService.syncFundSheetChange(eventType, sheetName, null);
}

function syncTransportSheetChange(eventType, sheetName) {
  return SupabaseService.syncTransportSheetChange(eventType, sheetName, null);
}

function syncTransportReportsAfterWrite(sheetName, rows) {
  return SupabaseService.syncTransportReportsAfterWrite(sheetName, rows || [], { includeAll: true });
}

function syncUnknownTransportSheetChange(eventType) {
  return SupabaseService.syncUnknownTransportSheetChange(eventType);
}

function getWriteJobStatus(jobId) {
  return SupabaseService.getWriteJobStatus(jobId);
}

function retryWriteJob(jobId) {
  return SupabaseService.retryWriteJob(jobId);
}

function cancelWriteJob(jobId) {
  return SupabaseService.cancelWriteJob(jobId);
}

function invokeApi(method, action, params, bodyData) {
  var normalizedMethod = String(method || '').toUpperCase();
  var safeParams = params || {};
  var safeBody = bodyData || {};
  SecurityService.assertProxyRequest(action, safeBody.proxySecret || safeParams.proxySecret);
  AppConfig.activate({
    spreadsheetId: safeBody.spreadsheetId || safeBody.ssId || safeParams.spreadsheetId || safeParams.ssId,
    year: safeBody.year || safeParams.year
  });
  ApiActionRegistry.assertPublicAction(normalizedMethod, action);

  if (normalizedMethod === 'GET') {
    if (action === 'health') return SheetService.health();
    if (action === 'getBootstrap') return SheetService.getBootstrap();
    if (action === 'getStartupData') return SheetService.getStartupData(safeParams.formType);
    if (action === 'getInitialData') return SheetService.getInitialData();
    if (action === 'getCatalogs') return CatalogService.getCatalogs(safeParams.formType);
    if (action === 'getDashboard') return ReportService.getDashboard(safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReports') return ReportService.getReports(safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReport') return ReportService.getReport(safeParams.type, safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReportBundle') return ReportService.getReportBundle(safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'invalidateCaches') return SheetService.invalidateCaches();
    if (action === 'readSheetData') return SheetReadService.readSheetData(safeParams.sheetName, safeParams.startDate, safeParams.endDate, safeParams.limit);
    if (action === 'readManageData') return ManageService.readManageData(safeParams.sheetName, safeParams.startDate, safeParams.endDate, safeParams.limit);
    if (action === 'readCatalogData') return CatalogService.readCatalogData(safeParams.displaySheetName || safeParams.sheetName);
    if (action === 'getFundTransactions') {
      return FundService.getFundTransactions(safeParams.year, {
        month: safeParams.month,
        startDate: safeParams.startDate,
        endDate: safeParams.endDate,
        limit: safeParams.limit
      });
    }
    if (action === 'getFundOverview') {
      return FundService.getFundOverview(safeParams.year, {
        month: safeParams.month,
        startDate: safeParams.startDate,
        endDate: safeParams.endDate
      });
    }
    if (action === 'getFundLoanOverview') {
      return FundService.getFundLoanOverview(safeParams.year, {
        month: safeParams.month,
        startDate: safeParams.startDate,
        endDate: safeParams.endDate
      });
    }
    if (action === 'getFundFormOptions') return FundService.getFundFormOptions(safeParams.year, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getFundCatalog') return FundService.getFundCatalog(safeParams.year, safeParams.group, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getWriteJobStatus') return SupabaseService.getWriteJobStatus(safeParams.jobId);
    if (action === 'getRecentWriteJobs') return SupabaseService.getRecentWriteJobs(safeParams.module, safeParams.actionName || safeParams.jobAction, safeParams.limit, safeParams.year);
    if (action === 'getSupabaseSyncStatus') return SupabaseService.getSupabaseSyncStatus(safeParams.limit, safeParams.module, safeParams.year);
    if (action === 'getReportCacheAudit') return SupabaseService.getReportCacheAudit(safeParams.months);
    if (action === 'getManageCacheAudit') return SupabaseService.getManageCacheAudit(safeParams.sheetNames || safeParams.sheets, safeParams.limit);
    if (action === 'getYearRolloverStatus') return getYearRolloverStatus(safeParams.sourceYear, safeParams.targetYear);
    throw new Error('Hành động GET không hợp lệ: ' + action);
  }

  if (normalizedMethod === 'POST') {
    if (action === 'requestPayrollExplanationRefresh') return SupabaseService.requestPayrollExplanationRefresh(safeBody.month);
    if (action === 'submitRows') return SupabaseService.enqueueTransportSubmitRows(safeBody.formType, safeBody.rows || []);
    if (action === 'checkTripReconciliation') return EntryService.checkTripReconciliation(safeBody.rows);
    if (action === 'saveSheetRow') {
      if (isTransportManageSheet_(safeBody.sheetName)) return SupabaseService.enqueueTransportSaveSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.rowData, safeBody.previousRowData);
      return withSheetRowSync_(safeBody.sheetName, function () { return EntryService.saveSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.rowData); });
    }
    if (action === 'deleteSheetRow') {
      if (isTransportManageSheet_(safeBody.sheetName)) {
        if (!Array.isArray(safeBody.columnsToClear) || !safeBody.columnsToClear.length) {
          throw new Error('Xóa dữ liệu Vận hành phải chỉ định các cột cần làm trống; từ chối deleteRow().');
        }
        return SupabaseService.enqueueTransportDeleteSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.columnsToClear, safeBody.rowData);
      }
      return withSheetRowSync_(safeBody.sheetName, function () { return EntryService.deleteSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.columnsToClear); });
    }
    if (action === 'updateFundTransaction') return withFundSync_(safeBody.year, { transaction: safeBody.transaction }, function () { return FundService.updateFundTransaction(safeBody.year, safeBody.rowIndex, safeBody.transaction); });
    if (action === 'deleteFundTransaction') return withFundSync_(safeBody.year, {}, function () { return FundService.deleteFundTransaction(safeBody.year, safeBody.rowIndex, safeBody.expectedTransaction || {}); });
    if (action === 'addFundTransaction') return withFundSync_(safeBody.year, { transaction: safeBody.transaction }, function () { return FundService.addFundTransaction(safeBody.year, safeBody.transaction); });
    if (action === 'addFundTransactions') {
      if ((safeBody.useQueue === true || safeBody.useQueue === 'true') && SupabaseService.shouldQueueFundTransactions()) {
        return SupabaseService.enqueueFundTransactions(safeBody.year, safeBody.transactions || [], safeBody.clientRequestId);
      }
      return withFundSync_(safeBody.year, { transactions: safeBody.transactions || [] }, function () { return FundService.addFundTransactions(safeBody.year, safeBody.transactions || []); });
    }
    if (action === 'addFundDebtPayment') return withFundSync_(safeBody.year, { transaction: safeBody.payment }, function () { return FundService.addFundDebtPayment(safeBody.year, safeBody.rowIndex, safeBody.payment || {}, safeBody.clientRequestId); });
    if (action === 'addFundLoan') return withFundSync_(safeBody.year, { loan: safeBody.loan }, function () { return FundService.addFundLoan(safeBody.year, safeBody.loan); });
    if (action === 'addFundLoanPayment') return withFundSync_(safeBody.year, { payment: safeBody.payment }, function () { return FundService.addFundLoanPayment(safeBody.year, safeBody.payment); });
    if (action === 'saveFundCatalogItem') return withFundSync_(safeBody.year, { fundCatalog: true }, function () { return FundService.saveFundCatalogItem(safeBody.year, safeBody.item || safeBody.payload || safeBody); });
    if (action === 'deleteFundCatalogItem') return withFundSync_(safeBody.year, { fundCatalog: true }, function () { return FundService.deleteFundCatalogItem(safeBody.year, safeBody.item || safeBody.payload || safeBody); });
    if (action === 'updateFundSettings') return withFundSync_(safeBody.year, { fundCatalog: true }, function () { return FundService.updateFundSettings(safeBody.year, safeBody.settings || safeBody.payload || safeBody); });
    if (action === 'cancelWriteJob') return SupabaseService.cancelWriteJob(safeBody.jobId);
    if (action === 'retryWriteJob') return SupabaseService.retryWriteJob(safeBody.jobId);
    if (action === 'processWriteJobs') return SupabaseService.processWriteJobs(safeBody.maxJobs || 3);
    if (action === 'recoverSyncInfrastructure') return recoverSyncInfrastructure();
    if (action === 'manageYearRollover') return manageYearRollover(safeBody.operation, safeBody.sourceYear, safeBody.targetYear, safeBody.confirmationToken, safeBody.requestUser);
    throw new Error('Hành động POST không hợp lệ: ' + action);
  }

  throw new Error('Phương thức không hợp lệ: ' + normalizedMethod);
}

function withFundSync_(year, syncContext, fn) {
  if (typeof syncContext === 'function') {
    fn = syncContext;
    syncContext = {};
  }
  var result = fn();
  if (result && typeof result === 'object') {
    result.supabaseSync = { ok: true, deferred: true, handler: 'syncRealtimeCache' };
  }
  return result;
}

function withTransportSync_(rows, fn) {
  var result = fn();
  if (result && typeof result === 'object') {
    result.supabaseSync = { ok: true, deferred: true, handler: 'syncRealtimeCache' };
  }
  return result;
}

function withSheetRowSync_(sheetName, fn) {
  var result = fn();
  if (!result || result.ok === false) return result;
  var safeSheetName = String(sheetName || '').trim();
  try {
    if (safeSheetName.indexOf('DM_') === 0) {
      result.supabaseSync = SupabaseService.syncCatalogWriteThrough(safeSheetName === 'DM_ThamSo' ? 'DM_ThamSo_TS' : safeSheetName);
    } else if (safeSheetName.indexOf('NL_') === 0) {
      result.supabaseSync = { ok: true, deferred: true, handler: 'syncRealtimeCache' };
    }
  } catch (err) {
    console.log('supabase_sync_after_sheet_row_write_failed: ' + (err && err.message ? err.message : err));
  }
  return result;
}

function isTransportManageSheet_(sheetName) {
  return String(sheetName || '').trim().indexOf('NL_') === 0;
}
