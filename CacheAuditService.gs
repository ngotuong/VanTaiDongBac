/** Pure normalization, sanitization, hashing, and result formatting for cache audits. */
var CacheAuditService = (function () {
  function normalizeReportMonths(months, defaultMonths) {
    return normalizeList_(months, defaultMonths);
  }

  function normalizeManageSheets(sheetNames, allowedSheets) {
    var allowed = {};
    (allowedSheets || []).forEach(function (sheetName) {
      allowed[normalizeCleanValue_(sheetName)] = true;
    });
    var normalized = normalizeList_(sheetNames, allowedSheets).filter(function (sheetName) {
      return Boolean(allowed[sheetName]);
    });
    return normalized.length ? normalized : (allowedSheets || []).slice();
  }

  function encodeSupabaseInValue(value) {
    return '"' + normalizeCleanValue_(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function sanitizeReportPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    return {
      overview: payload.overview || {},
      payroll: payload.payroll || [],
      vehicles: payload.vehicles || [],
      links: payload.links || {}
    };
  }

  function sanitizeManagePayload(payload, limit) {
    if (!payload || typeof payload !== 'object') return payload;
    var auditLimit = clampManageLimit_(limit);
    return {
      ok: payload.ok !== false,
      headers: payload.headers || [],
      rows: (payload.rows || []).slice(0, auditLimit).map(function (row) {
        return {
          rowIndex: row.rowIndex || '',
          values: row.values || []
        };
      })
    };
  }

  function buildReportResult(month, cached, livePayload) {
    if (!cached || !cached.payload) {
      return {
        month: month,
        ok: false,
        status: 'missing',
        message: 'Chưa có report_bundles cache cho kỳ này.',
        syncedAt: ''
      };
    }
    var liveHash = hashPayload(sanitizeReportPayload(livePayload));
    var cachedHash = hashPayload(sanitizeReportPayload(cached.payload));
    var ok = liveHash === cachedHash;
    return {
      month: month,
      ok: ok,
      status: ok ? 'ok' : 'stale',
      message: ok ? 'Cache khớp dữ liệu live từ Google Sheet.' : 'Cache lệch dữ liệu live, cần sync lại report_bundles.',
      syncedAt: cached.synced_at || '',
      liveHash: liveHash,
      cachedHash: cachedHash
    };
  }

  function buildManageResult(sheetName, limit, cached, livePayload) {
    var auditLimit = clampManageLimit_(limit);
    if (!cached || !cached.payload) {
      return {
        sheetName: sheetName,
        ok: false,
        status: 'missing',
        message: 'Chưa có manage_data_bundles recent_500.',
        syncedAt: ''
      };
    }
    var liveHash = hashPayload(sanitizeManagePayload(livePayload, auditLimit));
    var cachedHash = hashPayload(sanitizeManagePayload(cached.payload, auditLimit));
    var ok = liveHash === cachedHash;
    return {
      sheetName: sheetName,
      limit: auditLimit,
      ok: ok,
      status: ok ? 'ok' : 'stale',
      message: ok ? 'Cache recent_500 khớp ' + auditLimit + ' dòng live mới nhất.' : 'Cache recent_500 lệch ' + auditLimit + ' dòng live mới nhất.',
      syncedAt: cached.synced_at || '',
      liveHash: liveHash,
      cachedHash: cachedHash
    };
  }

  function hashPayload(payload) {
    var json = stableStringify(payload);
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, json, Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
  }

  function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Object.prototype.toString.call(value) === '[object Date]') return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (typeof value === 'object') {
      var keys = Object.keys(value).sort();
      return '{' + keys.map(function (key) {
        return JSON.stringify(key) + ':' + stableStringify(value[key]);
      }).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function normalizeList_(value, defaults) {
    var fallback = (defaults || []).slice();
    if (Array.isArray(value)) {
      var arrayValues = value.map(normalizeCleanValue_).filter(Boolean);
      return arrayValues.length ? arrayValues : fallback;
    }
    var text = normalizeCleanValue_(value);
    if (!text) return fallback;
    var values = text.split(',').map(normalizeCleanValue_).filter(Boolean);
    return values.length ? values : fallback;
  }

  function clampManageLimit_(limit) {
    return Math.min(Math.max(parseInt(limit || 50, 10) || 50, 1), 500);
  }

  return {
    normalizeReportMonths: normalizeReportMonths,
    normalizeManageSheets: normalizeManageSheets,
    encodeSupabaseInValue: encodeSupabaseInValue,
    sanitizeReportPayload: sanitizeReportPayload,
    sanitizeManagePayload: sanitizeManagePayload,
    buildReportResult: buildReportResult,
    buildManageResult: buildManageResult,
    hashPayload: hashPayload,
    stableStringify: stableStringify
  };
})();
