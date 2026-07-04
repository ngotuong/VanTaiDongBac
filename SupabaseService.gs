var SupabaseService = (function () {
  var TABLE_REPORT_BUNDLES = 'report_bundles';
  var TABLE_FUND_OVERVIEW_BUNDLES = 'fund_overview_bundles';
  var TABLE_FUND_TRANSACTION_BUNDLES = 'fund_transaction_bundles';
  var TABLE_FUND_LOAN_BUNDLES = 'fund_loan_bundles';
  var TABLE_STARTUP_BUNDLES = 'startup_bundles';
  var TABLE_CATALOG_BUNDLES = 'catalog_bundles';
  var TABLE_MANAGE_DATA_BUNDLES = 'manage_data_bundles';
  var TABLE_SYNC_STATUS = 'sync_status';
  var DASHBOARD_REPORT_MONTH = '__dashboard_latest__';
  var DEFAULT_FUND_YEAR = '2026';
  var DEFAULT_FUND_TRANSACTION_FILTER_KEY = 'recent_500';
  var DEFAULT_STARTUP_FORM_TYPE = 'vanChuyen';
  var CATALOG_FORM_TYPES = ['', 'vanChuyen', 'taiXe', 'dau', 'chamCong', 'phat', 'nghiVanHanh'];
  var CATALOG_DISPLAY_SHEETS = [
    'DM_NhanSu',
    'DM_Xe',
    'DM_DuAn',
    'DM_LuongChuyen',
    'DM_ThamSo_TS',
    'DM_ThamSo_GD',
    'DM_DonGiaVanChuyen',
    'DM_ThuongQuanLy',
    'DM_PhatNoiBo'
  ];
  var MANAGE_SHEET_NAMES = [
    'NL_VanChuyen',
    'NL_TaiXe',
    'NL_Dau',
    'NL_ChamCong',
    'NL_Phat',
    'NL_NghiVanHanh'
  ];
  var DEFAULT_MANAGE_FILTER_KEY = 'recent_500';

  function syncReportBundle(month) {
    var targetMonth = clean_(month) || 'latest';
    var bundle = ReportService.getReportBundle(targetMonth, true);
    var resolvedMonth = resolveBundleMonth_(targetMonth, bundle);
    var payload = {
      spreadsheet_id: APP_CONFIG.spreadsheetId,
      report_month: resolvedMonth,
      source_sheet_names: ['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe'],
      payload: bundle,
      synced_at: new Date().toISOString()
    };

    upsertRows_(TABLE_REPORT_BUNDLES, [payload], 'spreadsheet_id,report_month');
    return {
      ok: true,
      table: TABLE_REPORT_BUNDLES,
      spreadsheetId: APP_CONFIG.spreadsheetId,
      reportMonth: resolvedMonth,
      syncedAt: payload.synced_at
    };
  }

  function testReportSync() {
    return syncReportBundle('latest');
  }

  function syncDashboard() {
    var dashboard = ReportService.getDashboard('', true);
    var payload = {
      spreadsheet_id: APP_CONFIG.spreadsheetId,
      report_month: DASHBOARD_REPORT_MONTH,
      source_sheet_names: ['BC_TongQuan', 'NL_VanChuyen'],
      payload: dashboard,
      synced_at: new Date().toISOString()
    };
    upsertRows_(TABLE_REPORT_BUNDLES, [payload], 'spreadsheet_id,report_month');
    writeSyncStatus_('dashboard', 'transport', 'ok', 'Dashboard cache synced.', payload.synced_at);
    return {
      ok: true,
      table: TABLE_REPORT_BUNDLES,
      reportMonth: DASHBOARD_REPORT_MONTH,
      syncedAt: payload.synced_at
    };
  }

  function syncAllReportBundles() {
    var months = getReportMonths_();
    if (!months.length) {
      throw new Error('Không tìm thấy tháng báo cáo trong BC_TongQuan.');
    }

    var targets = months.slice();
    targets.push('Tất cả');

    var results = [];
    var errors = [];
    targets.forEach(function (month) {
      try {
        results.push(syncReportBundle(month));
      } catch (err) {
        errors.push({
          reportMonth: month,
          error: err && err.message ? err.message : String(err)
        });
      }
    });

    return {
      ok: errors.length === 0,
      spreadsheetId: APP_CONFIG.spreadsheetId,
      synced: results.length,
      failed: errors.length,
      months: results.map(function (item) { return item.reportMonth; }),
      errors: errors
    };
  }

  function syncFundOverview(year, month) {
    var safeYear = clean_(year) || DEFAULT_FUND_YEAR;
    var monthKey = normalizeFundMonthKey_(month);
    var payload = FundService.getFundOverview(safeYear, { month: monthKey });
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_FUND_OVERVIEW_BUNDLES, [{
      year: safeYear,
      month_key: monthKey,
      payload: payload,
      synced_at: syncedAt
    }], 'year,month_key');
    writeSyncStatus_('fund_overview:' + safeYear + ':' + (monthKey || 'latest'), 'fund', 'ok', 'Fund overview cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_OVERVIEW_BUNDLES, year: safeYear, monthKey: monthKey, syncedAt: syncedAt };
  }

  function syncFundTransactions(year, options) {
    var safeYear = clean_(year) || DEFAULT_FUND_YEAR;
    var filter = options || {};
    var normalized = {
      month: normalizeFundMonthKey_(filter.month),
      startDate: clean_(filter.startDate),
      endDate: clean_(filter.endDate),
      search: clean_(filter.search || filter.query),
      limit: Math.max(1, Math.min(parseInt(filter.limit, 10) || 500, 1000))
    };
    var filterKey = buildFundTransactionFilterKey_(normalized);
    var payload = FundService.getFundTransactions(safeYear, normalized);
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_FUND_TRANSACTION_BUNDLES, [{
      year: safeYear,
      filter_key: filterKey,
      payload: payload,
      synced_at: syncedAt
    }], 'year,filter_key');
    writeSyncStatus_('fund_transactions:' + safeYear + ':' + filterKey, 'fund', 'ok', 'Fund transaction cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_TRANSACTION_BUNDLES, year: safeYear, filterKey: filterKey, syncedAt: syncedAt };
  }

  function syncFundTransactionMonth(year, month) {
    var monthKey = normalizeFundMonthKey_(month);
    if (!monthKey) throw new Error('Thiếu tháng giao dịch quỹ cần sync.');
    return syncFundTransactions(year || DEFAULT_FUND_YEAR, { month: monthKey, limit: 1000 });
  }

  function syncFundLoanOverview(year, month) {
    var safeYear = clean_(year) || DEFAULT_FUND_YEAR;
    var monthKey = normalizeFundMonthKey_(month);
    var payload = FundService.getFundLoanOverview(safeYear, { month: monthKey });
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_FUND_LOAN_BUNDLES, [{
      year: safeYear,
      month_key: monthKey,
      payload: payload,
      synced_at: syncedAt
    }], 'year,month_key');
    writeSyncStatus_('fund_loans:' + safeYear + ':' + (monthKey || 'latest'), 'fund', 'ok', 'Fund loan cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_LOAN_BUNDLES, year: safeYear, monthKey: monthKey, syncedAt: syncedAt };
  }

  function syncAllFundBundles(year) {
    var safeYear = clean_(year) || DEFAULT_FUND_YEAR;
    var results = [];
    var errors = [];
    var overviewSeed = null;
    runSyncStep_(results, errors, 'fundOverviewLatest', function () {
      var result = syncFundOverview(safeYear, '');
      overviewSeed = result;
      return result;
    });
    var months = getFundMonthsFromOverview_(safeYear);
    months.forEach(function (monthKey) {
      runSyncStep_(results, errors, 'fundOverview:' + monthKey, function () {
        return syncFundOverview(safeYear, monthKey);
      });
      runSyncStep_(results, errors, 'fundTransactions:' + monthKey, function () {
        return syncFundTransactionMonth(safeYear, monthKey);
      });
      runSyncStep_(results, errors, 'fundLoans:' + monthKey, function () {
        return syncFundLoanOverview(safeYear, monthKey);
      });
    });
    runSyncStep_(results, errors, 'fundTransactions', function () {
      return syncFundTransactions(safeYear, { limit: 500 });
    });
    runSyncStep_(results, errors, 'fundLoansLatest', function () {
      return syncFundLoanOverview(safeYear, '');
    });
    return {
      ok: errors.length === 0,
      year: safeYear,
      synced: results.length,
      failed: errors.length,
      months: months,
      seed: overviewSeed,
      errors: errors
    };
  }

  function syncStartupBundle(formType) {
    var safeFormType = clean_(formType) || DEFAULT_STARTUP_FORM_TYPE;
    var payload = SheetService.getStartupData(safeFormType);
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_STARTUP_BUNDLES, [{
      form_type: safeFormType,
      payload: payload,
      synced_at: syncedAt
    }], 'form_type');
    writeSyncStatus_('startup:' + safeFormType, 'startup', 'ok', 'Startup cache synced.', syncedAt);
    return { ok: true, table: TABLE_STARTUP_BUNDLES, formType: safeFormType, syncedAt: syncedAt };
  }

  function syncCatalogsBundle(formType) {
    var safeFormType = clean_(formType);
    var catalogKey = buildCatalogsKey_(safeFormType);
    var payload = CatalogService.getCatalogs(safeFormType);
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_CATALOG_BUNDLES, [{
      catalog_key: catalogKey,
      payload: payload,
      synced_at: syncedAt
    }], 'catalog_key');
    writeSyncStatus_('catalogs:' + (safeFormType || 'all'), 'catalog', 'ok', 'Catalog options cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncCatalogDataBundle(displaySheetName) {
    var safeDisplaySheetName = clean_(displaySheetName);
    if (!safeDisplaySheetName) throw new Error('Thiếu tên danh mục cần sync.');
    var catalogKey = buildCatalogDataKey_(safeDisplaySheetName);
    var payload = CatalogService.readCatalogData(safeDisplaySheetName);
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_CATALOG_BUNDLES, [{
      catalog_key: catalogKey,
      payload: payload,
      synced_at: syncedAt
    }], 'catalog_key');
    writeSyncStatus_('catalog_data:' + safeDisplaySheetName, 'catalog', 'ok', 'Catalog table cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncAllStartupAndCatalogs() {
    var results = [];
    var errors = [];
    runSyncStep_(results, errors, 'startup:' + DEFAULT_STARTUP_FORM_TYPE, function () {
      return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE);
    });
    CATALOG_FORM_TYPES.forEach(function (formType) {
      runSyncStep_(results, errors, 'catalogs:' + (formType || 'all'), function () {
        return syncCatalogsBundle(formType);
      });
    });
    CATALOG_DISPLAY_SHEETS.forEach(function (displaySheetName) {
      runSyncStep_(results, errors, 'catalogData:' + displaySheetName, function () {
        return syncCatalogDataBundle(displaySheetName);
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

  function syncManageDataBundle(sheetName) {
    var safeSheetName = clean_(sheetName);
    if (!safeSheetName) throw new Error('Thiếu tên sheet vận hành cần sync.');
    var payload = ManageService.readManageData(safeSheetName, '', '', 500);
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_MANAGE_DATA_BUNDLES, [{
      sheet_name: safeSheetName,
      filter_key: DEFAULT_MANAGE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    writeSyncStatus_('manage_data:' + safeSheetName + ':' + DEFAULT_MANAGE_FILTER_KEY, 'manage', 'ok', 'Manage list cache synced.', syncedAt);
    return { ok: true, table: TABLE_MANAGE_DATA_BUNDLES, sheetName: safeSheetName, filterKey: DEFAULT_MANAGE_FILTER_KEY, syncedAt: syncedAt };
  }

  function syncManageMonthBundle(sheetName, monthKey) {
    var safeSheetName = clean_(sheetName);
    var safeMonthKey = normalizeYearMonthKey_(monthKey);
    if (!safeSheetName) throw new Error('Thiếu tên sheet vận hành cần sync.');
    if (!safeMonthKey) throw new Error('Thiếu tháng vận hành cần sync.');
    var period = monthPeriod_(safeMonthKey);
    var filterKey = buildManageMonthFilterKey_(safeMonthKey);
    var payload = ManageService.readManageData(safeSheetName, period.startDate, period.endDate, 500);
    var syncedAt = new Date().toISOString();
    upsertRows_(TABLE_MANAGE_DATA_BUNDLES, [{
      sheet_name: safeSheetName,
      filter_key: filterKey,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    writeSyncStatus_('manage_data:' + safeSheetName + ':' + filterKey, 'manage', 'ok', 'Manage month cache synced.', syncedAt);
    return { ok: true, table: TABLE_MANAGE_DATA_BUNDLES, sheetName: safeSheetName, filterKey: filterKey, monthKey: safeMonthKey, syncedAt: syncedAt };
  }

  function syncAllManageDataBundles() {
    var results = [];
    var errors = [];
    MANAGE_SHEET_NAMES.forEach(function (sheetName) {
      runSyncStep_(results, errors, 'manageData:' + sheetName, function () {
        return syncManageDataBundle(sheetName);
      });
      getManageMonthKeys_(sheetName).forEach(function (monthKey) {
        runSyncStep_(results, errors, 'manageData:' + sheetName + ':' + monthKey, function () {
          return syncManageMonthBundle(sheetName, monthKey);
        });
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

  function syncRealtimeCache() {
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

  function syncTransportAfterWrite(sheetName, rows) {
    var results = [];
    var errors = [];
    var safeSheetName = clean_(sheetName);
    runSyncStep_(results, errors, 'dashboard', function () { return syncDashboard(); });
    runSyncStep_(results, errors, 'latestReport', function () { return syncReportBundle('latest'); });
    runSyncStep_(results, errors, 'startup', function () { return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE); });
    if (safeSheetName && safeSheetName.indexOf('NL_') === 0) {
      runSyncStep_(results, errors, 'manageData:' + safeSheetName, function () { return syncManageDataBundle(safeSheetName); });
      getTransportRowsMonthKeys_(rows).forEach(function (monthKey) {
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
      });
    }
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, errors: errors };
  }

  function syncCatalogAfterWrite(displaySheetName) {
    var safeDisplaySheetName = clean_(displaySheetName);
    var results = [];
    var errors = [];
    runSyncStep_(results, errors, 'startup', function () { return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE); });
    CATALOG_FORM_TYPES.forEach(function (formType) {
      runSyncStep_(results, errors, 'catalogs:' + (formType || 'all'), function () {
        return syncCatalogsBundle(formType);
      });
    });
    if (safeDisplaySheetName) {
      runSyncStep_(results, errors, 'catalogData:' + safeDisplaySheetName, function () {
        return syncCatalogDataBundle(safeDisplaySheetName);
      });
    }
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, errors: errors };
  }

  function syncFundAfterWrite(year) {
    var results = [];
    var errors = [];
    runSyncStep_(results, errors, 'fundOverview', function () { return syncFundOverview(year || DEFAULT_FUND_YEAR, ''); });
    runSyncStep_(results, errors, 'fundTransactions', function () { return syncFundTransactions(year || DEFAULT_FUND_YEAR, { limit: 500 }); });
    runSyncStep_(results, errors, 'fundLoans', function () { return syncFundLoanOverview(year || DEFAULT_FUND_YEAR, ''); });
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, errors: errors };
  }

  function getFundMonthsFromOverview_(year) {
    try {
      var overview = FundService.getFundOverview(year, { month: '' });
      return (overview.months || []).map(function (item) {
        return clean_(item && item.key);
      }).filter(function (key) {
        return key;
      });
    } catch (err) {
      return [];
    }
  }

  function installSupabaseSyncTriggers() {
    var triggers = ScriptApp.getProjectTriggers();
    var exists = triggers.some(function (trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'syncRealtimeCache';
    });
    if (!exists) {
      ScriptApp.newTrigger('syncRealtimeCache').timeBased().everyMinutes(5).create();
    }
    return {
      ok: true,
      installed: !exists,
      handler: 'syncRealtimeCache',
      intervalMinutes: 5
    };
  }

  function upsertRows_(tableName, rows, onConflict) {
    if (!rows || !rows.length) return;
    var config = getConfig_();
    var endpoint = config.url.replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(tableName) + '?on_conflict=' + encodeURIComponent(onConflict);
    var response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: 'Bearer ' + config.serviceRoleKey,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      payload: JSON.stringify(rows)
    });

    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Supabase upsert thất bại (' + code + '): ' + response.getContentText());
    }
  }

  function writeSyncStatus_(syncKey, moduleName, status, message, syncedAt) {
    try {
      upsertRows_(TABLE_SYNC_STATUS, [{
        sync_key: syncKey,
        module: moduleName,
        status: status,
        message: message || '',
        synced_at: syncedAt || new Date().toISOString()
      }], 'sync_key');
    } catch (err) {
      console.log('sync_status_failed: ' + (err && err.message ? err.message : err));
    }
  }

  function runSyncStep_(results, errors, name, fn) {
    try {
      results.push({ name: name, result: fn() });
    } catch (err) {
      errors.push({ name: name, error: err && err.message ? err.message : String(err) });
    }
  }

  function getConfig_() {
    var props = PropertiesService.getScriptProperties();
    var url = clean_(props.getProperty('SUPABASE_URL'));
    var serviceRoleKey = clean_(props.getProperty('SUPABASE_SERVICE_ROLE_KEY'));
    if (!url) throw new Error('Thiếu Script Property SUPABASE_URL.');
    if (!serviceRoleKey) throw new Error('Thiếu Script Property SUPABASE_SERVICE_ROLE_KEY.');
    return {
      url: url,
      serviceRoleKey: serviceRoleKey
    };
  }

  function resolveBundleMonth_(requestedMonth, bundle) {
    if (requestedMonth && requestedMonth !== 'latest') return requestedMonth;
    var rows = parseOverviewRows_(bundle && bundle.overview && bundle.overview.months);
    return rows.length ? rows[rows.length - 1] : 'latest';
  }

  function getReportMonths_() {
    var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var sheet = ss.getSheetByName('BC_TongQuan');
    if (!sheet) return [];
    var rowCount = Math.min(sheet.getLastRow(), 24);
    if (rowCount < 2) return [];
    var lastColumn = sheet.getLastColumn();
    var numColumns = Math.max(11, lastColumn - 7 + 1);
    var matrix = sheet.getRange(1, 7, rowCount, numColumns).getDisplayValues();
    return parseOverviewRows_(matrix);
  }

  function parseOverviewRows_(matrix) {
    if (!matrix || matrix.length < 2) return [];
    return matrix.slice(1).map(function (row) {
      return clean_(row && row[0]);
    }).filter(function (month) {
      return month && month !== 'Tháng';
    });
  }

  function normalizeFundMonthKey_(month) {
    var text = clean_(month);
    if (!text || text === 'latest' || text === 'all' || text === 'Tất cả') return '';
    var iso = text.match(/^(\d{4})-(\d{1,2})/);
    if (iso) return iso[1] + '-' + ('0' + Number(iso[2])).slice(-2);
    var vn = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (vn) return vn[2] + '-' + ('0' + Number(vn[1])).slice(-2);
    return text;
  }

  function buildFundTransactionFilterKey_(filter) {
    var month = normalizeFundMonthKey_(filter.month);
    if (month) return 'month:' + month;
    var startDate = clean_(filter.startDate);
    var endDate = clean_(filter.endDate);
    var search = clean_(filter.search);
    var limit = String(filter.limit || 500);
    if (!startDate && !endDate && !search && limit === '500') return DEFAULT_FUND_TRANSACTION_FILTER_KEY;
    return [
      startDate || 'all',
      endDate || 'all',
      search ? Utilities.base64EncodeWebSafe(search).replace(/=+$/, '') : 'all',
      limit
    ].join('|');
  }

  function buildCatalogsKey_(formType) {
    return 'catalogs:' + (clean_(formType) || 'all');
  }

  function buildCatalogDataKey_(displaySheetName) {
    return 'catalog_data:' + clean_(displaySheetName);
  }

  function buildManageMonthFilterKey_(monthKey) {
    return 'month:' + normalizeYearMonthKey_(monthKey);
  }

  function getManageMonthKeys_(sheetName) {
    var safeSheetName = clean_(sheetName);
    var headerRow = getHeaderRowForSheet_(safeSheetName);
    var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var sheet = ss.getSheetByName(safeSheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) return [];
    var values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 1).getValues();
    var seen = {};
    values.forEach(function (row) {
      var date = parseDateValue_(row[0]);
      if (!date) return;
      seen[Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM')] = true;
    });
    return Object.keys(seen).sort().reverse();
  }

  function getRecentManageMonthKeys_(sheetName, maxCount) {
    return getManageMonthKeys_(sheetName).slice(0, Math.max(1, maxCount || 1));
  }

  function getHeaderRowForSheet_(sheetName) {
    for (var key in APP_CONFIG.sheets) {
      if (APP_CONFIG.sheets[key].name === sheetName) return APP_CONFIG.sheets[key].headerRow;
    }
    return 1;
  }

  function monthPeriod_(monthKey) {
    var normalized = normalizeYearMonthKey_(monthKey);
    var parts = normalized.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var end = new Date(year, month, 0);
    return {
      startDate: normalized + '-01',
      endDate: Utilities.formatDate(end, APP_CONFIG.timezone, 'yyyy-MM-dd')
    };
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
      var date = parseDateValue_(row && (row.date || row.fromDate || row.toDate));
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

  function clean_(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  return {
    installSupabaseSyncTriggers: installSupabaseSyncTriggers,
    syncDashboard: syncDashboard,
    syncFundAfterWrite: syncFundAfterWrite,
    syncFundLoanOverview: syncFundLoanOverview,
    syncFundOverview: syncFundOverview,
    syncFundTransactionMonth: syncFundTransactionMonth,
    syncFundTransactions: syncFundTransactions,
    syncAllFundBundles: syncAllFundBundles,
    syncStartupBundle: syncStartupBundle,
    syncCatalogsBundle: syncCatalogsBundle,
    syncCatalogDataBundle: syncCatalogDataBundle,
    syncAllStartupAndCatalogs: syncAllStartupAndCatalogs,
    syncCatalogAfterWrite: syncCatalogAfterWrite,
    syncManageDataBundle: syncManageDataBundle,
    syncManageMonthBundle: syncManageMonthBundle,
    syncAllManageDataBundles: syncAllManageDataBundles,
    syncRealtimeCache: syncRealtimeCache,
    syncReportBundle: syncReportBundle,
    syncAllReportBundles: syncAllReportBundles,
    syncTransportAfterWrite: syncTransportAfterWrite,
    testReportSync: testReportSync
  };
})();
