self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = String(payload.title || 'Vận tải Đông Bắc').slice(0, 80);
  const body = String(payload.body || 'Bạn có một thông báo mới.').slice(0, 180);
  const target = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/static/assets/icon-192.png',
    badge: '/static/assets/favicon.png',
    tag: String(payload.tag || 'vtdb-notification').slice(0, 80),
    renotify: false,
    data: { url: target }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';
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
