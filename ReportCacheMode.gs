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
