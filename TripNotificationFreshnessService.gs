/** Coalesces trip-source edits and acknowledges only the exact synced snapshot. */
var TripNotificationFreshnessService = (function () {
  var SOURCE_SHEETS = { NL_VanChuyen: true, NL_TaiXe: true };
  var DEFAULT_QUIET_WINDOW_MS = 30 * 1000;

  function mark(input, context) {
    var sheetName = clean_(input && input.sheetName);
    if (!SOURCE_SHEETS[sheetName]) {
      return { ok: true, marked: false, skipped: true, reason: 'Sheet does not affect trip reconciliation.' };
    }
    var nowMillis = Number(context.nowMillis());
    var eventAtMillis = Number(input && input.eventAtMillis || nowMillis);
    if (!isFinite(eventAtMillis) || eventAtMillis <= 0 || eventAtMillis > nowMillis + 60000) eventAtMillis = nowMillis;
    var current = read(context);
    var lastSignalAt = Math.max(Number(current.lastSignalAt || 0), eventAtMillis);
    var quietWindowMs = Math.max(0, Number(context.quietWindowMs || DEFAULT_QUIET_WINDOW_MS));
    var sheetNames = unique_((current.sheetNames || []).concat([sheetName]));
    var generationId = eventAtMillis >= Number(current.lastSignalAt || 0) && input && input.generationId
      ? clean_(input.generationId) : clean_(current.generationId);
    var state = {
      lastSignalAt: lastSignalAt,
      dueAt: lastSignalAt + quietWindowMs,
      sheetNames: sheetNames,
      generationId: generationId,
      updatedAt: context.nowISOString()
    };
    context.setProperty(context.dirtyKey, JSON.stringify(state));
    return { ok: true, marked: true, state: state };
  }

  function read(context) {
    var raw = context.getProperty(context.dirtyKey);
    if (!raw) return {};
    try {
      var value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch (ignore) {
      return {};
    }
  }

  function isDue(state, nowMillis) {
    return Number(state && state.lastSignalAt || 0) > 0 && Number(state && state.dueAt || 0) <= Number(nowMillis || 0);
  }

  function forcePipelineDue(state, nowMillis, context) {
    if (!isDue(state, nowMillis)) return false;
    context.setProperty(context.nextAtKey, '0');
    return true;
  }

  function acknowledge(snapshot, syncResult, context) {
    if (!snapshot || !Number(snapshot.lastSignalAt || 0) || !syncResult || syncResult.ok === false) return false;
    var current = read(context);
    if (!Number(current.lastSignalAt || 0)) return true;
    if (Number(current.lastSignalAt) > Number(snapshot.lastSignalAt)) return false;
    context.deleteProperty(context.dirtyKey);
    return true;
  }

  function unique_(values) {
    var seen = {};
    return (values || []).map(clean_).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    }).sort();
  }

  function clean_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  return { mark: mark, read: read, isDue: isDue, forcePipelineDue: forcePipelineDue, acknowledge: acknowledge };
})();
