/**
 * Low-level Supabase REST/RPC transport.
 * Business table names, queries, payloads, and orchestration remain owned by
 * SupabaseService; this client only builds and executes HTTP requests.
 */
var SupabaseHttpClient = (function () {
  var SAFE_RETRY_ATTEMPTS = 3;
  var SAFE_RETRY_DELAYS_MS = [250, 750];

  function upsertRows(tableName, rows, onConflict) {
    if (!rows || !rows.length) return;
    var config = getConfig_();
    var endpoint = restTableEndpoint_(config.url, tableName) + '?on_conflict=' + encodeURIComponent(onConflict);
    var response = fetchWithRetry_(endpoint, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: serviceHeaders_(config.serviceRoleKey, 'resolution=merge-duplicates,return=representation'),
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

  function updateRows(tableName, patch, filters) {
    var config = getConfig_();
    var endpoint = appendQuery_(restTableEndpoint_(config.url, tableName), filters);
    var response = fetchWithRetry_(endpoint, {
      method: 'patch',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: serviceHeaders_(config.serviceRoleKey, 'return=minimal'),
      payload: JSON.stringify(patch || {})
    }, true);
    assertSuccess_(response, 'Supabase update thất bại');
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
    var props = PropertiesService.getScriptProperties();
    var url = normalizeCleanValue_(props.getProperty('SUPABASE_URL'));
    var serviceRoleKey = normalizeCleanValue_(props.getProperty('SUPABASE_SERVICE_ROLE_KEY'));
    if (!url) throw new Error('Thiếu Script Property SUPABASE_URL.');
    if (!serviceRoleKey) throw new Error('Thiếu Script Property SUPABASE_SERVICE_ROLE_KEY.');
    return { url: url, serviceRoleKey: serviceRoleKey };
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
    var attempts = retrySafe ? SAFE_RETRY_ATTEMPTS : 1;
    var lastError = null;
    for (var attempt = 0; attempt < attempts; attempt += 1) {
      try {
        var response = UrlFetchApp.fetch(endpoint, options);
        if (!retrySafe || !isTransientStatus_(response.getResponseCode()) || attempt === attempts - 1) {
          return response;
        }
      } catch (err) {
        lastError = err;
        if (!retrySafe || attempt === attempts - 1) throw err;
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
      throw new Error(errorPrefix + ' (' + code + '): ' + response.getContentText());
    }
  }

  return {
    upsertRows: upsertRows,
    insertRows: insertRows,
    readRows: readRows,
    updateRows: updateRows,
    callRpc: callRpc
  };
})();
