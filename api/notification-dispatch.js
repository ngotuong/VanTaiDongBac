const webPush = require('web-push');
const { createAppUserRepository } = require('../server/repositories/app-user-repository');
const { createNotificationBundleRepository } = require('../server/repositories/notification-bundle-repository');
const { createNotificationDeliveryRepository } = require('../server/repositories/notification-delivery-repository');
const { createNotificationPreferenceRepository } = require('../server/repositories/notification-preference-repository');
const { createPushSubscriptionRepository } = require('../server/repositories/push-subscription-repository');
const { runtimeConfig } = require('../server/runtime-config');
const { createAuthService } = require('../server/services/auth-service');
const { createAuthorizationPolicy } = require('../server/services/authorization-policy');
const { createNotificationCenterService } = require('../server/services/notification-center-service');
const { createNotificationDispatchService } = require('../server/services/notification-dispatch-service');
const { createFundLowBalanceAlertService } = require('../server/services/fund-low-balance-alert-service');
const { createFundBalanceRepository } = require('../server/repositories/fund-balance-repository');
const { createNotificationRuleRepository } = require('../server/repositories/notification-rule-repository');
const { createNotificationRuleConfigRepository } = require('../server/repositories/notification-rule-config-repository');
const { createWorkbookContextRepository } = require('../server/repositories/workbook-context-repository');
const { assertSameOrigin } = require('../server/services/session-cookie-service');
const { createWorkbookContextService } = require('../server/services/workbook-context-service');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = runtimeConfig();
  const appUsers = createAppUserRepository({ httpError });
  const workbookContextService = createWorkbookContextService({
    httpError,
    repository: createWorkbookContextRepository({ httpError }),
    config
  });
  const center = createNotificationCenterService({
    repository: createNotificationBundleRepository({ httpError }),
    workbookContextService,
    httpError,
    send
  });
  const service = createNotificationDispatchService({
    centerService: center,
    fundAlertService: createFundLowBalanceAlertService({
      balanceRepository: createFundBalanceRepository({ httpError }),
      ruleRepository: createNotificationRuleRepository({ httpError }),
      ruleConfigRepository: createNotificationRuleConfigRepository({ httpError }),
      preferenceRepository: createNotificationPreferenceRepository({ httpError }),
      appUserRepository: appUsers,
      subscriptionRepository: createPushSubscriptionRepository({ httpError }),
      workbookContextService,
      webPush, httpError
    }),
    deliveryRepository: createNotificationDeliveryRepository({ httpError }),
    preferenceRepository: createNotificationPreferenceRepository({ httpError }),
    appUserRepository: appUsers,
    subscriptionRepository: createPushSubscriptionRepository({ httpError }),
    webPush,
    httpError
  });
  try {
    const action = String(req.body?.action || '').trim();
    const scheduled = Boolean(config.cronSecret) && req.headers.authorization === `Bearer ${config.cronSecret}`;
    if (scheduled) {
      if (action !== 'scheduled') throw httpError(400, 'Thao tác lịch thông báo không hợp lệ.');
      return send(res, 200, { ok: true, ...(await service.run(config)) });
    }
    const auth = createAuthService({ appUserRepository: appUsers, httpError });
    const { assertAdmin } = createAuthorizationPolicy({ httpError });
    const user = await auth.getAuthenticatedUser(req, config);
    assertAdmin(user);
    assertSameOrigin(req, httpError);
    if (action !== 'dryRun') throw httpError(400, 'Chỉ cho phép kiểm tra bản nháp từ giao diện quản trị.');
    return send(res, 200, { ok: true, ...(await service.run(config, { dryRun: true })) });
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Lỗi điều phối thông báo.' });
  }
};
