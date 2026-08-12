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
  assert.match(center, /Xem tất cả/);
  assert.match(center, /Đánh dấu tất cả đã đọc/);
  assert.match(center, /localStorage\.setItem\(storageKey/);
  assert.match(center, /updateAppBadge\(unreadCount\)/);
  assert.doesNotMatch(center, /Nguồn: XL_DoiSoatChuyen/);
  assert.match(css, /padding-inline: var\(--platform-control-padding-x, 12px\) 40px !important/);
  assert.match(css, /catalog-sticky-toolbar[\s\S]*height: 44px !important/);
});
