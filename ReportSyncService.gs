/** Supabase sync implementation for Transport report and dashboard caches. */
var ReportSyncService = (function () {
  var TABLE_REPORT_BUNDLES = 'report_bundles';
  var DASHBOARD_REPORT_MONTH = '__dashboard_latest__';

  function parseOverviewRows(matrix, clean) {
    if (!matrix || matrix.length < 2) return [];
    return matrix.slice(1).map(function (row) {
      return clean(row && row[0]);
    }).filter(function (month) {
      return month && month !== 'Tháng';
    });
  }

  function resolveBundleMonth(requestedMonth, bundle, clean) {
    if (requestedMonth && requestedMonth !== 'latest') return requestedMonth;
    var rows = parseOverviewRows(bundle && bundle.overview && bundle.overview.months, clean);
    return rows.length ? rows[rows.length - 1] : 'latest';
  }

  function getReportMonths(context) {
    var sheet = context.getReportSheet();
    if (!sheet) return [];
    var rowCount = Math.min(sheet.getLastRow(), 24);
    if (rowCount < 2) return [];
    var lastColumn = sheet.getLastColumn();
    var numColumns = Math.max(11, lastColumn - 7 + 1);
    return parseOverviewRows(sheet.getRange(1, 7, rowCount, numColumns).getDisplayValues(), context.clean);
  }

  function getRecentReportMonths(maxCount, context) {
    var months = getReportMonths(context);
    return months.slice(Math.max(0, months.length - Math.max(1, maxCount || 1))).reverse();
  }

  function getRecentReportMonthKeys(maxCount, context) {
    return getRecentReportMonths(maxCount, context).map(function (month) {
      return context.normalizeYearMonthKey(month);
    }).filter(function (monthKey) {
      return monthKey;
    });
  }

  function syncReportBundle(month, context, options) {
    var syncOptions = options || {};
    var targetMonth = context.clean(month) || 'latest';
    var bundle = context.getReportBundle(targetMonth, true, {
      skipInvalidation: syncOptions.skipInvalidation === true,
      dataVersion: syncOptions.dataVersion || '',
      suppressSupabaseWrite: true
    });
    return upsertPreparedReportBundle_(targetMonth, bundle, context, syncOptions.dataVersion || context.getReportDataVersion());
  }

  function upsertPreparedReportBundle_(targetMonth, bundle, context, dataVersion) {
    var resolvedMonth = resolveBundleMonth(targetMonth, bundle, context.clean);
    var syncedAt = context.nowISOString();
    context.upsertReportBundle({
      spreadsheetId: context.spreadsheetId,
      reportMonth: resolvedMonth,
      sourceSheetNames: ['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe'],
      bundle: bundle,
      cacheVersion: context.getReportCacheVersion(),
      dataVersion: dataVersion,
      syncedAt: syncedAt
    });
    return {
      ok: true,
      table: TABLE_REPORT_BUNDLES,
      spreadsheetId: context.spreadsheetId,
      reportMonth: resolvedMonth,
      dataVersion: dataVersion,
      syncedAt: syncedAt
    };
  }

  function syncDashboard(context) {
    var dashboard = context.getDashboard('', true);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_REPORT_BUNDLES, [{
      spreadsheet_id: context.spreadsheetId,
      report_month: DASHBOARD_REPORT_MONTH,
      source_sheet_names: ['BC_TongQuan', 'NL_VanChuyen'],
      payload: dashboard,
      synced_at: syncedAt
    }], 'spreadsheet_id,report_month');
    context.writeSyncStatus('dashboard', 'transport', 'ok', 'Dashboard cache synced.', syncedAt);
    return { ok: true, table: TABLE_REPORT_BUNDLES, reportMonth: DASHBOARD_REPORT_MONTH, syncedAt: syncedAt };
  }

  function syncAllReportBundles(context) {
    var months = getReportMonths(context);
    if (!months.length) throw new Error('Không tìm thấy tháng báo cáo trong BC_TongQuan.');
    var dataVersion = context.beginReportRefreshBatch();
    var results = [];
    var errors = [];
    var batchOptions = {
      skipInvalidation: true,
      dataVersion: dataVersion,
      suppressSupabaseWrite: true
    };
    var allResult = null;
    try {
      var allBundle = context.getReportBundle('Tất cả', true, batchOptions);
      allResult = upsertPreparedReportBundle_('Tất cả', allBundle, context, dataVersion);
    } catch (err) {
      errors.push({ reportMonth: 'Tất cả', error: err && err.message ? err.message : String(err) });
    }
    months.forEach(function (month) {
      try {
        results.push(syncReportBundle(month, context, {
          skipInvalidation: true,
          dataVersion: dataVersion
        }));
      } catch (err) {
        errors.push({ reportMonth: month, error: err && err.message ? err.message : String(err) });
      }
    });
    if (allResult) results.push(allResult);
    return {
      ok: errors.length === 0,
      spreadsheetId: context.spreadsheetId,
      dataVersion: dataVersion,
      synced: results.length,
      failed: errors.length,
      months: results.map(function (item) { return item.reportMonth; }),
      errors: errors
    };
  }

  function syncTransportReportsAfterWrite(sheetName, rows, options, context) {
    var safeSheetName = context.clean(sheetName);
    var results = [];
    var errors = [];
    if (!context.isManageSheetName(safeSheetName)) {
      return { ok: true, skipped: true, synced: 0, failed: 0, reason: 'Sheet is not a transport manage sheet.' };
    }
    var monthKeys = context.getTransportRowsMonthKeys(rows);
    if (!monthKeys.length) monthKeys = getRecentReportMonthKeys(2, context);
    monthKeys.forEach(function (monthKey) {
      context.runSyncStep(results, errors, 'report:' + monthKey, function () {
        return syncReportBundle(context.formatMonthKeyForReport(monthKey), context);
      });
    });
    if (options && options.includeAll === true) {
      context.runSyncStep(results, errors, 'report:Tất cả', function () {
        return syncReportBundle('Tất cả', context);
      });
    }
    var syncedAt = context.nowISOString();
    context.writeSyncStatus(
      'transport_reports_after_write:' + safeSheetName,
      'transport',
      errors.length ? 'error' : 'ok',
      errors.length ? JSON.stringify(errors) : 'Transport report cache synced after write.',
      syncedAt
    );
    return {
      ok: errors.length === 0,
      sheetName: safeSheetName,
      months: monthKeys,
      synced: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    };
  }

  return {
    syncReportBundle: syncReportBundle,
    syncDashboard: syncDashboard,
    syncAllReportBundles: syncAllReportBundles,
    syncTransportReportsAfterWrite: syncTransportReportsAfterWrite,
    getReportMonths: getReportMonths,
    getRecentReportMonths: getRecentReportMonths,
    getRecentReportMonthKeys: getRecentReportMonthKeys,
    resolveBundleMonth: resolveBundleMonth
  };
})();
