var SupabaseService = (function () {
  var TABLE_REPORT_BUNDLES = 'report_bundles';

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

  function clean_(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  return {
    syncReportBundle: syncReportBundle,
    syncAllReportBundles: syncAllReportBundles,
    testReportSync: testReportSync
  };
})();
