function doGet(e) {
  e = e || { parameter: {} };
  AppConfig.activateFromEvent(e);
  var action = e.parameter.action;
  var startedAt = new Date().getTime();
  try {
    if (!action) {
      return renderIndex_();
    }

    SecurityService.assertProxyRequest(action, e.parameter.proxySecret);

    if (action === 'debugSheet') {
      var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
      var sheet = ss.getSheetByName('BC_TongQuan');
      var vals = sheet ? sheet.getRange(4, 1, 14, 8).getDisplayValues() : [];
      return ContentService.createTextOutput(JSON.stringify(vals)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'health') return timedJsonResponse_(action, startedAt, SheetService.health());
    if (action === 'getBootstrap') return timedJsonResponse_(action, startedAt, SheetService.getBootstrap());
    if (action === 'getStartupData') return timedJsonResponse_(action, startedAt, SheetService.getStartupData(e.parameter.formType));
    if (action === 'getInitialData') return timedJsonResponse_(action, startedAt, SheetService.getInitialData());
    if (action === 'getCatalogs') return timedJsonResponse_(action, startedAt, CatalogService.getCatalogs(e.parameter.formType));
    if (action === 'getDashboard') return timedJsonResponse_(action, startedAt, ReportService.getDashboard(e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'getReports') return timedJsonResponse_(action, startedAt, ReportService.getReports(e.parameter.forceRefresh === 'true'));
    if (action === 'getReport') return timedJsonResponse_(action, startedAt, ReportService.getReport(e.parameter.type, e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'getReportBundle') return timedJsonResponse_(action, startedAt, ReportService.getReportBundle(e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'invalidateCaches') return timedJsonResponse_(action, startedAt, SheetService.invalidateCaches());
    if (action === 'readSheetData') return timedJsonResponse_(action, startedAt, SheetReadService.readSheetData(e.parameter.sheetName, e.parameter.startDate, e.parameter.endDate, e.parameter.limit));
    if (action === 'readManageData') return timedJsonResponse_(action, startedAt, ManageService.readManageData(e.parameter.sheetName, e.parameter.startDate, e.parameter.endDate, e.parameter.limit));
    if (action === 'readCatalogData') return timedJsonResponse_(action, startedAt, CatalogService.readCatalogData(e.parameter.displaySheetName || e.parameter.sheetName));
    if (action === 'getWriteJobStatus') return timedJsonResponse_(action, startedAt, SupabaseService.getWriteJobStatus(e.parameter.jobId));
    if (action === 'getRecentWriteJobs') return timedJsonResponse_(action, startedAt, SupabaseService.getRecentWriteJobs(e.parameter.module, e.parameter.actionName || e.parameter.jobAction, e.parameter.limit));
    if (action === 'getSupabaseSyncStatus') return timedJsonResponse_(action, startedAt, SupabaseService.getSupabaseSyncStatus(e.parameter.limit, e.parameter.module));
    if (action === 'getReportCacheAudit') return timedJsonResponse_(action, startedAt, SupabaseService.getReportCacheAudit(e.parameter.months));
    if (action === 'getManageCacheAudit') return timedJsonResponse_(action, startedAt, SupabaseService.getManageCacheAudit(e.parameter.sheetNames || e.parameter.sheets, e.parameter.limit));
    if (action === 'submitRowsGet') {
      throw new Error('submitRowsGet đã tắt để tránh ghi trùng dữ liệu. Vui lòng tải lại frontend mới và gửi bằng POST.');
    }
    if (action === 'getFundTransactions') {
      return timedJsonResponse_(action, startedAt, FundService.getFundTransactions(e.parameter.year, {
        month: e.parameter.month,
        limit: e.parameter.limit
      }));
    }
    if (action === 'getFundOverview') {
      return timedJsonResponse_(action, startedAt, FundService.getFundOverview(e.parameter.year, {
        month: e.parameter.month
      }));
    }
    if (action === 'getFundLoanOverview') {
      return timedJsonResponse_(action, startedAt, FundService.getFundLoanOverview(e.parameter.year, {
        month: e.parameter.month
      }));
    }
    if (action === 'getFundFormOptions') return timedJsonResponse_(action, startedAt, FundService.getFundFormOptions(e.parameter.year));
    if (action === 'getFundCatalog') {
      return timedJsonResponse_(action, startedAt, FundService.getFundCatalog(e.parameter.year, e.parameter.group));
    }

    throw new Error('Hành động GET không hợp lệ: ' + action);
  } catch (err) {
    return timedJsonResponse_(action || 'unknown', startedAt, { ok: false, error: err.message });
  }
}

function doPost(e) {
  var startedAt = new Date().getTime();
  var action = '';
  try {
    var contents = e.postData.contents;
    if (!contents) {
      throw new Error('Yêu cầu POST thiếu nội dung dữ liệu.');
    }
    var payload = JSON.parse(contents);
    AppConfig.activate({
      spreadsheetId: payload.spreadsheetId || payload.ssId,
      year: payload.year
    });
    action = payload.action;
    SecurityService.assertProxyRequest(action, payload.proxySecret);
    var requestMethod = String(payload.method || 'POST').toUpperCase();
    var requestParams = payload.params || {};
    var requestBody = payload.body && typeof payload.body === 'object' ? payload.body : payload;
    requestBody.proxySecret = payload.proxySecret;
    return timedJsonResponse_(action, startedAt, invokeApi(requestMethod, action, requestParams, requestBody));
  } catch (err) {
    return timedJsonResponse_(action || 'unknown', startedAt, { ok: false, error: err.message });
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function timedJsonResponse_(action, startedAt, data) {
  logApiTiming_(action, startedAt, data);
  return jsonResponse_(data);
}

function logApiTiming_(action, startedAt, data) {
  try {
    console.log(JSON.stringify({
      type: 'api_timing',
      action: action || '',
      durationMs: new Date().getTime() - startedAt,
      ok: !(data && data.ok === false),
      spreadsheetId: APP_CONFIG.spreadsheetId
    }));
  } catch (err) {
    console.log('api_timing_log_failed: ' + err.message);
  }
}

function renderIndex_() {
  var template = HtmlService.createTemplateFromFile('index');
  template.serviceUrl = ScriptApp.getService().getUrl() || '';
  var props = PropertiesService.getScriptProperties();
  template.supabaseUrl = props.getProperty('SUPABASE_URL') || '';
  template.supabaseAnonKey = props.getProperty('SUPABASE_ANON_KEY') || '';
  template.supabaseReportsEnabled = props.getProperty('SUPABASE_REPORTS_ENABLED') || '';
  template.authEnabled = props.getProperty('AUTH_ENABLED') || '';
  return template
    .evaluate()
    .setTitle('Vận tải Đông Bắc - Hệ thống điều hành nội bộ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
