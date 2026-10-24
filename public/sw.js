const BADGE_STATE_CACHE = 'vtdb-badge-state-v1';
const BADGE_STATE_URL = '/__vtdb_badge_state__';
const MAX_BADGE_IDS = 2000;
let badgeUpdates = Promise.resolve();

function queueBadgeUpdate(action) {
  const next = badgeUpdates.then(action);
  badgeUpdates = next.catch(() => {});
  return next;
}

function badgeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.length > 0 && value.length <= 256))].slice(-MAX_BADGE_IDS);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function readBadgeState() {
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    const response = await cache.match(BADGE_STATE_URL);
    const payload = response ? await response.json() : {};
    const count = Number(payload.count);
    return { count: Number.isFinite(count) && count >= 0 ? count : 0, seenIds: badgeIds(payload.seenIds) };
  } catch { return { count: 0, seenIds: [] }; }
}

async function setBadgeCount(value, seenIds) {
  const count = Math.max(0, Number(value) || 0);
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    await cache.put(BADGE_STATE_URL, new Response(JSON.stringify({ count, seenIds: badgeIds(seenIds) }), { headers: { 'Content-Type': 'application/json' } }));
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
  event.waitUntil(queueBadgeUpdate(async () => {
    await self.registration.showNotification(title, {
      body,
      icon: '/static/assets/icon-192.png',
      badge: '/static/assets/favicon.png',
      tag: String(payload.tag || 'vtdb-notification').slice(0, 80),
      renotify: false,
      data: { url: target, notificationId: String(payload.notificationId || '') }
    });
    if (payload.preserveBadge === true) return;
    const state = await readBadgeState();
    const ids = badgeIds(payload.badgeIds || (payload.notificationId ? [payload.notificationId] : []));
    if (ids.length) {
      const known = new Set(state.seenIds);
      const added = ids.filter((id) => !known.has(id));
      await setBadgeCount(state.count + added.length, [...state.seenIds, ...added]);
      return;
    }
    const delta = Number(payload.unreadDelta);
    if (Number.isFinite(delta) && delta >= 0) {
      await setBadgeCount(state.count + delta, state.seenIds);
      return;
    }
    const legacyExact = Number(payload.unreadCount ?? payload.badgeCount);
    if (Number.isFinite(legacyExact) && legacyExact >= 0) await setBadgeCount(legacyExact, state.seenIds);
  }));
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SET_APP_BADGE') return;
  const count = Number(event.data.count);
  if (!Number.isFinite(count) || count < 0) return;
  event.waitUntil(queueBadgeUpdate(async () => {
    const state = await readBadgeState();
    await setBadgeCount(count, [...state.seenIds, ...badgeIds(event.data.notificationIds)]);
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationId = String(event.notification.data?.notificationId || '');
  const target = `/?notifications=open${notificationId ? `&notificationId=${encodeURIComponent(notificationId)}` : ''}`;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      let active = existing;
      try {
        if ('navigate' in existing) active = await existing.navigate(target) || existing;
      } catch {}
      await active.focus();
      active.postMessage({ type: 'OPEN_NOTIFICATION_CENTER', notificationId });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
