/** Safe feature flag contract for the E1 report cache cutover. */
var ReportCacheMode = (function () {
  var PROPERTY_NAME = 'REPORT_CACHE_MODE';
  var SHEET = 'sheet';
  var DUAL = 'dual';
  var SUPABASE = 'supabase';

  function normalize(value) {
    var mode = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
    if (mode === DUAL || mode === SUPABASE) return mode;
    return SHEET;
  }

  function get() {
    try {
      return normalize(PropertiesService.getScriptProperties().getProperty(PROPERTY_NAME));
    } catch (err) {
      return SHEET;
    }
  }

  function describe(value) {
    var mode = normalize(value === undefined ? get() : value);
    return {
      mode: mode,
      readSource: mode === SUPABASE ? SUPABASE : SHEET,
      writeSheet: mode !== SUPABASE,
      writeSupabase: mode !== SHEET
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
  var allowed = [ReportCacheMode.SHEET, ReportCacheMode.DUAL, ReportCacheMode.SUPABASE];
  if (allowed.indexOf(requested) === -1) {
    throw new Error('Invalid REPORT_CACHE_MODE: ' + requested);
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

/** Runs exactly one controlled parity batch and records its version for audit. */
function runReportCacheParityBatchForMigration() {
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
    while (runtimeCache.get(realtimeRunningKey)) {
      if (new Date().getTime() - waitStartedAt >= 120000) {
        throw new Error('Timed out waiting for syncRealtimeCache before E1 parity batch.');
      }
      Utilities.sleep(1000);
    }

    var result = syncAllReportBundlesToSupabase();
    result.parityGuard = { waitedMs: new Date().getTime() - waitStartedAt };
    properties.setProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION', String(result.dataVersion || ''));
    console.log(JSON.stringify(result));
    return result;
  } finally {
    guardLock.waitLock(30000);
    try {
      properties.deleteProperty(parityProperty);
    } finally {
      guardLock.releaseLock();
    }
  }
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
