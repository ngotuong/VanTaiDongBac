const webPush = require('web-push');
const { createAppUserRepository } = require('../server/repositories/app-user-repository');
const { createFundBalanceRepository } = require('../server/repositories/fund-balance-repository');
const { createNotificationRuleRepository } = require('../server/repositories/notification-rule-repository');
const { createPushSubscriptionRepository } = require('../server/repositories/push-subscription-repository');
const { createNotificationPreferenceRepository } = require('../server/repositories/notification-preference-repository');
const { createNotificationRuleConfigRepository } = require('../server/repositories/notification-rule-config-repository');
const { runtimeConfig } = require('../server/runtime-config');
const { createAuthService } = require('../server/services/auth-service');
const { createAuthorizationPolicy } = require('../server/services/authorization-policy');
const { createFundLowBalanceAlertService } = require('../server/services/fund-low-balance-alert-service');
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
  const appUsers = createAppUserRepository({ httpError });
  const subscriptions = createPushSubscriptionRepository({ httpError });
  const ruleConfigs = createNotificationRuleConfigRepository({ httpError });
  const preferences = createNotificationPreferenceRepository({ httpError });
  const settings = createNotificationSettingsService({ preferenceRepository: preferences, ruleConfigRepository: ruleConfigs, httpError });
  const service = createFundLowBalanceAlertService({
    balanceRepository: createFundBalanceRepository({ httpError }),
    ruleRepository: createNotificationRuleRepository({ httpError }),
    ruleConfigRepository: ruleConfigs,
    preferenceRepository: preferences,
    appUserRepository: appUsers,
    subscriptionRepository: subscriptions,
    webPush,
    httpError
  });
  try {
    if (req.method === 'GET') {
      if (!config.cronSecret || req.headers.authorization !== `Bearer ${config.cronSecret}`) throw httpError(401, 'Cron không được xác thực.');
      return send(res, 200, { ok: true, ...(await service.run(config)) });
    }
    const auth = createAuthService({ appUserRepository: appUsers, httpError });
    const { assertAdmin } = createAuthorizationPolicy({ httpError });
    const user = await auth.getAuthenticatedUser(req, config);
    assertAdmin(user);
    assertSameOrigin(req, httpError);
    const action = String(req.body?.action || '');
    if (action === 'getSettings') return send(res, 200, { ok: true, rule: await settings.getRule(config) });
    if (action === 'updateSettings') return send(res, 200, { ok: true, rule: await settings.updateRule(config, user, req.body?.rule) });
    if (action === 'dryRun') {
      const override = req.body?.rule ? { rule_key: 'fund-current-balance-below-10m', ...settings.normalizeRule(req.body.rule), schedule_time: '08:00' } : undefined;
      return send(res, 200, { ok: true, ...(await service.dryRun(config, override)) });
    }
    throw httpError(400, 'Thao tác cấu hình cảnh báo Quỹ không hợp lệ.');
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Lỗi cảnh báo số dư Quỹ.' });
  }
};
