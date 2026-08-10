/** Supabase persistence adapter for monthly report detail cache cutover. */
var SupabaseReportCacheRepository = (function () {
  var TABLE_NAME = 'report_bundles';
  var SOURCE_SHEET_NAMES = ['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe'];

  function readDetailsMap(options) {
    var rows = SupabaseBundleRepository.readRows(TABLE_NAME, {
      spreadsheet_id: 'eq.' + options.spreadsheetId,
      cache_version: 'eq.' + options.cacheVersion,
      source_data_version: 'eq.' + options.dataVersion,
      select: 'report_month,payload,cache_version,source_data_version,details_hash',
      limit: String(options.limit || 100)
    });
    var map = {};
    (rows || []).forEach(function (row) {
      var monthKey = options.clean(row && row.report_month);
      var details = row && row.payload && row.payload.overview && row.payload.overview.details;
      if (!monthKey || monthKey === 'Tất cả' || monthKey === '__dashboard_latest__' || !Array.isArray(details) || !details.length) return;
      map[monthKey] = details;
    });
    return map;
  }

  function upsertBundle(options) {
    var row = buildBundleRow(options);
    SupabaseBundleRepository.upsertRows(TABLE_NAME, [row], 'spreadsheet_id,report_month');
    return row;
  }

  function buildBundleRow(options) {
    var bundle = options.bundle || {};
    var details = bundle.overview && bundle.overview.details ? bundle.overview.details : [];
    return {
      spreadsheet_id: options.spreadsheetId,
      report_month: options.reportMonth,
      source_sheet_names: options.sourceSheetNames || SOURCE_SHEET_NAMES.slice(),
      payload: bundle,
      cache_version: options.cacheVersion,
      source_data_version: options.dataVersion,
      details_hash: hashDetails(details),
      synced_at: options.syncedAt
    };
  }

  function hashDetails(details) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      stableStringify(details || []),
      Utilities.Charset.UTF_8
    );
    return digest.map(function (value) {
      return ('0' + ((value + 256) % 256).toString(16)).slice(-2);
    }).join('');
  }

  function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Object.prototype.toString.call(value) === '[object Date]') return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + stableStringify(value[key]);
      }).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  return {
    readDetailsMap: readDetailsMap,
    upsertBundle: upsertBundle,
    buildBundleRow: buildBundleRow,
    hashDetails: hashDetails
  };
})();
