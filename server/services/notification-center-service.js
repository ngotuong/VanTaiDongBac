const crypto = require('crypto');
const { FUND_NOTIFICATION_ID } = require('./fund-low-balance-alert-service');
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
const DAILY_ACTUAL_CASH_EXCLUDED_CATEGORIES = new Set([
  'gop quy',
  'xang dau', 'dau', 'chi phi dau', 'dau nhien lieu', 'nhien lieu',
  'thue doanh nghiep', 'thue tndn', 'tndn', 'thue vat', 'vat', 'thue gtgt',
  'phi di duong', 'phi duong bo', 'phi duong',
  'tra luong', 'ung luong',
  'tra no', 'tra lai'
]);
const DAILY_FUEL_CATEGORIES = new Set(['xang dau', 'dau', 'chi phi dau', 'dau nhien lieu', 'nhien lieu']);
function syncSourceLabel(syncKey) {
  const key = String(syncKey || '');
  if (key === 'realtime_cache_worker') return 'Worker đồng bộ nền';
  if (key === 'realtime_cache' || key === 'realtime_cache_tick') return 'Đồng bộ nền định kỳ';
  if (key === 'notification_pipeline') return 'Pipeline thông báo';
  if (key === 'trip_notifications') return 'Đối soát số chuyến';
  if (key === 'operational_notifications') return 'Thông báo vận hành';
  if (key === 'daily_business_summary') return 'Thông báo tổng hợp ngày';
  if (key === 'external_sync_watchdog') return 'Watchdog giám sát đồng bộ';
  if (key === 'refresh_queue_deferred:transport') return 'Hàng đợi Báo cáo vận tải';
  if (key.startsWith('refresh_queue_deferred:fund')) return 'Hàng đợi Quỹ Thu Chi';
  if (key === 'transport_reports_manual_sheet') return 'Báo cáo vận tải';
  if (key.startsWith('payroll_explanations:')) return 'Giải trình bảng lương';
  if (key === 'fund_manual_sheet') return 'Quỹ Thu Chi';
  if (key === 'dashboard') return 'Tổng quan';
  if (key.startsWith('transport_sheet_change:')) return 'Dữ liệu Vận tải';
  if (key.startsWith('manage_data:')) return 'Dữ liệu Vận hành';
  if (key.startsWith('fund_')) return 'Dữ liệu Quỹ Thu Chi';
  if (key.startsWith('startup:') || key.startsWith('catalog')) return 'Danh mục và biểu mẫu';
  return 'Tác vụ đồng bộ hệ thống';
}

function statusUpdatedAt(row) {
  const value = new Date(row?.updated_at || row?.synced_at || 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function hasNewerRecoveryEvidence(row, syncStatuses) {
  const syncKey = String(row?.sync_key || '');
  if (syncKey.startsWith('payroll_explanations:')) {
    const failedAt = statusUpdatedAt(row);
    if (!failedAt) return false;
    return syncStatuses.some((candidate) => {
      if (!String(candidate?.sync_key || '').startsWith('payroll_explanations:')) return false;
      if (String(candidate?.status || '').toLowerCase() !== 'ok') return false;
      const recoveredAt = statusUpdatedAt(candidate);
      return recoveredAt && recoveredAt.getTime() > failedAt.getTime();
    });
  }
  const recoveryKey = syncKey === 'refresh_queue_deferred:transport'
    ? 'transport_reports_manual_sheet'
    : (syncKey.startsWith('refresh_queue_deferred:fund') ? 'fund_manual_sheet' : '');
  if (!recoveryKey) return false;
  const failedAt = statusUpdatedAt(row);
  if (!failedAt) return false;
  return syncStatuses.some((candidate) => {
    if (candidate?.sync_key !== recoveryKey || String(candidate?.status || '').toLowerCase() !== 'ok') return false;
    const recoveredAt = statusUpdatedAt(candidate);
    return recoveredAt && recoveredAt.getTime() > failedAt.getTime();
  });
}

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
      id: FUND_NOTIFICATION_ID,
      legacyIds: [id('fund-low-balance', threshold, balance, bundle?.synced_at)],
      type: 'fund-low-balance', notificationKey: 'fund-low-balance', severity: 'error',
      title: 'Số dư Quỹ dưới ngưỡng',
      message: `${String(rule.notification_body || 'Số dư Quỹ đang thấp')}: ${balance.toLocaleString('vi-VN')} đ.`,
      date: isoDate(bundle?.synced_at, currentTime), amount: balance, threshold,
      url: '/cashflow/'
    };
  }
  function dailyFundTotals(row, targetDateKey) {
    const payload = row?.payload;
    if (!payload || typeof payload !== 'object') return { fundAvailable: false, fundIncome: null, fundExpense: null, fundFuelExpense: null, fundGrossExpense: null, fundNet: null };
    const normalizeCategory = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const detailsFor = (groups) => (Array.isArray(groups) ? groups : []).flatMap((group) =>
      (Array.isArray(group?.details) ? group.details : []).map((item) => ({ ...item, category: item?.category || group?.category || '' }))
    ).filter((item) => String(item?.date || '').slice(0, 10) === targetDateKey);
    const total = (items) => items.reduce((sum, item) => sum + (Number.isFinite(Number(item?.amount)) ? Number(item.amount) : 0), 0);
    const incomeDetails = detailsFor(payload.incomeCategories);
    const expenseDetails = detailsFor(payload.expenseCategories);
    const fuelDetails = expenseDetails.filter((item) => DAILY_FUEL_CATEGORIES.has(normalizeCategory(item.category)));
    const actualCashDetails = expenseDetails.filter((item) => !DAILY_ACTUAL_CASH_EXCLUDED_CATEGORIES.has(normalizeCategory(item.category)));
    const excludedDetails = expenseDetails.filter((item) => DAILY_ACTUAL_CASH_EXCLUDED_CATEGORIES.has(normalizeCategory(item.category)));
    const fundIncome = total(incomeDetails);
    const fundExpense = total(actualCashDetails);
    const fundFuelExpense = total(fuelDetails);
    const fundExcludedExpense = total(excludedDetails);
    const fundGrossExpense = total(expenseDetails);
    return { fundAvailable: true, fundIncome, fundExpense, fundFuelExpense, fundExcludedExpense, fundGrossExpense, fundNet: fundIncome - fundGrossExpense };
  }
  function dailySummary(row, fundRow, currentTime, targetDateKey) {
    const payload = row?.payload;
    if (!payload || typeof payload !== 'object') return null;
    const transport = {
      date: isoDate(payload.date || row.synced_at, currentTime),
      displayDate: String(payload.displayDate || ''),
      trips: Number(payload.trips) || 0,
      volume: Number(payload.volume) || 0,
      revenue: Number(payload.revenue) || 0,
      fuelExpense: Number(payload.fuelExpense) || 0,
      fuelAvailable: payload.fuelAvailable === true,
      salaryExpense: Number(payload.salaryExpense) || 0,
      salaryAvailable: payload.salaryAvailable === true,
      vehicleCount: Number(payload.vehicleCount) || 0,
      projectCount: Number(payload.projectCount) || 0,
      syncedAt: payload.syncedAt || row.synced_at || null,
      fundSyncedAt: fundRow?.synced_at || null
    };
    const fund = dailyFundTotals(fundRow, targetDateKey);
    const grossProfitAvailable = transport.fuelAvailable && transport.salaryAvailable && fund.fundAvailable;
    return {
      ...transport,
      ...fund,
      grossProfitAvailable,
      grossProfit: grossProfitAvailable
        ? transport.revenue - transport.fuelExpense - transport.salaryExpense - fund.fundExpense
        : null
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
    const watchdogDeploymentAccessDenied = String(watchdogFailure?.status || '').toLowerCase() === 'deployment_access_denied';
    const safeSyncFailureMessage = (row, stale, ageMinutes) => {
      const source = syncSourceLabel(row.sync_key);
      if (stale) return `${source} chưa cập nhật trong ${Math.floor(ageMinutes)} phút. Trạng thái: gián đoạn.`;
      return `${source} · Trạng thái: vẫn đang lỗi (${Math.max(0, Math.floor(ageMinutes))} phút trước). Thông báo sẽ tự mất khi lượt đồng bộ kế tiếp thành công.`;
    };

    if (workerStale) {
      result.push({
        id: id('sync-health', 'realtime-cache-worker', worker.updated_at || worker.synced_at, 'stale'),
        type: 'sync-stale', notificationKey: 'system-health', severity: 'error',
        title: watchdogAuthorizationRequired
          ? 'Đồng bộ cần được cấp lại quyền'
          : (watchdogDeploymentAccessDenied ? 'Kết nối Apps Script bị chặn' : (watchdogFailure ? 'Không thể tự khôi phục đồng bộ' : 'Đồng bộ tự động đã dừng')),
        message: watchdogAuthorizationRequired
          ? 'Apps Script xác nhận thiếu quyền OAuth. Hãy mở đúng tài khoản chủ dự án và chạy recoverSyncInfrastructure().'
          : (watchdogDeploymentAccessDenied
            ? 'Webapp không truy cập được Apps Script deployment. Hãy kiểm tra đúng tài khoản triển khai và quyền truy cập deployment.'
            : (watchdogFailure
            ? 'Watchdog đã phát hiện gián đoạn nhưng lượt tự khôi phục chưa thành công. Hãy kiểm tra Trạng thái hệ thống.'
            : `Dữ liệu chưa cập nhật trong ${Math.floor(workerAgeMinutes)} phút. Các tác vụ dữ liệu và thông báo đang tạm dừng.`)),
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
      if (status !== 'ok' && hasNewerRecoveryEvidence(row, syncStatuses)) continue;
      const expiredFailure = status !== 'ok' && ageMinutes > SYSTEM_FAILURE_LOOKBACK_MINUTES;
      if (expiredFailure && !maxAge) continue;
      const stale = status === 'ok' || expiredFailure;
      const externalWatchdogFailure = row.sync_key === 'external_sync_watchdog' && status !== 'ok';
      const externalWatchdogAuthorizationRequired = externalWatchdogFailure && status === 'authorization_required';
      const externalWatchdogDeploymentAccessDenied = externalWatchdogFailure && status === 'deployment_access_denied';
      result.push({
        id: id('sync-health', row.sync_key, row.status, row.updated_at, stale ? 'stale' : row.message),
        type: stale ? 'sync-stale' : 'sync-failure', notificationKey: 'system-health', severity: 'error',
        title: externalWatchdogAuthorizationRequired
          ? 'Đồng bộ cần được cấp lại quyền'
          : (externalWatchdogDeploymentAccessDenied ? 'Kết nối Apps Script bị chặn' : (externalWatchdogFailure ? 'Không thể tự khôi phục đồng bộ' : (stale ? `${syncSourceLabel(row.sync_key)} đã gián đoạn` : `${syncSourceLabel(row.sync_key)} gặp lỗi`))),
        message: externalWatchdogAuthorizationRequired
          ? 'Apps Script xác nhận thiếu quyền OAuth. Hãy mở đúng tài khoản chủ dự án và chạy recoverSyncInfrastructure().'
          : (externalWatchdogDeploymentAccessDenied
            ? 'Webapp không truy cập được Apps Script deployment. Hãy kiểm tra đúng tài khoản triển khai và quyền truy cập deployment.'
            : (externalWatchdogFailure
            ? 'Watchdog đã phát hiện gián đoạn nhưng lượt tự khôi phục chưa thành công. Hãy kiểm tra Trạng thái hệ thống.'
            : safeSyncFailureMessage(row, stale, ageMinutes))),
        date: isoDate(row.updated_at || row.synced_at, currentTime), url: '/observability/'
      });
    }
    for (const job of snapshot.writeJobs || []) {
      if (String(job.last_error || '').startsWith('CANCELED_BY_OPERATOR:')) continue;
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

module.exports = { createNotificationCenterService, CRITICAL_SYNC_KEYS, SYSTEM_FAILURE_LOOKBACK_MINUTES, DAILY_ACTUAL_CASH_EXCLUDED_CATEGORIES, syncSourceLabel, hasNewerRecoveryEvidence };
