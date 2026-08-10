const FUND_NOTIFICATION_KEY = 'fund-low-balance';
const FUND_RULE_KEY = 'fund-current-balance-below-10m';
const FUND_ROLES = new Set(['admin', 'shareholder']);

function createNotificationSettingsService({ preferenceRepository, ruleConfigRepository, httpError, now = () => new Date() }) {
  function canUseFund(user) { return FUND_ROLES.has(user.role); }
  async function preferences(config, user) {
    const rows = await preferenceRepository.listByUser(config, user.id);
    const stored = new Map(rows.map((row) => [row.notification_key, Boolean(row.enabled)]));
    return { types: canUseFund(user) ? [{ key: FUND_NOTIFICATION_KEY, label: 'Cảnh báo số dư Quỹ', description: 'Nhận cảnh báo khi tổng Số dư hiện tại xuống dưới ngưỡng.', enabled: stored.get(FUND_NOTIFICATION_KEY) ?? true }] : [] };
  }
  async function setPreference(config, user, key, enabled) {
    if (key !== FUND_NOTIFICATION_KEY || !canUseFund(user)) throw httpError(403, 'Tài khoản không được sử dụng loại thông báo này.');
    if (typeof enabled !== 'boolean') throw httpError(400, 'Trạng thái lựa chọn thông báo không hợp lệ.');
    await preferenceRepository.upsert(config, user.id, key, enabled, now().toISOString());
    return { notificationKey: key, enabled };
  }
  function normalizeRule(input) {
    const thresholdValue = Number(input?.thresholdValue);
    const cooldownHours = Number(input?.cooldownHours);
    const recipientRoles = [...new Set(Array.isArray(input?.recipientRoles) ? input.recipientRoles.map(String) : [])];
    const notificationBody = String(input?.notificationBody || '').trim();
    if (!Number.isInteger(thresholdValue) || thresholdValue < 1_000_000 || thresholdValue > 1_000_000_000) throw httpError(400, 'Ngưỡng cảnh báo phải là số nguyên từ 1 triệu đến 1 tỷ đồng.');
    if (!Number.isInteger(cooldownHours) || cooldownHours < 1 || cooldownHours > 168) throw httpError(400, 'Thời gian chống lặp phải từ 1 đến 168 giờ.');
    if (!recipientRoles.length || recipientRoles.some((role) => !FUND_ROLES.has(role))) throw httpError(400, 'Nhóm nhận chỉ gồm Quản trị viên hoặc Cổ đông.');
    if (!notificationBody || notificationBody.length > 160) throw httpError(400, 'Nội dung cảnh báo phải từ 1 đến 160 ký tự.');
    if (typeof input?.enabled !== 'boolean') throw httpError(400, 'Trạng thái quy tắc không hợp lệ.');
    return { enabled: input.enabled, threshold_value: thresholdValue, cooldown_minutes: cooldownHours * 60, recipient_roles: recipientRoles, notification_body: notificationBody };
  }
  function publicRule(row) {
    return { ruleKey: row.rule_key, enabled: Boolean(row.enabled), thresholdValue: Number(row.threshold_value), cooldownHours: Number(row.cooldown_minutes) / 60, recipientRoles: row.recipient_roles, notificationBody: row.notification_body, scheduleTime: String(row.schedule_time || '08:00').slice(0, 5), scheduleManagedByDeployment: true, updatedAt: row.updated_at || null };
  }
  async function getRule(config) {
    const row = await ruleConfigRepository.find(config, FUND_RULE_KEY);
    if (!row) throw httpError(503, 'Chưa khởi tạo cấu hình cảnh báo Quỹ.');
    return publicRule(row);
  }
  async function updateRule(config, user, input) {
    const row = await ruleConfigRepository.update(config, FUND_RULE_KEY, normalizeRule(input), user.id, now().toISOString());
    return publicRule(row);
  }
  return { preferences, setPreference, normalizeRule, getRule, updateRule, publicRule };
}
module.exports = { createNotificationSettingsService, FUND_NOTIFICATION_KEY, FUND_RULE_KEY };
