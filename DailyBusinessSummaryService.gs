/** Builds one compact, read-only daily operations summary for notifications. */
var DailyBusinessSummaryService = (function () {
  var SOURCE_SHEET = 'XL_VanChuyen';
  var CACHE_TABLE = 'manage_data_bundles';
  var CACHE_FILTER_KEY = 'daily-summary:latest';
  var COLUMN_COUNT = 13;
  var MAX_SOURCE_ROWS = 20000;

  function sync(context) {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var source = spreadsheet.getSheetByName(SOURCE_SHEET);
    if (!source) throw new Error('Không tìm thấy sheet ' + SOURCE_SHEET + '.');

    SpreadsheetApp.flush();
    var availableRows = Math.max(0, source.getLastRow() - 1);
    var rowCount = Math.min(availableRows, MAX_SOURCE_ROWS);
    var startRow = Math.max(2, source.getLastRow() - rowCount + 1);
    var values = rowCount ? source.getRange(startRow, 1, rowCount, COLUMN_COUNT).getValues() : [];
    var today = context.nowDate();
    var summaryDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    var dateKey = context.formatDate(summaryDate, 'yyyy-MM-dd');
    var vehicles = {};
    var projects = {};
    var trips = 0;
    var volume = 0;
    var revenue = 0;
    var matchedRows = 0;

    values.forEach(function (row) {
      var date = parseDate_(row[0]);
      if (!date || context.formatDate(date, 'yyyy-MM-dd') !== dateKey) return;
      matchedRows += 1;
      var vehicle = clean_(row[2]);
      var project = clean_(row[3]);
      if (vehicle) vehicles[vehicle] = true;
      if (project) projects[project] = true;
      trips += number_(row[4]);
      volume += number_(row[5]);
      revenue += number_(row[11]);
    });

    var syncedAt = context.nowISOString();
    var payload = {
      ok: true,
      date: dateKey,
      displayDate: context.formatDate(summaryDate, 'dd/MM/yyyy'),
      trips: trips,
      volume: volume,
      revenue: revenue,
      vehicleCount: Object.keys(vehicles).length,
      projectCount: Object.keys(projects).length,
      sourceRows: matchedRows,
      syncedAt: syncedAt
    };
    context.upsertRows(CACHE_TABLE, [{
      sheet_name: SOURCE_SHEET,
      filter_key: CACHE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('daily_business_summary', 'transport', 'ok', 'Daily business summary synced: ' + matchedRows + ' rows.', syncedAt);
    return payload;
  }

  function parseDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    var text = clean_(value);
    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!vn) return null;
    return new Date(Number(vn[3].length === 2 ? '20' + vn[3] : vn[3]), Number(vn[2]) - 1, Number(vn[1]));
  }

  function number_(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    var normalized = clean_(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    var parsed = Number(normalized);
    return isFinite(parsed) ? parsed : 0;
  }

  function clean_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  return { sync: sync };
})();
