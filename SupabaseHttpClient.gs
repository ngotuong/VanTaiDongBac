/**
 * Low-level Supabase REST/RPC transport.
 * Business table names, queries, payloads, and orchestration remain owned by
 * SupabaseService; this client only builds and executes HTTP requests.
 */
var SupabaseHttpClient = (function () {
  var SAFE_RETRY_ATTEMPTS = 3;
  var SAFE_RETRY_DELAYS_MS = [250, 750];
  var COOLDOWN_KEY = 'SUPABASE_HTTP_COOLDOWN_V1';
  var cachedConfig = null;
  var localCooldown = null;

  function upsertRows(tableName, rows, onConflict) {
    if (!rows || !rows.length) return;
    var config = getConfig_();
    var endpoint = restTableEndpoint_(config.url, tableName) + '?on_conflict=' + encodeURIComponent(onConflict);
    var response = fetchWithRetry_(endpoint, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: serviceHeaders_(config.serviceRoleKey, 'resolution=merge-duplicates,return=minimal'),
      payload: JSON.stringify(rows)
    }, true);
    assertSuccess_(response, 'Supabase upsert thất bại');
  }

  function insertRows(tableName, rows) {
    if (!rows || !rows.length) return;
    var config = getConfig_();
    var response = fetchWithRetry_(restTableEndpoint_(config.url, tableName), {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: serviceHeaders_(config.serviceRoleKey, 'return=minimal'),
      payload: JSON.stringify(rows)
    }, false);
    assertSuccess_(response, 'Supabase insert thất bại');
  }

  function readRows(tableName, query) {
    var config = getConfig_();
    var endpoint = appendQuery_(restTableEndpoint_(config.url, tableName), query);
    var response = fetchWithRetry_(endpoint, {
      method: 'get',
      muteHttpExceptions: true,
      headers: serviceHeaders_(config.serviceRoleKey)
    }, true);
    assertSuccess_(response, 'Supabase select thất bại');
    return JSON.parse(response.getContentText() || '[]');
  }

  function updateRows(tableName, patch, filters, options) {
    var config = getConfig_();
    var endpoint = appendQuery_(restTableEndpoint_(config.url, tableName), filters);
    var response = fetchWithRetry_(endpoint, {
      method: 'patch',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: serviceHeaders_(config.serviceRoleKey, options && options.returnRepresentation ? 'return=representation' : 'return=minimal'),
      payload: JSON.stringify(patch || {})
    }, true);
    assertSuccess_(response, 'Supabase update thất bại');
    if (options && options.returnRepresentation) return JSON.parse(response.getContentText() || '[]');
  }

  function callRpc(functionName, payload) {
    var config = getConfig_();
    var endpoint = config.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + encodeURIComponent(functionName);
    var response = fetchWithRetry_(endpoint, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: serviceHeaders_(config.serviceRoleKey),
      payload: JSON.stringify(payload || {})
    }, false);
    assertSuccess_(response, 'Supabase RPC ' + functionName + ' thất bại');
    return JSON.parse(response.getContentText() || '[]');
  }

  function getConfig_() {
    if (cachedConfig) return cachedConfig;
    var props = PropertiesService.getScriptProperties();
    var url = normalizeCleanValue_(props.getProperty('SUPABASE_URL'));
    var serviceRoleKey = normalizeCleanValue_(props.getProperty('SUPABASE_SERVICE_ROLE_KEY'));
    if (!url) throw new Error('Thiếu Script Property SUPABASE_URL.');
    if (!serviceRoleKey) throw new Error('Thiếu Script Property SUPABASE_SERVICE_ROLE_KEY.');
    cachedConfig = { url: url, serviceRoleKey: serviceRoleKey };
    return cachedConfig;
  }

  function restTableEndpoint_(url, tableName) {
    return url.replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(tableName);
  }

  function appendQuery_(endpoint, query) {
    var first = true;
    Object.keys(query || {}).forEach(function (key) {
      var value = query[key];
      if (value === null || value === undefined || value === '') return;
      endpoint += first ? '?' : '&';
      first = false;
      endpoint += encodeURIComponent(key) + '=' + encodeURIComponent(String(value));
    });
    return endpoint;
  }

  function serviceHeaders_(serviceRoleKey, prefer) {
    var headers = {
      apikey: serviceRoleKey,
      Authorization: 'Bearer ' + serviceRoleKey
    };
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  function fetchWithRetry_(endpoint, options, retrySafe) {
    var admission = getCooldown();
    if (admission.active) throw deferred_(new Error('Supabase transport đang cooldown: ' + admission.category + '.'), admission);
    var requestStarted = Date.now();
    var attempts = retrySafe ? SAFE_RETRY_ATTEMPTS : 1;
    var lastError = null;
    var target = target_(endpoint);
    for (var attempt = 0; attempt < attempts; attempt += 1) {
      var started = Date.now();
      log_('rpc_start', { target: target, method: options.method, attempt: attempt + 1, requestBytes: bytes_(options.payload || '') });
      try {
        var response = UrlFetchApp.fetch(endpoint, options);
        var code = response.getResponseCode();
        log_('rpc_done', { target: target, method: options.method, attempt: attempt + 1, elapsedMs: Date.now() - started,
          status: code, responseBytes: bytes_(response.getContentText() || '') });
        if (!retrySafe || !isTransientStatus_(response.getResponseCode()) || attempt === attempts - 1 || Date.now() - requestStarted >= 45000) {
          if (isTransientStatus_(code)) recordCooldown_(code === 429 ? 'throttled' : 'transport');
          else if (code >= 200 && code < 300) clearExpiredCooldown_();
          return response;
        }
      } catch (err) {
        lastError = err;
        var category = category_(err);
        log_('rpc_failed', { target: target, method: options.method, attempt: attempt + 1, elapsedMs: Date.now() - started, category: category });
        // Quota errors cannot be repaired by repeating an identical request.
        // A mutating RPC is never replayed after an ambiguous response.
        if (category === 'other' || category === 'quota' || !retrySafe || attempt === attempts - 1 || Date.now() - requestStarted >= 45000) {
          if (category === 'quota' || category === 'transport') throw deferred_(err, recordCooldown_(category));
          throw err;
        }
      }
      Utilities.sleep(SAFE_RETRY_DELAYS_MS[attempt]);
    }
    throw lastError || new Error('Supabase request thất bại sau nhiều lần thử.');
  }

  function isTransientStatus_(code) {
    return code === 408 || code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
  }

  function assertSuccess_(response, errorPrefix) {
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      var error = new Error(errorPrefix + ' (' + code + '): ' + response.getContentText());
      if (isTransientStatus_(code)) deferred_(error, getCooldown());
      throw error;
    }
  }

  function category_(error) {
    var message = String(error && error.message || error);
    if (/quota exceeded|service invoked too many times|limit exceeded/i.test(message)) return 'quota';
    if (/server error occurred|INTERNAL|DEADLINE_EXCEEDED|timed?\s*out|timeout|Address unavailable/i.test(message)) return 'transport';
    return 'other';
  }

  function readCooldown_() {
    var raw = PropertiesService.getScriptProperties().getProperty(COOLDOWN_KEY);
    if (!raw) return localCooldown;
    try {
      var state = JSON.parse(raw);
      if (state && isFinite(state.until) && state.until > 0 && /^(quota|transport|throttled)$/.test(state.category)) {
        return localCooldown && localCooldown.until > state.until ? localCooldown : state;
      }
    } catch (ignore) {}
    return localCooldown;
  }

  function getCooldown() {
    var state = readCooldown_();
    return { active: !!state && state.until > Date.now(), category: state && state.category || '',
      retryAtMillis: state && state.until || 0, failures: state && state.failures || 0 };
  }

  function cooldownMutation_(fn) {
    var lock = typeof LockService === 'undefined' ? null : LockService.getScriptLock();
    var alreadyHeld = lock && lock.hasLock && lock.hasLock();
    if (lock && !alreadyHeld && !lock.tryLock(1000)) return null;
    try { return fn(); }
    finally { if (lock && !alreadyHeld) lock.releaseLock(); }
  }

  function recordCooldown_(category) {
    var base = category === 'quota' ? 300000 : 60000;
    localCooldown = { until: Date.now() + base, failures: 1, category: category };
    try {
      var persisted = cooldownMutation_(function () {
        var raw = PropertiesService.getScriptProperties().getProperty(COOLDOWN_KEY);
        var previous = null;
        try { previous = raw ? JSON.parse(raw) : null; } catch (ignore) {}
        var oldFailures = Number(previous && previous.failures || 0);
        var failures = Math.min(6, (isFinite(oldFailures) && oldFailures >= 0 ? Math.floor(oldFailures) : 0) + 1);
        var delay = Math.min(category === 'quota' ? 1800000 : 300000, base * Math.pow(2, failures - 1));
        var until = Date.now() + delay + Math.floor(Math.random() * delay * 0.1);
        if (previous && previous.until > until) { until = previous.until; category = previous.category; }
        localCooldown = { until: until, failures: failures, category: category };
        PropertiesService.getScriptProperties().setProperty(COOLDOWN_KEY, JSON.stringify(localCooldown));
        return true;
      });
      if (!persisted) log_('rpc_cooldown_persist_deferred', { category: category, reason: 'lock_busy' });
    } catch (error) { log_('rpc_cooldown_persist_failed', { category: category }); }
    log_('rpc_cooldown', { category: localCooldown.category, retryAtMillis: localCooldown.until, failures: localCooldown.failures });
    return { category: localCooldown.category, retryAtMillis: localCooldown.until };
  }

  function clearExpiredCooldown_() {
    // Serialize read/delete against other invocations creating a new cooldown.
    try {
      cooldownMutation_(function () {
        var state = readCooldown_();
        if (state && state.until <= Date.now()) {
          var props = PropertiesService.getScriptProperties();
          if (props.deleteProperty) props.deleteProperty(COOLDOWN_KEY);
          localCooldown = null;
          log_('rpc_cooldown_recovered', { category: state.category });
        }
      });
    } catch (error) { log_('rpc_cooldown_recovery_deferred', {}); }
  }

  function deferred_(error, state) {
    error.transportDeferred = true;
    error.retryAtMillis = state.retryAtMillis;
    error.transportCategory = state.category;
    return error;
  }

  function deferredResult(error) {
    if (!error || !error.transportDeferred) return null;
    return { ok: false, deferred: true, category: error.transportCategory, retryAtMillis: error.retryAtMillis,
      error: 'Supabase transport deferred; ' + error.transportCategory + '. Không tự replay RPC có kết quả chưa rõ.' };
  }

  function target_(endpoint) {
    var match = String(endpoint).match(/\/rest\/v1\/(rpc\/)?([^?\/]+)/);
    return match ? (match[1] || '') + match[2].replace(/[^a-zA-Z0-9_%.-]/g, '') : 'supabase';
  }

  function bytes_(text) {
    var size = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 128) size++;
      else if (code < 2048) size += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) { size += 4; i++; }
      else size += 3;
    }
    return size;
  }

  function log_(name, values) {
    try { console.log(name + ':' + JSON.stringify(values)); } catch (ignore) {}
  }

  return {
    upsertRows: upsertRows,
    insertRows: insertRows,
    readRows: readRows,
    updateRows: updateRows,
    callRpc: callRpc, getCooldown: getCooldown, deferredResult: deferredResult
  };
})();
