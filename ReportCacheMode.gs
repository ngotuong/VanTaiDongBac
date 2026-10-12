/** Retired E1 feature flag contract. Runtime is permanently Supabase-first. */
var ReportCacheMode = (function () {
  var PROPERTY_NAME = 'REPORT_CACHE_MODE';
  var SHEET = 'sheet';
  var DUAL = 'dual';
  var SUPABASE = 'supabase';

  function normalize() {
    return SUPABASE;
  }

  function get() {
    return SUPABASE;
  }

  function describe() {
    return {
      mode: SUPABASE,
      readSource: SUPABASE,
      writeSheet: false,
      writeSupabase: true,
      sheetCacheRetired: true
    };
  }

  return {
    PROPERTY_NAME: PROPERTY_NAME,
    SHEET: SHEET,
    DUAL: DUAL,
    SUPABASE: SUPABASE,
    normalize: normalize,
    get: get,
    describe: describe
  };
})();

/** Internal E1 migration helper. Not exposed through the HTTP action router. */
function getReportCacheModeForMigration() {
  var properties = PropertiesService.getScriptProperties();
  var configured = properties.getProperty(ReportCacheMode.PROPERTY_NAME);
  var result = {
    configured: configured,
    effective: ReportCacheMode.get(),
    behavior: ReportCacheMode.describe()
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Internal E1 migration helper. Only accepts an explicit declared mode. */
function setReportCacheModeForMigration(mode) {
  var requested = String(mode === null || mode === undefined ? '' : mode).trim().toLowerCase();
  if (requested !== ReportCacheMode.SUPABASE) {
    throw new Error('SYS_ReportCache is retired; REPORT_CACHE_MODE only accepts supabase.');
  }

  var properties = PropertiesService.getScriptProperties();
  var previous = properties.getProperty(ReportCacheMode.PROPERTY_NAME);
  properties.setProperty(ReportCacheMode.PROPERTY_NAME, requested);
  var result = {
    previous: previous,
    configured: requested,
    effective: ReportCacheMode.get(),
    behavior: ReportCacheMode.describe()
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Zero-argument editor wrapper for the controlled E1.3 window. */
function setReportCacheModeDualForMigration() {
  return setReportCacheModeForMigration(ReportCacheMode.DUAL);
}

/** Zero-argument emergency rollback wrapper for the controlled E1.3 window. */
function setReportCacheModeSheetForMigration() {
  return setReportCacheModeForMigration(ReportCacheMode.SHEET);
}

/** Zero-argument cutover wrapper for the separately approved E1.4 window. */
function setReportCacheModeSupabaseForMigration() {
  return setReportCacheModeForMigration(ReportCacheMode.SUPABASE);
}

/** Runs exactly one controlled parity batch and records its version for audit. */
function runReportCacheParityBatchForMigration() {
  return runReportCacheGuardedBatch_(function (waitedMs) {
    var result = syncAllReportBundlesToSupabase();
    result.parityGuard = { waitedMs: waitedMs };
    PropertiesService.getScriptProperties().setProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION', String(result.dataVersion || ''));
    console.log(JSON.stringify(result));
    return result;
  });
}

/** Runs one E1.4 Supabase-mode batch and rolls back to dual if the no-append gate fails. */
function runReportCacheSupabaseCutoverBatchForMigration() {
  if (ReportCacheMode.get() !== ReportCacheMode.SUPABASE) {
    throw new Error('E1.4 cutover batch requires REPORT_CACHE_MODE=supabase.');
  }

  var properties = PropertiesService.getScriptProperties();
  var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  var cacheSheet = spreadsheet.getSheetByName('SYS_ReportCache');
  var baselineRow = cacheSheet ? cacheSheet.getLastRow() : 0;
  properties.setProperty('REPORT_CACHE_E1_CUTOVER_BASELINE_ROW', String(baselineRow));

  try {
    return runReportCacheGuardedBatch_(function (waitedMs) {
      var result = syncAllReportBundlesToSupabase();
      var afterRow = cacheSheet ? cacheSheet.getLastRow() : 0;
      properties.setProperty('REPORT_CACHE_E1_CUTOVER_AFTER_ROW', String(afterRow));
      properties.setProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION', String(result.dataVersion || ''));
      result.cutoverGate = {
        waitedMs: waitedMs,
        baselineRow: baselineRow,
        afterRow: afterRow,
        sheetRowsAdded: afterRow - baselineRow,
        expectedBundles: 4
      };
      if (!result.ok || result.failed !== 0 || result.synced !== 4 || afterRow !== baselineRow) {
        throw new Error('E1.4 cutover gate failed: ' + JSON.stringify({
          ok: result.ok,
          synced: result.synced,
          failed: result.failed,
          baselineRow: baselineRow,
          afterRow: afterRow
        }));
      }
      console.log(JSON.stringify(result));
      return result;
    });
  } catch (err) {
    var rollback = setReportCacheModeForMigration(ReportCacheMode.DUAL);
    throw new Error((err && err.message ? err.message : String(err)) + ' Rolled back REPORT_CACHE_MODE to ' + rollback.effective + '.');
  }
}

/** Audits current Supabase rows and proves SYS_ReportCache stayed unchanged after E1.4. */
function getReportCacheCutoverAuditForMigration() {
  var properties = PropertiesService.getScriptProperties();
  var dataVersion = properties.getProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION') || '';
  var baselineRow = Number(properties.getProperty('REPORT_CACHE_E1_CUTOVER_BASELINE_ROW') || 0);
  var batchAfterRow = Number(properties.getProperty('REPORT_CACHE_E1_CUTOVER_AFTER_ROW') || 0);
  var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  var cacheSheet = spreadsheet.getSheetByName('SYS_ReportCache');
  var currentRow = cacheSheet ? cacheSheet.getLastRow() : 0;
  var rows = SupabaseBundleRepository.readRows('report_bundles', {
    spreadsheet_id: 'eq.' + APP_CONFIG.spreadsheetId,
    report_month: 'in.("05/2026","06/2026","07/2026","Tất cả")',
    select: 'report_month,cache_version,source_data_version,details_hash,synced_at',
    limit: '20'
  });
  var expectedMonths = ['05/2026', '06/2026', '07/2026', 'Tất cả'];
  var actualMonths = rows.map(function (row) { return String(row.report_month || ''); }).sort();
  var expectedSorted = expectedMonths.slice().sort();
  var metadataComplete = rows.every(function (row) {
    return row.cache_version === SheetService.getReportCacheVersion() &&
      String(row.source_data_version || '') && String(row.details_hash || '');
  });
  var sourceDataVersions = rows.map(function (row) { return String(row.source_data_version || ''); })
    .filter(function (value, index, values) { return value && values.indexOf(value) === index; })
    .sort();
  var result = {
    ok: ReportCacheMode.get() === ReportCacheMode.SUPABASE &&
      baselineRow > 0 && baselineRow === batchAfterRow && batchAfterRow === currentRow &&
      rows.length === 4 && metadataComplete && JSON.stringify(actualMonths) === JSON.stringify(expectedSorted),
    mode: ReportCacheMode.get(),
    dataVersion: dataVersion,
    baselineRow: baselineRow,
    batchAfterRow: batchAfterRow,
    currentRow: currentRow,
    sheetRowsAddedSinceCutover: currentRow - baselineRow,
    supabaseRowCount: rows.length,
    metadataComplete: metadataComplete,
    sourceDataVersions: sourceDataVersions,
    months: actualMonths,
    rows: rows
  };
  console.log(JSON.stringify(result));
  return result;
}

function runReportCacheGuardedBatch_(callback) {
  var parityProperty = 'REPORT_CACHE_E1_PARITY_RUNNING';
  var realtimeRunningKey = 'SUPABASE_REALTIME_TICK_RUNNING';
  var properties = PropertiesService.getScriptProperties();
  var runtimeCache = CacheService.getScriptCache();
  var guardLock = LockService.getScriptLock();
  var waitStartedAt = new Date().getTime();

  guardLock.waitLock(30000);
  try {
    properties.setProperty(parityProperty, 'true');
  } finally {
    guardLock.releaseLock();
  }

  try {
    while (runtimeCache.get(realtimeRunningKey) || reportRealtimeLeaseActive_(properties.getProperty(realtimeRunningKey))) {
      if (new Date().getTime() - waitStartedAt >= 120000) {
        throw new Error('Timed out waiting for syncRealtimeCache before E1 parity batch.');
      }
      Utilities.sleep(1000);
    }

    return callback(new Date().getTime() - waitStartedAt);
  } finally {
    guardLock.waitLock(30000);
    try {
      properties.deleteProperty(parityProperty);
    } finally {
      guardLock.releaseLock();
    }
  }
}

function reportRealtimeLeaseActive_(raw) {
  if (!raw) return false;
  try { return Number(JSON.parse(raw).expiresAt || 0) > new Date().getTime(); }
  catch (err) { throw new Error('Invalid durable realtime lease; refusing concurrent report parity batch.'); }
}

/** Reads only parity metadata for the last controlled batch; never logs payloads or credentials. */
function getReportCacheSupabaseAuditForMigration() {
  var dataVersion = PropertiesService.getScriptProperties().getProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION') || '';
  var rows = dataVersion ? SupabaseBundleRepository.readRows('report_bundles', {
    spreadsheet_id: 'eq.' + APP_CONFIG.spreadsheetId,
    source_data_version: 'eq.' + dataVersion,
    select: 'report_month,cache_version,source_data_version,details_hash,synced_at',
    limit: '20'
  }) : [];
  var result = {
    dataVersion: dataVersion,
    rowCount: rows.length,
    rows: rows
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Compares normalized Sheet-cache details with exact-version Supabase payloads without refreshing reports. */
function getReportCachePayloadParityAuditForMigration() {
  var properties = PropertiesService.getScriptProperties();
  var dataVersion = properties.getProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION') || '';
  var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  var cacheSheet = spreadsheet.getSheetByName('SYS_ReportCache');
  var detailsByMonth = {};
  var matchedRows = 0;

  if (cacheSheet && cacheSheet.getLastRow() >= 2 && dataVersion) {
    var startRow = Math.max(2, cacheSheet.getLastRow() - 499);
    var values = cacheSheet.getRange(startRow, 1, cacheSheet.getLastRow() - startRow + 1, 10).getValues();
    values.forEach(function (row) {
      if (String(row[1]) !== dataVersion) return;
      var monthKey = reportCacheE1MonthKey_(row[2]);
      var rowOrder = Number(row[4]);
      if (!monthKey || !rowOrder) return;
      if (!detailsByMonth[monthKey]) detailsByMonth[monthKey] = [];
      detailsByMonth[monthKey][rowOrder - 1] = row.slice(5, 10);
      matchedRows++;
    });
  }

  Object.keys(detailsByMonth).forEach(function (monthKey) {
    detailsByMonth[monthKey] = detailsByMonth[monthKey].filter(function (row) { return row && row.length; });
  });
  var monthlyMatrices = ['05/2026', '06/2026', '07/2026'].map(function (monthKey) {
    return detailsByMonth[monthKey] || [];
  }).filter(function (matrix) { return matrix.length; });
  detailsByMonth['Tất cả'] = monthlyMatrices.length === 3
    ? DashboardService.aggregateDetailMatrices(monthlyMatrices)
    : [];

  var supabaseRows = dataVersion ? SupabaseBundleRepository.readRows('report_bundles', {
    spreadsheet_id: 'eq.' + APP_CONFIG.spreadsheetId,
    source_data_version: 'eq.' + dataVersion,
    select: 'report_month,payload,cache_version,source_data_version',
    limit: '20'
  }) : [];
  var supabaseByMonth = {};
  (supabaseRows || []).forEach(function (row) {
    supabaseByMonth[String(row.report_month || '')] = row;
  });

  var months = ['05/2026', '06/2026', '07/2026', 'Tất cả'];
  var results = months.map(function (monthKey) {
    var sheetDetails = reportCacheE1NormalizeDetails_(detailsByMonth[monthKey] || []);
    var cached = supabaseByMonth[monthKey];
    var supabaseDetails = reportCacheE1NormalizeDetails_(
      cached && cached.payload && cached.payload.overview && cached.payload.overview.details || []
    );
    var sheetHash = CacheAuditService.hashPayload(sheetDetails);
    var supabaseHash = CacheAuditService.hashPayload(supabaseDetails);
    return {
      month: monthKey,
      ok: sheetDetails.length > 0 && sheetHash === supabaseHash,
      sheetRows: sheetDetails.length,
      supabaseRows: supabaseDetails.length,
      sheetHash: sheetHash,
      supabaseHash: supabaseHash
    };
  });
  var result = {
    ok: matchedRows === 39 && supabaseRows.length === 4 && results.every(function (item) { return item.ok; }),
    dataVersion: dataVersion,
    matchedSheetRows: matchedRows,
    matchedSupabaseRows: supabaseRows.length,
    results: results
  };
  console.log(JSON.stringify(result));
  return result;
}

function reportCacheE1MonthKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP_CONFIG.timezone, 'MM/yyyy');
  }
  return String(value === null || value === undefined ? '' : value).trim();
}

function reportCacheE1NormalizeDetails_(matrix) {
  return (matrix || []).map(function (row, rowIndex) {
    var values = (row || []).slice(0, 5);
    while (values.length < 5) values.push('');
    return values.map(function (value, columnIndex) {
      var cleanValue = String(value === null || value === undefined ? '' : value).trim();
      if (columnIndex === 0 || columnIndex === 4 || rowIndex === 0) return cleanValue;
      if (!cleanValue) return '';
      return ValidationService.parseNumber(value, false);
    });
  });
}
