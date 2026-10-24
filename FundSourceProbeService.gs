/** Read-only timing. Never include workbook IDs, cells, errors or payloads. */
var FundSourceProbeService = (function () {
  function label_(value) {
    return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : 'unknown';
  }
  function log_(record) {
    try { console.log('fund_source_phase:' + JSON.stringify(record)); } catch (ignored) {}
  }
  function measure(scope, phase, work) {
    var started = Date.now();
    var record = { scope: label_(scope), phase: label_(phase), event: 'start' };
    log_(record);
    var ok = false;
    try {
      var result = work();
      ok = true;
      return result;
    } finally {
      log_({ scope: record.scope, phase: record.phase, event: 'end', ms: Math.max(0, Date.now() - started), ok: ok });
    }
  }
  return { measure: measure };
})();
