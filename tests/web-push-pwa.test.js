const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Web Push service worker persists only badge count and never caches app requests', () => {
  const worker = read('public/sw.js');
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /self\.navigator\.setAppBadge/);
  assert.match(worker, /payload\.unreadCount/);
  assert.match(worker, /event\.data\?\.type !== 'SET_APP_BADGE'/);
  assert.match(worker, /BADGE_STATE_CACHE = 'vtdb-badge-state-v1'/);
  assert.match(worker, /JSON\.stringify\(\{ count \}\)/);
  assert.match(worker, /payload\.unreadDelta/);
  assert.match(worker, /payload\.preserveBadge/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(worker, /notificationTarget === '\/entry\/' \? '\/manage\/\?entry=vanChuyen'/);
  assert.doesNotMatch(worker, /addEventListener\(['"]fetch['"]/);
  assert.doesNotMatch(worker, /cache\.add|cache\.addAll|indexedDB/);
});

test('Web Push API requires current session and same-origin CSRF for writes', () => {
  const api = read('api/push.js');
  assert.match(api, /getAuthenticatedUser\(req, config\)/);
  assert.match(api, /assertSameOrigin\(req, httpError\)/);
  assert.match(api, /service\.sendTest\(config, user, req\.body\?\.endpoint\)/);
  assert.doesNotMatch(api, /APP_PROXY_SECRET|appsScriptUrl/);
});

test('Web Push migration keeps subscription credentials server-only', () => {
  const migration = read('supabase/migrations/011_web_push_subscriptions.sql');
  assert.match(migration, /references public\.app_users\(user_id\) on delete cascade/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.web_push_subscriptions from public, anon, authenticated/i);
  assert.match(migration, /grant all on public\.web_push_subscriptions to service_role/i);
  assert.match(migration, /unique \(user_id, endpoint_hash\)/i);
});

test('Settings asks permission only from an explicit accessible switch and exposes a self-test', () => {
  const component = read('next-shell/components/settings/PushNotificationSettings.tsx');
  const pillSwitch = read('next-shell/components/settings/PillSwitch.tsx');
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  assert.match(settings, /<PushNotificationSettings isAdmin=\{isAdmin\} \/>/);
  assert.match(component, /Notification\.requestPermission\(\)/);
  assert.match(component, /<PillSwitch checked=\{enabled\}/);
  assert.match(component, /nextEnabled \? enable\(\) : disable\(\)/);
  assert.match(pillSwitch, /role="switch"/);
  assert.match(pillSwitch, /aria-checked=\{checked\}/);
  assert.match(component, /Gửi thông báo thử/);
  assert.match(component, /Thêm vào MH chính/);
  assert.match(component, /X-VTDB-CSRF/);
  assert.doesNotMatch(component, /localStorage|indexedDB/);
});

test('Settings explains the iOS Home Screen requirement before checking PushManager', () => {
  const component = read('next-shell/components/settings/PushNotificationSettings.tsx');
  const iosGate = component.indexOf("if (isIos() && !isStandalone())");
  const capabilityGate = component.indexOf("if (!window.isSecureContext || !('serviceWorker' in navigator)");
  assert.ok(iosGate >= 0);
  assert.ok(capabilityGate > iosGate);
  assert.match(component, /iOS\/iPadOS 16\.4 trở lên/);
  assert.match(component, /window\.navigator\.maxTouchPoints > 1/);
});

test('Core API configuration does not depend on optional VAPID secrets', () => {
  const proxy = read('api/app.js');
  assert.match(proxy, /const coreConfig = \[config\.supabaseUrl, config\.anonKey, config\.serviceRoleKey, config\.appsScriptUrl, config\.proxySecret\]/);
  assert.doesNotMatch(proxy, /Object\.values\(config\)\.some/);
});
