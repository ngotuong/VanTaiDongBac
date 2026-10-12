/**
 * Builds operational-integrity notifications from workbook-owned helper
 * formulas. The service never infers attendance or assignment rules itself.
 */
var OperationalNotificationSyncService = (function () {
  var CACHE_TABLE = 'manage_data_bundles';
  var CACHE_SHEET = 'SYSTEM_NOTIFICATIONS';
  var CACHE_FILTER_KEY = 'operations:active';
  var LOOKBACK_DAYS = 120;
  var MAX_SOURCE_ROWS = 10000;
  var MAX_ITEMS = 100;

  function sync(context) {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var now = new Date();
    var threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS);
    var items = [];
    collectAttendance_(spreadsheet, threshold, items, context);
    collectAssignments_(spreadsheet, threshold, items, context);
    items.sort(function (left, right) {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      return left.sourceRow - right.sourceRow;
    });
    items = items.slice(0, MAX_ITEMS);

    var syncedAt = context.nowISOString();
    var payload = {
      ok: true,
      sourceSheet: CACHE_SHEET,
      workbookYear: String(APP_CONFIG.year || ''),
      lookbackDays: LOOKBACK_DAYS,
      count: items.length,
      items: items,
      syncedAt: syncedAt
    };
    context.upsertRows(CACHE_TABLE, [{
      sheet_name: CACHE_SHEET,
      filter_key: CACHE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('operational_notifications', 'transport', 'ok', 'Operational notification cache synced: ' + items.length + ' active items.', syncedAt);
    return { ok: true, count: items.length, syncedAt: syncedAt };
  }

  function collectAttendance_(spreadsheet, threshold, items, context) {
    var sheet = spreadsheet.getSheetByName('NL_ChamCong');
    if (!sheet) throw new Error('Không tìm thấy sheet NL_ChamCong.');
    var rowCount = Math.min(Math.max(0, sheet.getLastRow() - 1), MAX_SOURCE_ROWS);
    if (!rowCount) return;
    sheet.getRange(2, 1, rowCount, 11).getValues().forEach(function (row, index) {
      var helper = clean_(row[10]);
      if (!isIssue_(helper)) return;
      var fromDate = parseDate_(row[0]);
      var toDate = parseDate_(row[1]) || fromDate;
      if (!toDate || toDate < threshold) return;
      var dateKey = context.formatDate(fromDate || toDate, 'yyyy-MM-dd');
      var employee = clean_(row[3]) || 'Chưa có nhân sự';
      var attendanceType = clean_(row[4]);
      var sourceRow = index + 2;
      items.push({
        id: eventId_('attendance', dateKey, employee, attendanceType, helper),
        legacyIds: [legacyEventId_('attendance', dateKey, employee, helper, sourceRow)],
        type: 'attendance',
        notificationKey: 'operations-integrity',
        severity: 'warning',
        title: /thiếu/i.test(helper) ? 'Thiếu chấm công cần kiểm tra' : 'Chấm công cần kiểm tra',
        message: employee + (attendanceType ? ' · ' + attendanceType : '') + ': ' + helper + '.',
        date: dateKey,
        sourceRow: sourceRow,
        url: '/manage/?sheet=NL_ChamCong'
      });
    });
  }

  function collectAssignments_(spreadsheet, threshold, items, context) {
    var sheet = spreadsheet.getSheetByName('NL_PhanCongLai');
    if (!sheet) throw new Error('Không tìm thấy sheet NL_PhanCongLai.');
    var rowCount = Math.min(Math.max(0, sheet.getLastRow() - 1), MAX_SOURCE_ROWS);
    if (!rowCount) return;
    sheet.getRange(2, 1, rowCount, 5).getValues().forEach(function (row, index) {
      var helper = clean_(row[4]);
      if (!isIssue_(helper)) return;
      var month = parseDate_(row[0]);
      if (!month || new Date(month.getFullYear(), month.getMonth() + 1, 0) < threshold) return;
      var dateKey = context.formatDate(month, 'yyyy-MM-dd');
      var driver = clean_(row[1]) || 'Chưa có tài xế';
      var company = clean_(row[2]);
      var sourceRow = index + 2;
      items.push({
        id: eventId_('driver-assignment', dateKey, driver, company, helper),
        legacyIds: [legacyEventId_('driver-assignment', dateKey, driver, helper, sourceRow)],
        type: 'driver-assignment',
        notificationKey: 'operations-integrity',
        severity: 'warning',
        title: 'Phân công lái cần kiểm tra',
        message: driver + (company ? ' · ' + company : '') + ': ' + helper + '.',
        date: dateKey,
        sourceRow: sourceRow,
        url: '/manage/?sheet=NL_PhanCongLai'
      });
    });
  }

  function isIssue_(value) {
    var normalized = clean_(value).toLowerCase();
    return Boolean(normalized) && ['ok', 'hợp lệ', 'hop le', 'khớp', 'khop', 'đúng', 'dung', '-'].indexOf(normalized) === -1;
  }

  function eventId_(type, date, subject, discriminator, helper) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      [type, date, subject, discriminator, helper].join('|'),
      Utilities.Charset.UTF_8
    );
    return digest.map(function (value) {
      var byte = value < 0 ? value + 256 : value;
      return ('0' + byte.toString(16)).slice(-2);
    }).join('').substring(0, 32);
  }

  function legacyEventId_(type, date, subject, helper, sourceRow) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      [type, date, subject, helper, sourceRow].join('|'),
      Utilities.Charset.UTF_8
    );
    return digest.map(function (value) {
      var byte = value < 0 ? value + 256 : value;
      return ('0' + byte.toString(16)).slice(-2);
    }).join('').substring(0, 32);
  }

  function parseDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    var text = clean_(value);
    var iso = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] || 1));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (vn) return new Date(Number(vn[3].length === 2 ? '20' + vn[3] : vn[3]), Number(vn[2]) - 1, Number(vn[1]));
    var month = text.match(/^(\d{1,2})\/(\d{4})$/);
    return month ? new Date(Number(month[2]), Number(month[1]) - 1, 1) : null;
  }

  function clean_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  return { sync: sync };
})();
