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
  var result = syncAllReportBundlesToSupabase();
  PropertiesService.getScriptProperties().setProperty('REPORT_CACHE_E1_LAST_BATCH_VERSION', String(result.dataVersion || ''));
  console.log(JSON.stringify(result));
  return result;
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
