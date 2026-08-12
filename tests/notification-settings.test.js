const assert = require('node:assert/strict');
const test = require('node:test');
const { createNotificationSettingsService } = require('../server/services/notification-settings-service');

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

test('eligible users default to the fund alert and can persist their own preference', async () => {
  const writes = [];
  const service = createNotificationSettingsService({
    preferenceRepository: {
      async listByUser() { return []; },
      async upsert(_config, userId, key, enabled) { writes.push({ userId, key, enabled }); }
    },
    ruleConfigRepository: {}, httpError, now: () => new Date('2026-07-31T00:00:00Z')
  });
  const user = { id: 'shareholder-1', role: 'shareholder' };
  assert.equal((await service.preferences({}, user)).types[0].enabled, true);
  assert.deepEqual(await service.setPreference({}, user, 'fund-low-balance', false), { notificationKey: 'fund-low-balance', enabled: false });
  assert.deepEqual(writes[0], { userId: 'shareholder-1', key: 'fund-low-balance', enabled: false });
});

test('operators receive operations channels but cannot opt into the fund alert', async () => {
  const service = createNotificationSettingsService({ preferenceRepository: { async listByUser() { return []; } }, ruleConfigRepository: {}, httpError });
  const keys = (await service.preferences({}, { id: 'operator-1', role: 'operator' })).types.map((type) => type.key);
  assert.deepEqual(keys, ['trip-reconciliation', 'operations-integrity', 'daily-digest']);
  await assert.rejects(() => service.setPreference({}, { id: 'operator-1', role: 'operator' }, 'fund-low-balance', true), /không được sử dụng/);
});

test('admin rule validation bounds editable fields and keeps deployment schedule outside the patch', () => {
  const service = createNotificationSettingsService({ preferenceRepository: {}, ruleConfigRepository: {}, httpError });
  const normalized = service.normalizeRule({ enabled: true, thresholdValue: 10_000_000, cooldownHours: 24, recipientRoles: ['admin', 'shareholder'], notificationBody: 'Số dư quỹ đã xuống dưới ngưỡng 10 triệu' });
  assert.equal(normalized.cooldown_minutes, 1440);
  assert.equal('schedule_time' in normalized, false);
  assert.throws(() => service.normalizeRule({ ...normalized, thresholdValue: 0, cooldownHours: 24, recipientRoles: ['admin'], notificationBody: 'x' }), /Ngưỡng/);
  assert.throws(() => service.normalizeRule({ enabled: true, thresholdValue: 10_000_000, cooldownHours: 24, recipientRoles: ['operator'], notificationBody: 'x' }), /Nhóm nhận/);
});
