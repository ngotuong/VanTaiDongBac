const crypto = require('crypto');
const { vietnamClock } = require('./vietnam-time');

const CRITICAL_SYNC_KEYS = new Map([
  ['realtime_cache_worker', 15],
  ['trip_notifications', 15],
  ['operational_notifications', 15],
  ['notification_pipeline', 15]
]);
const REALTIME_WORKER_DEPENDENCIES = new Set([
  'trip_notifications',
  'operational_notifications',
  'notification_pipeline'
]);
const SYSTEM_FAILURE_LOOKBACK_MINUTES = 24 * 60;

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
  function dailyFundTotals(row, targetDateKey) {
    const payload = row?.payload;
    if (!payload || typeof payload !== 'object') return { fundAvailable: false, fundIncome: null, fundExpense: null, fundNet: null };
    const totalFor = (groups) => (Array.isArray(groups) ? groups : [])
      .flatMap((group) => Array.isArray(group?.details) ? group.details : [])
      .filter((item) => String(item?.date || '').slice(0, 10) === targetDateKey)
      .reduce((sum, item) => sum + (Number.isFinite(Number(item?.amount)) ? Number(item.amount) : 0), 0);
    const fundIncome = totalFor(payload.incomeCategories);
    const fundExpense = totalFor(payload.expenseCategories);
    return { fundAvailable: true, fundIncome, fundExpense, fundNet: fundIncome - fundExpense };
  }
  function dailySummary(row, fundRow, currentTime, targetDateKey) {
    const payload = row?.payload;
    if (!payload || typeof payload !== 'object') return null;
    return {
      date: isoDate(payload.date || row.synced_at, currentTime),
      displayDate: String(payload.displayDate || ''),
      trips: Number(payload.trips) || 0,
      volume: Number(payload.volume) || 0,
      revenue: Number(payload.revenue) || 0,
      vehicleCount: Number(payload.vehicleCount) || 0,
      projectCount: Number(payload.projectCount) || 0,
      syncedAt: payload.syncedAt || row.synced_at || null,
      fundSyncedAt: fundRow?.synced_at || null,
      ...dailyFundTotals(fundRow, targetDateKey)
    };
  }
  function systemItems(snapshot, currentTime) {
    const result = [];
    const syncStatuses = snapshot.syncStatuses || [];
    const worker = syncStatuses.find((row) => row.sync_key === 'realtime_cache_worker');
    const workerUpdated = new Date(worker?.updated_at || worker?.synced_at || 0);
    const workerAgeMinutes = Number.isNaN(workerUpdated.getTime())
      ? Infinity
      : (currentTime.getTime() - workerUpdated.getTime()) / 60000;
    const workerStale = Boolean(worker) && workerAgeMinutes > CRITICAL_SYNC_KEYS.get('realtime_cache_worker');
    const watchdogFailure = syncStatuses.find((row) => row.sync_key === 'external_sync_watchdog' && String(row.status || '').toLowerCase() !== 'ok');
    const watchdogAuthorizationRequired = String(watchdogFailure?.status || '').toLowerCase() === 'authorization_required';

    if (workerStale) {
      result.push({
        id: id('sync-health', 'realtime-cache-worker', worker.updated_at || worker.synced_at, 'stale'),
        type: 'sync-stale', notificationKey: 'system-health', severity: 'error',
        title: watchdogAuthorizationRequired ? 'Đồng bộ cần được cấp lại quyền' : (watchdogFailure ? 'Không thể tự khôi phục đồng bộ' : 'Đồng bộ tự động đã dừng'),
        message: watchdogAuthorizationRequired
          ? 'Google đang chặn tiến trình đồng bộ. Hãy mở Apps Script và chạy một hàm bất kỳ để cấp lại quyền.'
          : (watchdogFailure
            ? 'Watchdog đã phát hiện gián đoạn nhưng lượt tự khôi phục chưa thành công. Hãy kiểm tra Trạng thái hệ thống.'
            : `Dữ liệu chưa cập nhật trong ${Math.floor(workerAgeMinutes)} phút. Các tác vụ dữ liệu và thông báo đang tạm dừng.`),
        date: isoDate(worker.updated_at || worker.synced_at, currentTime), url: '/observability/'
      });
    }
    for (const row of syncStatuses) {
      const status = String(row.status || '').toLowerCase();
      const maxAge = CRITICAL_SYNC_KEYS.get(row.sync_key);
      const updated = new Date(row.updated_at || row.synced_at || 0);
      const ageMinutes = Number.isNaN(updated.getTime()) ? Infinity : (currentTime.getTime() - updated.getTime()) / 60000;
      if (workerStale && row.sync_key === 'realtime_cache_worker') continue;
      if (workerStale && REALTIME_WORKER_DEPENDENCIES.has(row.sync_key) && ageMinutes > maxAge) continue;
      if (workerStale && row.sync_key === 'external_sync_watchdog') continue;
      if (status === 'ok' && (!maxAge || ageMinutes <= maxAge)) continue;
      if (status === 'ok' && maxAge && ageMinutes <= maxAge) continue;
      const expiredFailure = status !== 'ok' && ageMinutes > SYSTEM_FAILURE_LOOKBACK_MINUTES;
      if (expiredFailure && !maxAge) continue;
      const stale = status === 'ok' || expiredFailure;
      const externalWatchdogFailure = row.sync_key === 'external_sync_watchdog' && status !== 'ok';
      const externalWatchdogAuthorizationRequired = externalWatchdogFailure && status === 'authorization_required';
      result.push({
        id: id('sync-health', row.sync_key, row.status, row.updated_at, stale ? 'stale' : row.message),
        type: stale ? 'sync-stale' : 'sync-failure', notificationKey: 'system-health', severity: 'error',
        title: externalWatchdogAuthorizationRequired ? 'Đồng bộ cần được cấp lại quyền' : (externalWatchdogFailure ? 'Không thể tự khôi phục đồng bộ' : (stale ? 'Dữ liệu chưa được đồng bộ mới' : 'Đồng bộ dữ liệu gặp lỗi')),
        message: externalWatchdogAuthorizationRequired
          ? 'Google đang chặn tiến trình đồng bộ. Hãy mở Apps Script và chạy một hàm bất kỳ để cấp lại quyền.'
          : (externalWatchdogFailure
            ? 'Watchdog đã phát hiện gián đoạn nhưng lượt tự khôi phục chưa thành công. Hãy kiểm tra Trạng thái hệ thống.'
            : (stale ? `${row.sync_key} chưa cập nhật trong ${Math.floor(ageMinutes)} phút.` : `${row.sync_key}: ${String(row.message || row.status).slice(0, 160)}.`)),
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
    const currentTime = now();
    const clock = vietnamClock(currentTime);
    const snapshot = await repository.find(config, clock.previousDateKey);
    const fund = fundItem(snapshot.fund, currentTime);
    const items = [
      ...safeItems(snapshot.trip).map((item) => ({ ...item, notificationKey: 'trip-reconciliation', url: '/manage/?entry=vanChuyen' })),
      ...safeItems(snapshot.operations),
      ...(fund ? [fund] : []),
      ...systemItems(snapshot, currentTime)
    ].sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      const weight = { error: 0, warning: 1, success: 2, info: 3 };
      return (weight[left.severity] ?? 3) - (weight[right.severity] ?? 3);
    }).slice(0, 200);
    const syncedAt = [snapshot.trip?.synced_at, snapshot.operations?.synced_at].filter(Boolean).sort().pop() || null;
    return { ok: true, source: 'supabase', count: items.length, items, syncedAt, lookbackDays: 120, dailySummary: dailySummary(snapshot.dailySummary, snapshot.dailyFundSummary, currentTime, clock.previousDateKey) };
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
    const publicResult = { ...result };
    delete publicResult.dailySummary;
    return send(res, 200, { ...publicResult, count: items.length, items });
  }
  return { handles, handle, list };
}

module.exports = { createNotificationCenterService, CRITICAL_SYNC_KEYS, SYSTEM_FAILURE_LOOKBACK_MINUTES };
