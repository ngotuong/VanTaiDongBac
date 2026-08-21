const FUND_NOTIFICATION_KEY = 'fund-low-balance';
const FUND_RULE_KEY = 'fund-current-balance-below-10m';
const FUND_ROLES = new Set(['admin', 'shareholder']);
const NOTIFICATION_TYPES = Object.freeze([
  { key: 'trip-reconciliation', label: 'Đối soát chuyến & thưởng', description: 'Chênh lệch, thiếu chuyến và thưởng nóng mới.', roles: ['admin', 'operator'] },
  { key: FUND_NOTIFICATION_KEY, label: 'Cảnh báo số dư Quỹ', description: 'Số dư hiện tại xuống dưới ngưỡng đã đặt.', roles: ['admin', 'shareholder'] },
  { key: 'operations-integrity', label: 'Kiểm tra vận hành', description: 'Chấm công hoặc phân công lái được workbook báo bất thường.', roles: ['admin', 'operator'] },
  { key: 'system-health', label: 'Lỗi đồng bộ & hàng đợi', description: 'Cache cũ, đồng bộ lỗi hoặc thao tác ghi bị treo.', roles: ['admin'] },
  { key: 'daily-digest', label: 'Tổng hợp ngày hôm trước', description: 'Gửi lúc 12:00 trưa với số chuyến, doanh thu và Thu/Chi Quỹ của ngày hôm trước.', roles: ['admin', 'operator', 'shareholder'] }
]);

function createNotificationSettingsService({ preferenceRepository, ruleConfigRepository, httpError, now = () => new Date() }) {
  function allowedTypes(user) { return NOTIFICATION_TYPES.filter((type) => type.roles.includes(user.role)); }
  async function preferences(config, user) {
    const rows = await preferenceRepository.listByUser(config, user.id);
    const stored = new Map(rows.map((row) => [row.notification_key, Boolean(row.enabled)]));
    return { types: allowedTypes(user).map(({ key, label, description }) => ({ key, label, description, enabled: stored.get(key) ?? true })) };
  }
  async function setPreference(config, user, key, enabled) {
    if (!allowedTypes(user).some((type) => type.key === key)) throw httpError(403, 'Tài khoản không được sử dụng loại thông báo này.');
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
module.exports = { createNotificationSettingsService, FUND_NOTIFICATION_KEY, FUND_RULE_KEY, NOTIFICATION_TYPES };
