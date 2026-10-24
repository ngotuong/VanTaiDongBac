const { assertPushEndpoint } = require('./push-endpoint-policy');
const TEST_NOTIFICATION = Object.freeze({
  title: 'Vận tải Đông Bắc',
  body: 'Thông báo thử nghiệm đã hoạt động trên thiết bị này.',
  tag: 'vtdb-push-test',
  url: '/?notifications=open'
});

function createPushService({ repository, preferenceService, webPush, httpError, now = () => new Date() }) {
  function assertConfigured(config) {
    if (!config.serviceRoleKey || !config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) {
      throw httpError(503, 'Web Push chưa được cấu hình trên môi trường này.');
    }
  }

  function normalizeSubscription(value) {
    const endpoint = String(value?.endpoint || '').trim();
    const p256dh = String(value?.keys?.p256dh || '').trim();
    const auth = String(value?.keys?.auth || '').trim();
    if (!endpoint.startsWith('https://') || endpoint.length > 2048 || !p256dh || !auth || p256dh.length > 512 || auth.length > 512) {
      throw httpError(400, 'Đăng ký thông báo của thiết bị không hợp lệ.');
    }
    try { assertPushEndpoint(endpoint); } catch (error) { throw httpError(400, error.message); }
    return { endpoint, expirationTime: value?.expirationTime || null, keys: { p256dh, auth } };
  }

  async function status(config, user) {
    assertConfigured(config);
    const subscriptions = await repository.listByUser(config, user.id);
    const preferenceStatus = preferenceService ? await preferenceService.preferences(config, user) : { types: [] };
    return { configured: true, publicKey: config.vapidPublicKey, deviceCount: subscriptions.length, ...preferenceStatus };
  }

  async function subscribe(config, user, value, userAgent) {
    assertConfigured(config);
    const subscription = normalizeSubscription(value);
    await repository.upsert(config, user.id, subscription, userAgent, now().toISOString());
    return { subscribed: true };
  }

  async function unsubscribe(config, user, endpoint) {
    assertConfigured(config);
    const normalized = String(endpoint || '').trim();
    if (!normalized.startsWith('https://') || normalized.length > 2048) throw httpError(400, 'Thiếu endpoint thông báo hợp lệ.');
    await repository.remove(config, user.id, normalized);
    return { subscribed: false };
  }

  async function sendTest(config, user, endpoint) {
    assertConfigured(config);
    const normalized = String(endpoint || '').trim();
    if (!normalized.startsWith('https://') || normalized.length > 2048) throw httpError(400, 'Thiết bị hiện tại chưa đăng ký thông báo.');
    const row = await repository.findByUserAndEndpoint(config, user.id, normalized);
    if (!row) throw httpError(404, 'Không tìm thấy đăng ký thông báo của thiết bị hiện tại.');
    try { assertPushEndpoint(row.endpoint); } catch (error) { throw httpError(400, error.message); }
    webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    try {
      await webPush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth_secret }
      }, JSON.stringify(TEST_NOTIFICATION), { TTL: 60, urgency: 'normal', timeout: 10000 });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await repository.remove(config, user.id, normalized);
        throw httpError(410, 'Đăng ký thông báo đã hết hạn. Vui lòng bật lại thông báo.');
      }
      throw httpError(502, 'Không gửi được thông báo thử tới thiết bị.');
    }
    return { sent: true };
  }

  async function setPreference(config, user, key, enabled) {
    if (!preferenceService) throw httpError(503, 'Lựa chọn loại thông báo chưa sẵn sàng.');
    return preferenceService.setPreference(config, user, key, enabled);
  }

  return { status, subscribe, unsubscribe, sendTest, setPreference, normalizeSubscription };
}

module.exports = { createPushService, TEST_NOTIFICATION };
