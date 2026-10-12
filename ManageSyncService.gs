/** Supabase sync implementation for Transport manage-data caches. */
var ManageSyncService = (function () {
  var TABLE_MANAGE_DATA_BUNDLES = 'manage_data_bundles';
  var DEFAULT_MANAGE_FILTER_KEY = 'recent_500';
  var MANAGE_SHEET_NAMES = ['NL_VanChuyen', 'NL_TaiXe', 'NL_Dau', 'NL_ChamCong', 'NL_Phat', 'NL_NghiVanHanh', 'NL_PhanCongLai', 'NL_SoDuLuong'];

  function resolveMonthColumn_(sheet, headerRow, context) {
    var width = Math.max(1, Number(sheet.getLastColumn ? sheet.getLastColumn() : 1));
    var headerRange = sheet.getRange(headerRow, 1, 1, width);
    if (!headerRange || !headerRange.getDisplayValues) return 1;
    return resolveMonthColumnFromHeaders_(headerRange.getDisplayValues()[0], context);
  }

  function resolveMonthColumnFromHeaders_(rawHeaders, context) {
    var headers = rawHeaders.map(function (header) {
      return context.clean(header).toLowerCase();
    });
    var preferred = ['tháng xử lý', 'thang xu ly', 'kỳ phát sinh', 'ky phat sinh', 'tháng', 'thang', 'ngày', 'ngay'];
    for (var nameIndex = 0; nameIndex < preferred.length; nameIndex++) {
      var index = headers.indexOf(preferred[nameIndex]);
      if (index >= 0) return index + 1;
    }
    return 1;
  }

  function monthKeyFromValue_(value, context) {
    var date = context.parseDateValue(value);
    return date ? context.formatDate(date, 'yyyy-MM') : context.normalizeYearMonthKey(value);
  }

  function isManageSheetName(sheetName, clean) {
    return MANAGE_SHEET_NAMES.indexOf(clean(sheetName)) !== -1;
  }

  function buildManageMonthFilterKey(monthKey, context) {
    return 'month:' + context.normalizeYearMonthKey(monthKey);
  }

  function monthPeriod(monthKey, context) {
    var normalized = context.normalizeYearMonthKey(monthKey);
    var parts = normalized.split('-');
    var end = new Date(Number(parts[0]), Number(parts[1]), 0);
    return { startDate: normalized + '-01', endDate: context.formatDate(end, 'yyyy-MM-dd') };
  }

  function syncManageDataBundle(sheetName, context) {
    var safeSheetName = context.clean(sheetName);
    if (!safeSheetName) throw new Error('Thiếu tên sheet vận hành cần sync.');
    var payload = context.readManageData(safeSheetName, '', '', 500);
    if (!payload || payload.ok === false) throw new Error('Invalid manage source payload: ' + safeSheetName);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_MANAGE_DATA_BUNDLES, [{
      sheet_name: safeSheetName,
      filter_key: DEFAULT_MANAGE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('manage_data:' + safeSheetName + ':' + DEFAULT_MANAGE_FILTER_KEY, 'manage', 'ok', 'Manage list cache synced.', syncedAt);
    return { ok: true, table: TABLE_MANAGE_DATA_BUNDLES, sheetName: safeSheetName, filterKey: DEFAULT_MANAGE_FILTER_KEY, syncedAt: syncedAt };
  }

  function syncManageMonthBundle(sheetName, monthKey, context) {
    var safeSheetName = context.clean(sheetName);
    var safeMonthKey = context.normalizeYearMonthKey(monthKey);
    if (!safeSheetName) throw new Error('Thiếu tên sheet vận hành cần sync.');
    if (!safeMonthKey) throw new Error('Thiếu tháng vận hành cần sync.');
    var period = monthPeriod(safeMonthKey, context);
    var filterKey = buildManageMonthFilterKey(safeMonthKey, context);
    var payload = context.readManageData(safeSheetName, period.startDate, period.endDate, 500);
    if (!payload || payload.ok === false) throw new Error('Invalid manage month source payload: ' + safeSheetName);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_MANAGE_DATA_BUNDLES, [{
      sheet_name: safeSheetName,
      filter_key: filterKey,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('manage_data:' + safeSheetName + ':' + filterKey, 'manage', 'ok', 'Manage month cache synced.', syncedAt);
    return { ok: true, table: TABLE_MANAGE_DATA_BUNDLES, sheetName: safeSheetName, filterKey: filterKey, monthKey: safeMonthKey, syncedAt: syncedAt };
  }

  function getManageMonthKeys(sheetName, context) {
    var safeSheetName = context.clean(sheetName);
    var sheet = context.getSheet(safeSheetName);
    if (!sheet) return [];
    var headerRow = context.getHeaderRow(safeSheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) return [];
    var seen = {};
    var monthColumn = resolveMonthColumn_(sheet, headerRow, context);
    sheet.getRange(headerRow + 1, monthColumn, lastRow - headerRow, 1).getValues().forEach(function (row) {
      var monthKey = monthKeyFromValue_(row[0], context);
      if (monthKey) seen[monthKey] = true;
    });
    return Object.keys(seen).sort().reverse();
  }

  // Reuse the probe's full read, with the same display-header/date semantics.
  // This snapshot belongs to one probe only; never persist or use it for writes.
  function getManageMonthKeysFromSnapshot(sheetName, values, displayValues, context) {
    var headerRow = context.getHeaderRow(context.clean(sheetName));
    if (values.length <= headerRow) return [];
    var monthColumn = resolveMonthColumnFromHeaders_(displayValues[headerRow - 1] || [], context);
    var seen = {};
    for (var row = headerRow; row < values.length; row++) {
      var monthKey = monthKeyFromValue_(values[row][monthColumn - 1], context);
      if (monthKey) seen[monthKey] = true;
    }
    return Object.keys(seen).sort().reverse();
  }

  function getRecentManageMonthKeys(sheetName, maxCount, context) {
    return getManageMonthKeys(sheetName, context).slice(0, Math.max(1, maxCount || 1));
  }

  function getManageRefreshMonthKeys(sheetName, context) {
    var months = getManageMonthKeys(sheetName, context);
    // The last row of an old month can be moved/deleted. Source-only discovery
    // would leave that cached month populated forever; refresh it to empty too.
    var offset = 0;
    var rows;
    do {
      rows = context.readCacheRows(TABLE_MANAGE_DATA_BUNDLES, {
        select: 'filter_key', sheet_name: 'eq.' + context.clean(sheetName),
        filter_key: 'like.month:*', order: 'filter_key.asc', limit: 100, offset: offset
      });
      if (!Array.isArray(rows)) throw new Error('Invalid manage cache month index.');
      rows.forEach(function (row) {
        var key = String(row.filter_key || '').match(/^month:(\d{4}-\d{2})$/);
        var month = key && context.normalizeYearMonthKey(key[1]);
        if (month && months.indexOf(month) < 0) months.push(month);
      });
      offset += rows.length;
    } while (rows.length === 100);
    return months.sort().reverse();
  }

  function getEditedManageMonthKeys(sheetName, editedRange, context) {
    if (!editedRange || !editedRange.getRow || !editedRange.getNumRows) return [];
    var safeSheetName = context.clean(sheetName);
    var headerRow = context.getHeaderRow(safeSheetName);
    var firstRow = Math.max(headerRow + 1, editedRange.getRow());
    var lastRow = Math.max(firstRow, editedRange.getRow() + editedRange.getNumRows() - 1);
    try {
      var sheet = context.getSheet(safeSheetName);
      if (!sheet) return [];
      var maxLastRow = Math.min(lastRow, sheet.getLastRow());
      if (maxLastRow < firstRow) return [];
      var seen = {};
      var monthColumn = resolveMonthColumn_(sheet, headerRow, context);
      sheet.getRange(firstRow, monthColumn, maxLastRow - firstRow + 1, 1).getValues().forEach(function (row) {
        var monthKey = monthKeyFromValue_(row[0], context);
        if (monthKey) seen[monthKey] = true;
      });
      return Object.keys(seen).sort().reverse();
    } catch (err) {
      return [];
    }
  }

  function syncAllManageDataBundles(context) {
    var results = [];
    var errors = [];
    MANAGE_SHEET_NAMES.forEach(function (sheetName) {
      context.runSyncStep(results, errors, 'manageData:' + sheetName, function () {
        return syncManageDataBundle(sheetName, context);
      });
      getManageMonthKeys(sheetName, context).forEach(function (monthKey) {
        context.runSyncStep(results, errors, 'manageData:' + sheetName + ':' + monthKey, function () {
          return syncManageMonthBundle(sheetName, monthKey, context);
        });
      });
    });
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, results: results, errors: errors };
  }

  function syncTransportSheetChange(eventType, sheetName, editedRange, context) {
    var safeEventType = context.clean(eventType) || 'UNKNOWN';
    var safeSheetName = context.clean(sheetName);
    if (!isManageSheetName(safeSheetName, context.clean)) {
      return { ok: true, skipped: true, eventType: safeEventType, sheetName: safeSheetName, reason: 'Sheet is not a transport manage sheet.' };
    }
    var runningKey = context.runningKeyPrefix + ':' + safeSheetName;
    if (context.runtimeCache.get(runningKey)) {
      return { ok: true, skipped: true, eventType: safeEventType, sheetName: safeSheetName, reason: 'Previous sheet change sync is still running.' };
    }
    context.runtimeCache.put(runningKey, context.nowISOString(), context.runningTtlSeconds);
    var results = [];
    var errors = [];
    try {
      context.runSyncStep(results, errors, 'manageData:' + safeSheetName, function () { return syncManageDataBundle(safeSheetName, context); });
      var monthKeys = getEditedManageMonthKeys(safeSheetName, editedRange, context);
      if (!monthKeys.length) monthKeys = getRecentManageMonthKeys(safeSheetName, 2, context);
      monthKeys.forEach(function (monthKey) {
        context.runSyncStep(results, errors, 'manageData:' + safeSheetName + ':' + monthKey, function () {
          return syncManageMonthBundle(safeSheetName, monthKey, context);
        });
      });
      if (safeSheetName === 'NL_VanChuyen') {
        context.runSyncStep(results, errors, 'dashboard', context.syncDashboard);
      }
      var syncedAt = context.nowISOString();
      context.writeSyncStatus('transport_sheet_change:' + safeSheetName, 'manage', errors.length ? 'error' : 'ok', errors.length ? JSON.stringify(errors) : 'Transport sheet change synced: ' + safeEventType, syncedAt);
      return { ok: errors.length === 0, eventType: safeEventType, sheetName: safeSheetName, synced: results.length, failed: errors.length, months: monthKeys, results: results, errors: errors };
    } finally {
      context.runtimeCache.remove(runningKey);
    }
  }

  function syncUnknownTransportSheetChange(eventType, context) {
    var safeEventType = context.clean(eventType) || 'CHANGE';
    var runningKey = context.runningKeyPrefix + ':unknown';
    if (context.runtimeCache.get(runningKey)) {
      return { ok: true, skipped: true, eventType: safeEventType, reason: 'Previous unknown sheet change sync is still running.' };
    }
    context.runtimeCache.put(runningKey, context.nowISOString(), context.runningTtlSeconds);
    var results = [];
    var errors = [];
    try {
      context.runSyncStep(results, errors, 'manageData:NL_VanChuyen', function () { return syncManageDataBundle('NL_VanChuyen', context); });
      getRecentManageMonthKeys('NL_VanChuyen', 2, context).forEach(function (monthKey) {
        context.runSyncStep(results, errors, 'manageData:NL_VanChuyen:' + monthKey, function () { return syncManageMonthBundle('NL_VanChuyen', monthKey, context); });
      });
      context.runSyncStep(results, errors, 'dashboard', context.syncDashboard);
      var syncedAt = context.nowISOString();
      context.writeSyncStatus('transport_sheet_change:unknown', 'manage', errors.length ? 'error' : 'ok', errors.length ? JSON.stringify(errors) : 'Transport sheet change synced without active sheet: ' + safeEventType, syncedAt);
      return { ok: errors.length === 0, eventType: safeEventType, sheetName: '', fallback: true, synced: results.length, failed: errors.length, results: results, errors: errors };
    } finally {
      context.runtimeCache.remove(runningKey);
    }
  }

  return {
    syncManageDataBundle: syncManageDataBundle,
    syncManageMonthBundle: syncManageMonthBundle,
    syncAllManageDataBundles: syncAllManageDataBundles,
    syncTransportSheetChange: syncTransportSheetChange,
    syncUnknownTransportSheetChange: syncUnknownTransportSheetChange,
    getManageMonthKeys: getManageMonthKeys,
    getManageMonthKeysFromSnapshot: getManageMonthKeysFromSnapshot,
    getManageRefreshMonthKeys: getManageRefreshMonthKeys,
    getRecentManageMonthKeys: getRecentManageMonthKeys,
    getEditedManageMonthKeys: getEditedManageMonthKeys,
    buildManageMonthFilterKey: buildManageMonthFilterKey,
    isManageSheetName: isManageSheetName
  };
})();
