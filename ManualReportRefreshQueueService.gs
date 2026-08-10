var ManualReportRefreshQueueService = (function () {
  var PROPERTY_KEY = 'SUPABASE_PENDING_TRANSPORT_REPORT_SYNC';
  var DEFAULT_DEBOUNCE_MS = 15000;
  var DEFAULT_RETRY_DELAY_MS = 30000;

  function enqueue(options, context) {
    var input = options || {};
    return context.withLock(function () {
      var now = context.nowMillis();
      var current = read_(context);
      var incomingMonths = normalizeMonths_(input.months, context.normalizeYearMonthKey);
      var full = Boolean(input.full || current.full);
      var pending = {
        full: full,
        includeAll: input.includeAll !== false || current.includeAll === true,
        months: full ? [] : mergeUnique_(current.months, incomingMonths).sort(),
        notBefore: Math.max(
          Number(current.notBefore || 0),
          now + Number(input.delayMs === undefined ? context.debounceMs || DEFAULT_DEBOUNCE_MS : input.delayMs)
        ),
        updatedAt: context.nowISOString(),
        sources: mergeUnique_(current.sources, input.source ? [String(input.source)] : []),
        attempts: Math.max(Number(current.attempts || 0), Number(input.attempts || 0))
      };
      context.setProperty(propertyKey_(context), JSON.stringify(pending));
      return summarize_(pending, now);
    });
  }

  function claimDue(context) {
    return context.withLock(function () {
      var now = context.nowMillis();
      var pending = read_(context);
      if (!hasWork_(pending)) return { due: false, pending: false };
      if (Number(pending.notBefore || 0) > now) {
        return { due: false, pending: true, waitMs: Number(pending.notBefore) - now, item: pending };
      }
      context.deleteProperty(propertyKey_(context));
      return { due: true, pending: true, item: pending };
    });
  }

  function requeue(item, context) {
    var pending = item || {};
    return enqueue({
      full: pending.full === true,
      includeAll: pending.includeAll !== false,
      months: pending.months || [],
      source: 'retry',
      delayMs: context.retryDelayMs || DEFAULT_RETRY_DELAY_MS,
      attempts: Number(pending.attempts || 0) + 1
    }, context);
  }

  function getPending(context) {
    return context.withLock(function () {
      var pending = read_(context);
      return hasWork_(pending) ? summarize_(pending, context.nowMillis()) : null;
    });
  }

  function read_(context) {
    return parse_(context.getProperty(propertyKey_(context)));
  }

  function propertyKey_(context) {
    return context && context.propertyKey ? String(context.propertyKey) : PROPERTY_KEY;
  }

  function parse_(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      var value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch (err) {
      return {};
    }
  }

  function normalizeMonths_(months, normalize) {
    var values = [];
    (Array.isArray(months) ? months : []).forEach(function (month) {
      var normalized = normalize(month);
      if (normalized && values.indexOf(normalized) === -1) values.push(normalized);
    });
    return values.sort();
  }

  function mergeUnique_(left, right) {
    var values = [];
    (Array.isArray(left) ? left : []).concat(Array.isArray(right) ? right : []).forEach(function (value) {
      if (value !== undefined && value !== null && values.indexOf(value) === -1) values.push(value);
    });
    return values;
  }

  function hasWork_(pending) {
    return Boolean(pending && (pending.full === true || (pending.months && pending.months.length)));
  }

  function summarize_(pending, now) {
    return {
      full: pending.full === true,
      includeAll: pending.includeAll !== false,
      months: (pending.months || []).slice(),
      notBefore: Number(pending.notBefore || 0),
      waitMs: Math.max(0, Number(pending.notBefore || 0) - now),
      updatedAt: pending.updatedAt || '',
      sources: (pending.sources || []).slice(),
      attempts: Number(pending.attempts || 0)
    };
  }

  return {
    enqueue: enqueue,
    claimDue: claimDue,
    requeue: requeue,
    getPending: getPending
  };
})();
