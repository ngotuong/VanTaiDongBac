const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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

test('notification delivery is opt-in, baselined and disabled in Apps Script until production rollout', () => {
  const dispatch = read('NotificationDispatchService.gs');
  const service = read('server/services/notification-dispatch-service.js');
  const preferences = read('server/repositories/notification-preference-repository.js');
  assert.match(dispatch, /NOTIFICATION_DISPATCH_ENABLED/);
  assert.match(dispatch, /Notification dispatch is disabled/);
  assert.match(service, /notification-dispatch-baseline-v1/);
  assert.match(service, /Daily digest is scheduled at 20:00/);
  assert.match(preferences, /notification-preference:/);
  assert.match(preferences, /notification_rule_states/);
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

test('header uses an accessible bell and filter controls reserve a chevron gutter', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const center = read('next-shell/components/platform/NotificationCenter.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(shell, /<NotificationCenter userId=\{context\.user\.id\} \/>/);
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
  assert.doesNotMatch(center, /Nguồn: XL_DoiSoatChuyen/);
  assert.match(css, /padding-inline: var\(--platform-control-padding-x, 12px\) 40px !important/);
  assert.match(css, /catalog-sticky-toolbar[\s\S]*height: 44px !important/);
  assert.match(css, /\.notification-toolbar-actions \{[\s\S]*display: flex;/);
  assert.match(css, /\.notification-toolbar-icon \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
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
