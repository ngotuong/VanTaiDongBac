const webPush = require('web-push');
const { createAppUserRepository } = require('../server/repositories/app-user-repository');
const { createPushSubscriptionRepository } = require('../server/repositories/push-subscription-repository');
const { createNotificationPreferenceRepository } = require('../server/repositories/notification-preference-repository');
const { createNotificationRuleConfigRepository } = require('../server/repositories/notification-rule-config-repository');
const { runtimeConfig } = require('../server/runtime-config');
const { createAuthService } = require('../server/services/auth-service');
const { createPushService } = require('../server/services/push-service');
const { createNotificationSettingsService } = require('../server/services/notification-settings-service');
const { assertSameOrigin } = require('../server/services/session-cookie-service');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = runtimeConfig();
  if (!config.supabaseUrl || !config.anonKey || !config.serviceRoleKey) {
    return send(res, 503, { ok: false, error: 'Web Push chưa được cấu hình Supabase đầy đủ.' });
  }
  const appUsers = createAppUserRepository({ httpError });
  const auth = createAuthService({ appUserRepository: appUsers, httpError });
  const subscriptions = createPushSubscriptionRepository({ httpError });
  const preferenceService = createNotificationSettingsService({
    preferenceRepository: createNotificationPreferenceRepository({ httpError }),
    ruleConfigRepository: createNotificationRuleConfigRepository({ httpError }),
    httpError
  });
  const service = createPushService({ repository: subscriptions, preferenceService, webPush, httpError });
  try {
    const user = await auth.getAuthenticatedUser(req, config);
    if (req.method === 'GET') return send(res, 200, { ok: true, ...(await service.status(config, user)) });
    assertSameOrigin(req, httpError);
    const action = String(req.body?.action || '').trim();
    if (action === 'subscribe') {
      return send(res, 200, { ok: true, ...(await service.subscribe(config, user, req.body?.subscription, req.headers?.['user-agent'])) });
    }
    if (action === 'unsubscribe') {
      return send(res, 200, { ok: true, ...(await service.unsubscribe(config, user, req.body?.endpoint)) });
    }
    if (action === 'test') {
      return send(res, 200, { ok: true, ...(await service.sendTest(config, user, req.body?.endpoint)) });
    }
    if (action === 'setPreference') {
      return send(res, 200, { ok: true, ...(await service.setPreference(config, user, req.body?.notificationKey, req.body?.enabled)) });
    }
    throw httpError(400, 'Thao tác Web Push không hợp lệ.');
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Lỗi Web Push.' });
  }
};
