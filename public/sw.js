self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = String(payload.title || 'Vận tải Đông Bắc').slice(0, 80);
  const body = String(payload.body || 'Bạn có một thông báo mới.').slice(0, 180);
  const target = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  const tasks = [self.registration.showNotification(title, {
    body,
    icon: '/static/assets/icon-192.png',
    badge: '/static/assets/favicon.png',
    tag: String(payload.tag || 'vtdb-notification').slice(0, 80),
    renotify: false,
    data: { url: target }
  })];
  const badgeCount = Number(payload.unreadCount ?? payload.badgeCount);
  if (Number.isFinite(badgeCount) && badgeCount >= 0 && 'setAppBadge' in self.navigator) {
    tasks.push(badgeCount > 0 ? self.navigator.setAppBadge(badgeCount) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks));
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SET_APP_BADGE' || !('setAppBadge' in self.navigator)) return;
  const count = Number(event.data.count);
  if (!Number.isFinite(count) || count < 0) return;
  event.waitUntil(count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge());
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
