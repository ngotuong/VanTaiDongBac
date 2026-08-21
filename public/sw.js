const BADGE_STATE_CACHE = 'vtdb-badge-state-v1';
const BADGE_STATE_URL = '/__vtdb_badge_state__';

async function readBadgeCount() {
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    const response = await cache.match(BADGE_STATE_URL);
    const payload = response ? await response.json() : {};
    const count = Number(payload.count);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch { return 0; }
}

async function setBadgeCount(value) {
  const count = Math.max(0, Number(value) || 0);
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    await cache.put(BADGE_STATE_URL, new Response(JSON.stringify({ count }), { headers: { 'Content-Type': 'application/json' } }));
  } catch {}
  if (!('setAppBadge' in self.navigator)) return;
  if (count > 0) await self.navigator.setAppBadge(count);
  else await self.navigator.clearAppBadge();
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = String(payload.title || 'Vận tải Đông Bắc').slice(0, 80);
  const body = String(payload.body || 'Bạn có một thông báo mới.').slice(0, 180);
  const target = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: '/static/assets/icon-192.png',
      badge: '/static/assets/favicon.png',
      tag: String(payload.tag || 'vtdb-notification').slice(0, 80),
      renotify: false,
      data: { url: target }
    });
    if (payload.preserveBadge === true) return;
    const delta = Number(payload.unreadDelta);
    if (Number.isFinite(delta) && delta >= 0) {
      await setBadgeCount((await readBadgeCount()) + delta);
      return;
    }
    const legacyExact = Number(payload.unreadCount ?? payload.badgeCount);
    if (Number.isFinite(legacyExact) && legacyExact >= 0) await setBadgeCount(legacyExact);
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SET_APP_BADGE' || !('setAppBadge' in self.navigator)) return;
  const count = Number(event.data.count);
  if (!Number.isFinite(count) || count < 0) return;
  event.waitUntil(setBadgeCount(count));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationTarget = event.notification?.data?.url || '/';
  const target = notificationTarget === '/entry/' ? '/manage/?entry=vanChuyen' : notificationTarget;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
