const crypto = require('crypto');

const CRITICAL_SYNC_KEYS = new Map([
  ['realtime_cache_worker', 15],
  ['trip_notifications', 15],
  ['operational_notifications', 15],
  ['notification_pipeline', 15]
]);

function createNotificationCenterService({ repository, httpError, send, now = () => new Date() }) {
  function handles(action) { return action === 'getNotifications'; }
  function safeItems(row) { return Array.isArray(row?.payload?.items) ? row.payload.items : []; }
  function isoDate(value, fallback) {
    const date = new Date(value || fallback);
    return Number.isNaN(date.getTime()) ? String(fallback).slice(0, 10) : date.toISOString().slice(0, 10);
  }
  function id(prefix, ...parts) {
    return crypto.createHash('sha256').update([prefix, ...parts].join('|')).digest('hex').slice(0, 32);
  }
  function fundItem(fund, currentTime) {
    const rule = fund?.rule;
    const bundle = fund?.bundle;
    const metric = bundle?.payload?.metrics?.find((entry) => entry?.key === 'currentBalance');
    const balance = Number(metric?.value);
    const threshold = Number(rule?.threshold_value);
    if (!rule?.enabled || !Number.isFinite(balance) || !Number.isFinite(threshold) || balance >= threshold) return null;
    return {
      id: id('fund-low-balance', threshold, balance, bundle?.synced_at),
      type: 'fund-low-balance', notificationKey: 'fund-low-balance', severity: 'error',
      title: 'Số dư Quỹ dưới ngưỡng',
      message: `${String(rule.notification_body || 'Số dư Quỹ đang thấp')}: ${balance.toLocaleString('vi-VN')} đ.`,
      date: isoDate(bundle?.synced_at, currentTime), amount: balance, threshold,
      url: '/cashflow/'
    };
  }
  function systemItems(snapshot, currentTime) {
    const result = [];
    for (const row of snapshot.syncStatuses || []) {
      const status = String(row.status || '').toLowerCase();
      const maxAge = CRITICAL_SYNC_KEYS.get(row.sync_key);
      const updated = new Date(row.updated_at || row.synced_at || 0);
      const ageMinutes = Number.isNaN(updated.getTime()) ? Infinity : (currentTime.getTime() - updated.getTime()) / 60000;
      if (status === 'ok' && (!maxAge || ageMinutes <= maxAge)) continue;
      if (status === 'ok' && maxAge && ageMinutes <= maxAge) continue;
      const stale = status === 'ok';
      result.push({
        id: id('sync-health', row.sync_key, row.status, row.updated_at, stale ? 'stale' : row.message),
        type: stale ? 'sync-stale' : 'sync-failure', notificationKey: 'system-health', severity: 'error',
        title: stale ? 'Dữ liệu chưa được đồng bộ mới' : 'Đồng bộ dữ liệu gặp lỗi',
        message: stale ? `${row.sync_key} chưa cập nhật trong ${Math.floor(ageMinutes)} phút.` : `${row.sync_key}: ${String(row.message || row.status).slice(0, 160)}.`,
        date: isoDate(row.updated_at || row.synced_at, currentTime), url: '/observability/'
      });
    }
    for (const job of snapshot.writeJobs || []) {
      const updated = new Date(job.updated_at || job.created_at || 0);
      const ageMinutes = Number.isNaN(updated.getTime()) ? Infinity : (currentTime.getTime() - updated.getTime()) / 60000;
      const stuck = job.status === 'processing' ? ageMinutes > 10 : job.status === 'pending' ? ageMinutes > 15 : true;
      if (!stuck) continue;
      result.push({
        id: id('write-job', job.id, job.status, job.attempts, job.last_error),
        type: 'write-failure', notificationKey: 'system-health', severity: 'error',
        title: job.status === 'failed' ? 'Thao tác ghi dữ liệu thất bại' : 'Thao tác ghi dữ liệu đang bị treo',
        message: `${job.module} · ${job.action}${job.last_error ? `: ${String(job.last_error).slice(0, 140)}` : '.'}`,
        date: isoDate(job.updated_at || job.created_at, currentTime), url: '/observability/'
      });
    }
    return result;
  }
  async function list(config) {
    const snapshot = await repository.find(config);
    const currentTime = now();
    const fund = fundItem(snapshot.fund, currentTime);
    const items = [
      ...safeItems(snapshot.trip).map((item) => ({ notificationKey: 'trip-reconciliation', url: '/entry/', ...item })),
      ...safeItems(snapshot.operations),
      ...(fund ? [fund] : []),
      ...systemItems(snapshot, currentTime)
    ].sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      const weight = { error: 0, warning: 1, success: 2, info: 3 };
      return (weight[left.severity] ?? 3) - (weight[right.severity] ?? 3);
    }).slice(0, 200);
    const syncedAt = [snapshot.trip?.synced_at, snapshot.operations?.synced_at].filter(Boolean).sort().pop() || null;
    return { ok: true, source: 'supabase', count: items.length, items, syncedAt, lookbackDays: 120 };
  }
  async function handle(action, req, res, config, user) {
    if (!handles(action)) throw httpError(400, 'Hành động thông báo không hợp lệ.');
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    const result = await list(config);
    const allowed = user?.role === 'admin'
      ? null
      : user?.role === 'operator'
        ? new Set(['trip-reconciliation', 'operations-integrity'])
        : new Set(['trip-reconciliation', 'fund-low-balance']);
    const items = allowed ? result.items.filter((item) => allowed.has(item.notificationKey)) : result.items;
    return send(res, 200, { ...result, count: items.length, items });
  }
  return { handles, handle, list };
}

module.exports = { createNotificationCenterService, CRITICAL_SYNC_KEYS };
