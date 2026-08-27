const { createAppsScriptClient } = require('../server/services/apps-script-client');
const { runtimeConfig } = require('../server/runtime-config');
const { assertRuntimeIdentity } = require('../server/environment-identity');

const MAX_WORKER_AGE_MS = 10 * 60 * 1000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readWorker(config, fetchImpl) {
  const query = new URLSearchParams({
    select: 'sync_key,status,updated_at,synced_at',
    sync_key: 'eq.realtime_cache_worker',
    limit: '1'
  });
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/sync_status?${query}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/json'
    }
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error('Không đọc được heartbeat đồng bộ.');
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function writeWatchdogStatus(config, fetchImpl, status, message, currentTime) {
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/sync_status?on_conflict=sync_key`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{
      sync_key: 'external_sync_watchdog',
      module: 'system',
      status,
      message,
      synced_at: currentTime.toISOString()
    }])
  });
  if (!response.ok) throw new Error('Không ghi được trạng thái watchdog đồng bộ.');
}

function workerAgeMs(worker, currentTime) {
  const updated = new Date(worker?.updated_at || worker?.synced_at || 0);
  return Number.isNaN(updated.getTime()) ? Infinity : Math.max(0, currentTime.getTime() - updated.getTime());
}

function isAuthorizationFailure(message) {
  return /(?:authorization\s+(?:is\s+)?required|oauth[^.]{0,80}(?:expired|revoked|required)|re-?authori[sz]|cấp\s+lại\s+quyền|chưa\s+được\s+cấp\s+quyền)/i.test(String(message || ''));
}

function isDeploymentAccessFailure(recovery) {
  const code = String(recovery?.body?.code || '');
  const upstreamStatus = Number(recovery?.body?.upstreamStatus) || 0;
  return code === 'APPS_SCRIPT_ACCESS_DENIED' || upstreamStatus === 401 || upstreamStatus === 403;
}

function recoveryStatus(recovery, failure) {
  if (isDeploymentAccessFailure(recovery)) return 'deployment_access_denied';
  if (isAuthorizationFailure(failure)) return 'authorization_required';
  return 'error';
}

function recoveryFailure(recovery) {
  if (recovery.status !== 200 || recovery.body?.ok === false) {
    return recovery.body?.error
      || recovery.body?.sync?.errors?.map((item) => item?.error).filter(Boolean).join('; ')
      || 'Không thể tự khôi phục đồng bộ.';
  }
  return '';
}

function createSyncWatchdog({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const appsScriptClient = createAppsScriptClient({ fetchImpl });
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
    const config = runtimeConfig();
    if (!config.syncWatchdogSecret || req.headers.authorization !== `Bearer ${config.syncWatchdogSecret}`) {
      return send(res, 401, { ok: false, error: 'Watchdog không được xác thực.' });
    }
    if (!config.supabaseUrl || !config.serviceRoleKey || !config.appsScriptUrl || !config.proxySecret) {
      return send(res, 503, { ok: false, error: 'Watchdog chưa được cấu hình đầy đủ.' });
    }
    try {
      assertRuntimeIdentity(config);
      const worker = await readWorker(config, fetchImpl);
      const currentTime = now();
      const ageMs = workerAgeMs(worker, currentTime);
      const forceRecovery = req.method === 'POST' && req.body?.force === true;
      if (ageMs <= MAX_WORKER_AGE_MS && !forceRecovery) {
        await writeWatchdogStatus(config, fetchImpl, 'ok', 'Worker đồng bộ đang hoạt động.', currentTime);
        return send(res, 200, { ok: true, skipped: true, reason: 'Worker vẫn hoạt động.', ageMinutes: Math.floor(ageMs / 60000) });
      }
      const recovery = await appsScriptClient.forward({
        url: config.appsScriptUrl,
        action: 'recoverSyncInfrastructure',
        method: 'POST',
        params: {},
        body: { source: 'external-watchdog' },
        proxySecret: config.proxySecret,
        requestUser: { id: 'external-watchdog', role: 'admin', name: 'External Sync Watchdog' }
      });
      const failure = recoveryFailure(recovery);
      if (failure) {
        const status = recoveryStatus(recovery, failure);
        await writeWatchdogStatus(config, fetchImpl, status, failure, currentTime);
        return send(res, 502, { ok: false, error: failure, ageMinutes: Math.floor(ageMs / 60000) });
      }
      await writeWatchdogStatus(config, fetchImpl, 'ok', 'Đã cài lại trigger và chạy một lượt đồng bộ.', currentTime);
      return send(res, 200, { ok: true, recovered: true, forced: forceRecovery, ageMinutes: Math.floor(ageMs / 60000) });
    } catch (error) {
      const currentTime = now();
      const message = error.message || 'Watchdog đồng bộ gặp lỗi.';
      try {
        const status = isAuthorizationFailure(message) ? 'authorization_required' : 'error';
        await writeWatchdogStatus(config, fetchImpl, status, message, currentTime);
      } catch (_) {
        // Supabase may be the failing dependency; the HTTP failure remains observable by the external scheduler.
      }
      return send(res, 500, { ok: false, error: message });
    }
  };
}

module.exports = createSyncWatchdog();
module.exports.createSyncWatchdog = createSyncWatchdog;
module.exports.MAX_WORKER_AGE_MS = MAX_WORKER_AGE_MS;
module.exports.isAuthorizationFailure = isAuthorizationFailure;
module.exports.isDeploymentAccessFailure = isDeploymentAccessFailure;
module.exports.recoveryStatus = recoveryStatus;
module.exports.recoveryFailure = recoveryFailure;
