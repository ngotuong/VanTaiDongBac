/**
 * Builds the in-app notification bundle from the calculated
 * XL_DoiSoatChuyen sheet. This service is read-only for Google Sheets and
 * writes only a compact cache payload to Supabase.
 */
var TripNotificationSyncService = (function () {
  var SOURCE_SHEET = 'XL_DoiSoatChuyen';
  var TRANSPORT_SHEET = 'NL_VanChuyen';
  var CACHE_TABLE = 'manage_data_bundles';
  var CACHE_FILTER_KEY = 'notifications:active';
  var COLUMN_COUNT = 17;
  var LOOKBACK_DAYS = 45;
  var MAX_SOURCE_ROWS = 20000;
  var MAX_ITEMS = 100;

  function sync(context) {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var source = spreadsheet.getSheetByName(SOURCE_SHEET);
    var transport = spreadsheet.getSheetByName(TRANSPORT_SHEET);
    if (!source) throw new Error('Không tìm thấy sheet ' + SOURCE_SHEET + '.');
    if (!transport) throw new Error('Không tìm thấy sheet ' + TRANSPORT_SHEET + '.');

    SpreadsheetApp.flush();
    var transportRows = Math.max(0, transport.getLastRow() - 1);
    var availableRows = Math.max(0, source.getLastRow() - 1);
    var rowCount = Math.min(transportRows, availableRows, MAX_SOURCE_ROWS);
    var values = rowCount ? source.getRange(2, 1, rowCount, COLUMN_COUNT).getValues() : [];
    var now = new Date();
    var threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS);
    var items = [];

    values.forEach(function (row, index) {
      var date = parseDate_(row[0]);
      if (!date || date < threshold) return;
      var dateKey = context.formatDate(date, 'yyyy-MM-dd');
      var plate = clean_(row[2]);
      var project = clean_(row[3]);
      var reported = number_(row[4]);
      var actual = number_(row[5]);
      var difference = number_(row[6]);
      var reconciliationStatus = clean_(row[7]);
      var rewardCondition = clean_(row[9]);
      var dailyExcess = number_(row[10]);
      var dailyReward = number_(row[11]);
      var monthlyExcess = number_(row[13]);
      var monthlyReward = number_(row[14]);
      var rewardNote = clean_(row[15]);
      var totalReward = number_(row[16]);
      var sourceRow = index + 2;

      if (difference !== 0 || (reconciliationStatus && reconciliationStatus.toLowerCase() !== 'khớp')) {
        items.push({
          id: eventId_('reconciliation', dateKey, plate, project, sourceRow),
          type: 'reconciliation',
          severity: 'warning',
          title: reconciliationStatus || 'Chênh lệch số chuyến',
          message: [plate || 'Chưa có biển số', project || 'Chưa có dự án'].join(' · ') + ': báo cáo ' + reported + ', tài xế ' + actual + ', lệch ' + difference + '.',
          date: dateKey,
          plate: plate,
          project: project,
          amount: 0,
          excessTrips: 0,
          sourceRow: sourceRow
        });
      }

      if (totalReward > 0 || rewardNote || rewardCondition || dailyExcess > 0 || monthlyExcess > 0) {
        items.push({
          id: eventId_('hot-bonus', dateKey, plate, project, sourceRow),
          type: 'hot-bonus',
          severity: 'success',
          title: 'Thưởng nóng cần kiểm tra',
          message: [plate || 'Chưa có biển số', project || 'Chưa có dự án'].join(' · ') + ': ' + (rewardCondition || rewardNote || 'Có chuyến vượt mốc') + '.',
          date: dateKey,
          plate: plate,
          project: project,
          amount: totalReward || dailyReward + monthlyReward,
          excessTrips: dailyExcess + monthlyExcess,
          sourceRow: sourceRow
        });
      }
    });

    items.sort(function (left, right) {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      if (left.severity !== right.severity) return left.severity === 'warning' ? -1 : 1;
      return left.sourceRow - right.sourceRow;
    });
    items = items.slice(0, MAX_ITEMS);

    var syncedAt = context.nowISOString();
    var payload = {
      ok: true,
      sourceSheet: SOURCE_SHEET,
      workbookYear: String(APP_CONFIG.year || ''),
      lookbackDays: LOOKBACK_DAYS,
      count: items.length,
      items: items,
      syncedAt: syncedAt
    };
    context.upsertRows(CACHE_TABLE, [{
      sheet_name: SOURCE_SHEET,
      filter_key: CACHE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('trip_notifications', 'transport', 'ok', 'Trip notification cache synced: ' + items.length + ' active items.', syncedAt);
    return { ok: true, count: items.length, syncedAt: syncedAt, sourceRows: rowCount };
  }

  function eventId_(type, date, plate, project, sourceRow) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      [type, date, plate, project, sourceRow].join('|'),
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
