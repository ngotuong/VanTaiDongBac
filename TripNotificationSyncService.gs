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
  var RESOLVED_RETENTION_MS = 48 * 60 * 60 * 1000;
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
    var now = context.nowDate();
    var threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS);
    var items = [];
    var resolvedItems = [];
    var previousItems = readPreviousItems_(context);
    var previousMismatches = {};
    var previousResolved = {};
    var previousResolvedGroup = null;
    previousItems.forEach(function (item) {
      var key = sourceKey_(item.sourceDate || item.date, item.plate, item.project);
      if (item.type === 'reconciliation') previousMismatches[key] = item;
      if (item.type === 'reconciliation-resolved-group' && Array.isArray(item.resolvedItems)) {
        previousResolvedGroup = item;
        item.resolvedItems.forEach(function (resolvedItem) {
          previousResolved[sourceKey_(resolvedItem.sourceDate, resolvedItem.plate, resolvedItem.project)] = resolvedItem;
        });
      } else if (item.type === 'reconciliation-resolved') {
        previousResolved[key] = item;
      }
    });

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
      var rewardAmount = totalReward || dailyReward + monthlyReward;
      var sourceRow = index + 2;
      var sourceKey = sourceKey_(dateKey, plate, project);
      if (difference !== 0 || (reconciliationStatus && reconciliationStatus.toLowerCase() !== 'khớp')) {
        var missingTrip = difference !== 0 && (reported === 0 || actual === 0);
        items.push({
          id: eventId_('reconciliation', dateKey, plate, project),
          legacyIds: [legacyEventId_('reconciliation', dateKey, plate, project, sourceRow)],
          type: 'reconciliation',
          notificationKey: 'trip-reconciliation',
          severity: 'warning',
          title: missingTrip ? 'Thiếu chuyến cần kiểm tra' : (reconciliationStatus || 'Chênh lệch số chuyến'),
          message: [plate || 'Chưa có biển số', project || 'Chưa có dự án'].join(' · ') + ': báo cáo ' + reported + ', tài xế ' + actual + ', lệch ' + difference + '.',
          date: dateKey,
          plate: plate,
          project: project,
          amount: 0,
          excessTrips: 0,
          sourceRow: sourceRow,
          url: '/manage/?entry=vanChuyen'
        });
      } else if (reconciliationStatus && reconciliationStatus.toLowerCase() === 'khớp') {
        var previousResolution = previousResolved[sourceKey];
        if (previousMismatches[sourceKey]) {
          var resolvedAt = context.nowISOString();
          resolvedItems.push({
            id: eventId_('reconciliation-resolved', dateKey, plate, project, resolvedAt),
            legacyIds: [legacyEventId_('reconciliation-resolved', dateKey, plate, project, sourceRow, resolvedAt)],
            type: 'reconciliation-resolved',
            message: [plate || 'Chưa có biển số', project || 'Chưa có dự án', context.formatDate(date, 'dd/MM/yyyy')].join(' · ') + ': báo cáo ' + reported + ', tài xế ' + actual + ' — đã khớp.',
            sourceDate: dateKey,
            plate: plate,
            project: project,
            amount: 0,
            excessTrips: 0,
            sourceRow: sourceRow,
            resolvedAt: resolvedAt,
            url: '/manage/?entry=vanChuyen'
          });
        } else if (previousResolution && isRecentResolution_(previousResolution, now)) {
          resolvedItems.push(previousResolution);
        }
      }

      if (rewardAmount > 0) {
        items.push({
          id: eventId_('hot-bonus', dateKey, plate, project),
          legacyIds: [legacyEventId_('hot-bonus', dateKey, plate, project, sourceRow)],
          type: 'hot-bonus',
          notificationKey: 'trip-reconciliation',
          severity: 'success',
          title: 'Xe đạt thưởng nóng',
          message: [plate || 'Chưa có biển số', project || 'Chưa có dự án'].join(' · ') + ': ' + (rewardCondition || rewardNote || 'Có chuyến vượt mốc') + '.',
          date: dateKey,
          plate: plate,
          project: project,
          amount: rewardAmount,
          excessTrips: dailyExcess + monthlyExcess,
          sourceRow: sourceRow,
          url: '/manage/?entry=vanChuyen'
        });
      }
    });

    var hasActiveReconciliationMismatch = items.some(function (item) {
      return item.type === 'reconciliation';
    });
    if (resolvedItems.length && !hasActiveReconciliationMismatch) {
      var uniqueResolved = {};
      resolvedItems.forEach(function (item) {
        uniqueResolved[sourceKey_(item.sourceDate, item.plate, item.project)] = item;
      });
      resolvedItems = Object.keys(uniqueResolved).map(function (key) { return uniqueResolved[key]; });
      resolvedItems.sort(function (left, right) {
        return clean_(left.sourceDate) < clean_(right.sourceDate) ? 1 : -1;
      });
      var resolvedAt = resolvedItems.reduce(function (latest, item) {
        return clean_(item.resolvedAt) > latest ? clean_(item.resolvedAt) : latest;
      }, '');
      var groupStateToken = resolvedGroupStateToken_(resolvedItems);
      var previousGroupStateToken = previousResolvedGroup && Array.isArray(previousResolvedGroup.resolvedItems)
        ? resolvedGroupStateToken_(previousResolvedGroup.resolvedItems)
        : '';
      var groupDate = resolvedAt
        ? context.formatDate(new Date(resolvedAt), 'yyyy-MM-dd')
        : context.formatDate(now, 'yyyy-MM-dd');
      var legacyIds = [legacyEventId_('reconciliation-resolved-group', groupDate, '', '', resolvedItems.length, resolvedAt)];
      if (previousResolvedGroup && previousGroupStateToken === groupStateToken) {
        legacyIds = legacyIds.concat([previousResolvedGroup.id]).concat(previousResolvedGroup.legacyIds || []);
      }
      items.push({
        id: eventId_('reconciliation-resolved-group', '', '', '', groupStateToken),
        legacyIds: unique_(legacyIds),
        type: 'reconciliation-resolved-group',
        notificationKey: 'trip-reconciliation',
        severity: 'success',
        title: 'Tất cả số chuyến đã khớp',
        message: 'Không còn xe nào lệch số chuyến.',
        date: groupDate,
        resolvedAt: resolvedAt,
        resolvedItems: resolvedItems,
        url: '/manage/?entry=vanChuyen'
      });
    }

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
      sheet_name: context.year + ':' + SOURCE_SHEET,
      filter_key: CACHE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('trip_notifications', 'transport', 'ok', 'Trip notification cache synced: ' + items.length + ' active items.', syncedAt);
    return { ok: true, count: items.length, syncedAt: syncedAt, sourceRows: rowCount };
  }

  function readPreviousItems_(context) {
    if (!context.readRows) return [];
    var rows = context.readRows(CACHE_TABLE, {
      sheet_name: 'eq.' + context.year + ':' + SOURCE_SHEET,
      filter_key: 'eq.' + CACHE_FILTER_KEY,
      select: 'payload',
      limit: '1'
    }) || [];
    return rows[0] && rows[0].payload && Array.isArray(rows[0].payload.items) ? rows[0].payload.items : [];
  }

  function isRecentResolution_(item, now) {
    var resolvedAt = new Date(item.resolvedAt || 0);
    return !isNaN(resolvedAt.getTime()) && now.getTime() - resolvedAt.getTime() <= RESOLVED_RETENTION_MS;
  }

  function sourceKey_(date, plate, project) {
    return [date, plate, project].join('|');
  }

  function resolvedGroupStateToken_(items) {
    return (items || []).map(function (item) {
      return clean_(item.id) || [
        sourceKey_(item.sourceDate, item.plate, item.project),
        clean_(item.resolvedAt)
      ].join('|');
    }).sort().join('||');
  }

  function unique_(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      var key = clean_(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function eventId_(type, date, plate, project, stateToken) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      [type, date, plate, project, stateToken || ''].join('|'),
      Utilities.Charset.UTF_8
    );
    return digest.map(function (value) {
      var byte = value < 0 ? value + 256 : value;
      return ('0' + byte.toString(16)).slice(-2);
    }).join('').substring(0, 32);
  }

  function legacyEventId_(type, date, plate, project, sourceRow, stateToken) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      [type, date, plate, project, sourceRow, stateToken || ''].join('|'),
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
