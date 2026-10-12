/** Builds compact, month-aware fingerprints for trigger-independent Sheet polling. */
var SourceFingerprintService = (function () {
  var STATE_VERSION = 2;

  function build(rows, context) {
    var buckets = {};
    var undatedRows = [];
    var versionTag = String(context.versionTag || '');
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var values = Array.isArray(row) ? row : [];
      var monthKey = context.resolveMonthKey(values[1]);
      var normalized = values.map(normalizeValue_);
      if (!monthKey) {
        undatedRows.push(normalized);
        return;
      }
      if (!buckets[monthKey]) buckets[monthKey] = [];
      buckets[monthKey].push(normalized);
    });

    var monthFingerprints = {};
    Object.keys(buckets).sort().forEach(function (monthKey) {
      monthFingerprints[monthKey] = context.hash(versionTag
        ? JSON.stringify({ versionTag: versionTag, rows: buckets[monthKey] })
        : JSON.stringify(buckets[monthKey]));
    });
    var undatedFingerprint = context.hash(versionTag
      ? JSON.stringify({ versionTag: versionTag, rows: undatedRows })
      : JSON.stringify(undatedRows));
    var months = Object.keys(monthFingerprints).sort().reverse();
    var fingerprintPayload = {
      monthFingerprints: monthFingerprints,
      undatedFingerprint: undatedFingerprint
    };
    if (versionTag) fingerprintPayload.versionTag = versionTag;
    var fingerprint = context.hash(JSON.stringify(fingerprintPayload));
    return {
      version: STATE_VERSION,
      fingerprint: fingerprint,
      months: months,
      monthFingerprints: monthFingerprints,
      undatedFingerprint: undatedFingerprint,
      rowCount: (Array.isArray(rows) ? rows : []).length
    };
  }

  function parse(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return normalizeState_(raw);
    try {
      return normalizeState_(JSON.parse(raw));
    } catch (err) {
      return { version: 1, fingerprint: String(raw) };
    }
  }

  function diff(previous, current) {
    if (!current) return { changed: false, full: false, months: [] };
    if (previous && previous.fingerprint === current.fingerprint) {
      return { changed: false, full: false, months: [] };
    }
    if (!previous || previous.version !== STATE_VERSION) {
      return {
        changed: true,
        full: !current.months.length,
        months: current.months.slice(),
        reason: previous ? 'legacy-state' : 'missing-state'
      };
    }

    var keys = unique_(Object.keys(previous.monthFingerprints || {}).concat(Object.keys(current.monthFingerprints || {})));
    var months = keys.filter(function (monthKey) {
      return (previous.monthFingerprints || {})[monthKey] !== (current.monthFingerprints || {})[monthKey];
    }).sort().reverse();
    var undatedChanged = previous.undatedFingerprint !== current.undatedFingerprint;
    return {
      changed: true,
      full: undatedChanged,
      months: months,
      reason: undatedChanged ? 'undated-or-structural-change' : 'month-change'
    };
  }

  function serialize(state) {
    return JSON.stringify(normalizeState_(state));
  }

  function normalizeState_(state) {
    var value = state && typeof state === 'object' ? state : {};
    return {
      version: Number(value.version || 0),
      fingerprint: String(value.fingerprint || ''),
      months: Array.isArray(value.months) ? value.months.slice() : [],
      monthFingerprints: value.monthFingerprints && typeof value.monthFingerprints === 'object' ? value.monthFingerprints : {},
      undatedFingerprint: String(value.undatedFingerprint || ''),
      rowCount: Number(value.rowCount || 0)
    };
  }

  function normalizeValue_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (value === undefined) return null;
    return value;
  }

  function unique_(values) {
    var seen = {};
    return values.filter(function (value) {
      var key = String(value || '');
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  return {
    build: build,
    parse: parse,
    diff: diff,
    serialize: serialize
  };
})();
