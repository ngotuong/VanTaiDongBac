const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createNotificationCenterService } = require('../server/services/notification-center-service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('notification cache is derived read-only from XL_DoiSoatChuyen and synced every five minutes', () => {
  const sync = read('TripNotificationSyncService.gs');
  const facade = read('SupabaseService.gs');
  assert.match(sync, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(sync, /XL_DoiSoatChuyen/);
  assert.match(sync, /manage_data_bundles/);
  assert.match(sync, /notifications:active/);
  assert.doesNotMatch(sync, /setValue|setValues|appendRow|deleteRow/);
  assert.match(sync, /reconciliation/);
  assert.match(sync, /hot-bonus/);
  assert.match(facade, /TRIP_NOTIFICATION_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(facade, /syncTripNotificationsIfDue_\(props, nowMillis\)/);
});

test('operations notifications trust only workbook helper columns and never write Google Sheets', () => {
  const sync = read('OperationalNotificationSyncService.gs');
  assert.match(sync, /NL_ChamCong/);
  assert.match(sync, /NL_PhanCongLai/);
  assert.match(sync, /row\[10\]/);
  assert.match(sync, /row\[4\]/);
  assert.match(sync, /operations:active/);
  assert.doesNotMatch(sync, /setValue|setValues|appendRow|deleteRow/);
});

test('daily digest summary uses previous-day transport and exact monthly Fund overview', () => {
  const summary = read('DailyBusinessSummaryService.gs');
  const facade = read('SupabaseService.gs');
  const repository = read('server/repositories/notification-bundle-repository.js');
  const dispatch = read('server/services/notification-dispatch-service.js');
  assert.match(summary, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(summary, /XL_VanChuyen/);
  assert.match(summary, /daily-summary:latest/);
  assert.match(summary, /row\[4\]/);
  assert.match(summary, /row\[5\]/);
  assert.match(summary, /row\[11\]/);
  assert.doesNotMatch(summary, /setValue|setValues|appendRow|deleteRow/);
  assert.match(facade, /syncDailyBusinessSummary\(\)/);
  assert.match(repository, /findDailySummary/);
  assert.match(repository, /findFundDailySummary/);
  assert.match(repository, /fund_overview_bundles/);
  assert.match(dispatch, /Tổng hợp ngày/);
  assert.match(dispatch, /doanh thu/);
  assert.match(dispatch, /chi Quỹ/);
});

test('notification delivery is opt-in, baselined and disabled in Apps Script until production rollout', () => {
  const dispatch = read('NotificationDispatchService.gs');
  const service = read('server/services/notification-dispatch-service.js');
  const preferences = read('server/repositories/notification-preference-repository.js');
  assert.match(dispatch, /NOTIFICATION_DISPATCH_ENABLED/);
  assert.match(dispatch, /Notification dispatch is disabled/);
  assert.match(dispatch, /replace\(\/\\\/\+\$\/, ''\) \+ '\/'/);
  assert.match(dispatch, /method: 'post'/);
  assert.match(service, /notification-dispatch-baseline-v1/);
  assert.match(service, /Daily digest is scheduled at 12:00/);
  assert.match(preferences, /notification-preference:/);
  assert.match(preferences, /notification_rule_states/);
});

test('notification center aggregates yesterday Fund income and expense by exact detail date', async () => {
  let requestedDate = '';
  const service = createNotificationCenterService({
    repository: { find: async (_config, dateKey) => {
      requestedDate = dateKey;
      return {
        trip: null, operations: null, fund: null, syncStatuses: [], writeJobs: [],
        dailySummary: { payload: { date: '2026-08-12', displayDate: '12/08/2026', trips: 8, revenue: 12000000, vehicleCount: 3, volume: 90, projectCount: 2 }, synced_at: '2026-08-13T04:58:00.000Z' },
        dailyFundSummary: { payload: {
          incomeCategories: [{ details: [{ date: '2026-08-12', amount: 5000000 }, { date: '2026-08-11', amount: 1000000 }] }],
          expenseCategories: [{ details: [{ date: '2026-08-12', amount: 3000000 }, { date: '2026-08-12', amount: 2000000 }] }]
        }, synced_at: '2026-08-13T04:57:00.000Z' }
      };
    } },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-13T05:00:00.000Z')
  });
  const result = await service.list({});
  assert.equal(requestedDate, '2026-08-12');
  assert.equal(result.dailySummary.fundAvailable, true);
  assert.equal(result.dailySummary.fundIncome, 5000000);
  assert.equal(result.dailySummary.fundExpense, 5000000);
  assert.equal(result.dailySummary.fundNet, 0);
});

test('Apps Script dispatch normalizes the trailing slash and preserves POST', () => {
  const request = {};
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => ({
      NOTIFICATION_DISPATCH_ENABLED: 'true',
      NOTIFICATION_DISPATCH_URL: 'https://dongbac.vercel.app/api/notification-dispatch',
      NOTIFICATION_DISPATCH_SECRET: 'test-secret'
    })[key] || '' }) },
    UrlFetchApp: { fetch: (url, options) => {
      request.url = url;
      request.options = options;
      return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
    } }
  };
  vm.runInNewContext(read('NotificationDispatchService.gs'), sandbox);
  const result = sandbox.NotificationDispatchService.dispatch({ nowISOString: () => '2026-08-13T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(request.url, 'https://dongbac.vercel.app/api/notification-dispatch/');
  assert.equal(request.options.method, 'post');
});

test('notification API remains authenticated, shareholder-readable and Supabase-only', () => {
  const proxy = read('api/app.js');
  const policy = read('server/services/authorization-policy.js');
  const service = read('server/services/notification-center-service.js');
  const repository = read('server/repositories/notification-bundle-repository.js');
  assert.match(proxy, /getAuthenticatedUser\(req, config\)/);
  assert.match(policy, /'getNotifications'/);
  assert.match(service, /action === 'getNotifications'/);
  assert.match(repository, /manage_data_bundles/);
  assert.doesNotMatch(service + repository, /appsScriptClient|APPS_SCRIPT_URL/);
});

test('notification center expires old incidental sync failures but keeps critical workers as stale', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'refresh_queue_deferred:transport', status: 'error', message: 'old lock', updated_at: '2026-08-11T00:00:00.000Z' },
        { sync_key: 'recent_incidental', status: 'error', message: 'recent error', updated_at: '2026-08-13T00:30:00.000Z' },
        { sync_key: 'notification_pipeline', status: 'error', message: 'old pipeline error', updated_at: '2026-08-11T00:00:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-13T01:00:00.000Z')
  });
  const result = await service.list({});
  assert.equal(result.items.some((item) => item.message.includes('old lock')), false);
  assert.equal(result.items.some((item) => item.message.includes('recent error')), true);
  const critical = result.items.find((item) => item.message.includes('notification_pipeline'));
  assert.equal(critical.type, 'sync-stale');
  assert.equal(critical.title, 'Dữ liệu chưa được đồng bộ mới');
});

test('notification center collapses stale realtime worker dependencies into one useful alert', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' },
        { sync_key: 'trip_notifications', status: 'ok', updated_at: '2026-08-19T08:42:00.000Z' },
        { sync_key: 'operational_notifications', status: 'ok', updated_at: '2026-08-19T08:42:00.000Z' },
        { sync_key: 'notification_pipeline', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const systemItems = result.items.filter((item) => item.notificationKey === 'system-health');
  assert.equal(systemItems.length, 1);
  assert.equal(systemItems[0].title, 'Đồng bộ tự động đã dừng');
  assert.match(systemItems[0].message, /1113 phút/);
  assert.doesNotMatch(systemItems[0].message, /realtime_cache_worker|trip_notifications|operational_notifications|notification_pipeline/);
});

test('notification center replaces stale worker noise with one authorization instruction from the external watchdog', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' },
        { sync_key: 'trip_notifications', status: 'ok', updated_at: '2026-08-19T08:42:00.000Z' },
        { sync_key: 'external_sync_watchdog', status: 'authorization_required', message: 'Apps Script trả status 403.', updated_at: '2026-08-20T03:10:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const systemItems = result.items.filter((item) => item.notificationKey === 'system-health');
  assert.equal(systemItems.length, 1);
  assert.equal(systemItems[0].title, 'Đồng bộ cần được cấp lại quyền');
  assert.match(systemItems[0].message, /mở Apps Script/);
  assert.doesNotMatch(systemItems[0].message, /403|realtime_cache_worker|trip_notifications/);
});

test('notification center does not mislabel a transient watchdog failure as OAuth revocation', async () => {
  const service = createNotificationCenterService({
    repository: { find: async () => ({
      trip: null, operations: null, fund: null, writeJobs: [],
      syncStatuses: [
        { sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-20T03:00:00.000Z' },
        { sync_key: 'external_sync_watchdog', status: 'error', message: 'Upstream timeout.', updated_at: '2026-08-20T03:10:00.000Z' }
      ]
    }) },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    send: () => {},
    now: () => new Date('2026-08-20T03:16:00.000Z')
  });
  const result = await service.list({});
  const item = result.items.find((entry) => entry.notificationKey === 'system-health');
  assert.equal(item.title, 'Không thể tự khôi phục đồng bộ');
  assert.doesNotMatch(item.message, /cấp lại quyền/);
});

test('header uses an accessible bell and filter controls reserve a chevron gutter', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const adaptive = read('next-shell/components/platform/AdaptiveFilterSizing.tsx');
  const center = read('next-shell/components/platform/NotificationCenter.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(shell, /<NotificationCenter userId=\{context\.user\.id\} \/>/);
  assert.match(shell, /<AdaptiveFilterSizing \/>/);
  assert.match(adaptive, /measureText\(selectedLabel\(select\)\)/);
  assert.match(adaptive, /setProperty\('width', selectedWidth, 'important'\)/);
  assert.match(adaptive, /FILTER_INLINE_PADDING/);
  assert.doesNotMatch(shell, /aria-label="Mở Google Sheet"/);
  assert.match(center, /aria-expanded=\{open\}/);
  assert.match(center, /role="dialog"/);
  assert.match(center, /aria-live="polite"/);
  assert.match(center, />Tất cả <span>/);
  assert.match(center, />Chưa đọc <span>/);
  assert.match(center, /aria-label="Đánh dấu tất cả là đã đọc"/);
  assert.match(center, /aria-label="Làm mới thông báo"/);
  assert.doesNotMatch(center, />Đánh dấu tất cả đã đọc</);
  assert.doesNotMatch(center, />Làm mới</);
  assert.match(center, /localStorage\.setItem\(storageKey/);
  assert.match(center, /updateAppBadge\(unreadCount\)/);
  assert.match(read('public/sw.js'), /BADGE_STATE_CACHE/);
  assert.match(read('public/sw.js'), /unreadDelta/);
  assert.match(read('public/sw.js'), /preserveBadge/);
  assert.match(center, /COPY_LONG_PRESS_MS = 550/);
  assert.match(center, /Nhấn giữ để sao chép nội dung/);
  assert.match(center, /navigator\.clipboard\.writeText/);
  assert.match(center, /legacyCopyText\(value\)/);
  assert.match(center, /notification-copy-dialog/);
  assert.match(center, /Safari đang chặn sao chép tự động/);
  assert.match(center, /setCopyFallback\(item\)/);
  assert.match(center, /textarea\.setSelectionRange\(0, value\.length\)/);
  assert.match(center, /state\?\.triggered/);
  assert.match(center, /onPointerUp=\{\(\) => endLongPress\(item\)\}/);
  assert.match(center, /window\.location\.assign\(item\.url\)/);
  assert.match(center, /aria-keyshortcuts="Control\+C Meta\+C"/);
  assert.match(center, /onCopy=\{\(event\) =>/);
  assert.match(center, /event\.clipboardData\.setData\('text\/plain', notificationClipboardText\(item\)\)/);
  assert.match(center, /suppressClickRef\.current === key/);
  assert.doesNotMatch(center, /Nguồn: XL_DoiSoatChuyen/);
  assert.match(css, /padding-inline: 10px 30px !important/);
  assert.match(css, /catalog-sticky-toolbar[\s\S]*height: 44px !important/);
  assert.match(css, /\.notification-toolbar-actions \{[\s\S]*display: flex;/);
  assert.match(css, /\.notification-toolbar-icon \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
  assert.match(css, /\.notification-item-action \{[\s\S]*touch-action: pan-y;/);
  assert.match(css, /\.notification-item-action \{[\s\S]*-webkit-touch-callout: none;/);
  assert.match(css, /\.notification-backdrop:hover,[\s\S]*background: rgba\(15, 23, 42, \.18\) !important;/);
  assert.match(css, /\.notification-copy-dialog textarea \{[\s\S]*user-select: text;/);
  assert.match(css, /\.notification-item-action\.copy-pressing/);
});

test('all date controls use one final left-alignment contract including Safari native values', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /Final date-control contract/);
  assert.match(css, /html body \.custom-date-box \{[\s\S]*justify-content: flex-start !important;[\s\S]*text-align: left !important;/);
  assert.match(css, /html body \.custom-date-box \.date-display-text \{[\s\S]*width: 100% !important;[\s\S]*text-align: left !important;/);
  assert.match(css, /input\[type="date"\]::\-webkit-date-and-time-value[\s\S]*text-align: left !important;/);
  assert.match(css, /cashflow-overview-filter-panel \.cashflow-filter-stack \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 142px !important;/);
  assert.match(css, /cashflow-overview-filter-panel \.cashflow-date-input \.date-display-text \{[\s\S]*font-size: 13px !important;/);
});
