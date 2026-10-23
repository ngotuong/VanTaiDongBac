const { withDeadline } = require('../services/request-deadline');
function createNotificationBundleRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  function headers(config) {
    return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: 'application/json' };
  }

  async function read(config, table, query, fallbackMessage) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${table}?${query}`, { headers: headers(config) });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, fallbackMessage);
    return Array.isArray(rows) ? rows : [];
  }

  async function findBundle(config, sheetName, filterKey) {
    const query = new URLSearchParams({
      select: 'payload,synced_at',
      sheet_name: `eq.${sheetName}`,
      filter_key: `eq.${filterKey}`,
      limit: '1'
    });
    const rows = await read(config, 'manage_data_bundles', query, 'Không đọc được bundle thông báo.');
    return rows[0] || null;
  }

  async function findFund(config, workbookYear) {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = String(workbookYear || '');
    const monthKey = `${year}-${String(local.getMonth() + 1).padStart(2, '0')}`;
    const ruleQuery = new URLSearchParams({ select: 'enabled,threshold_value,notification_body,updated_at', rule_key: 'eq.fund-current-balance-below-10m', limit: '1' });
    const monthQuery = new URLSearchParams({ select: 'payload,synced_at,month_key', year: `eq.${year}`, month_key: `eq.${monthKey}`, limit: '1' });
    const fallbackQuery = new URLSearchParams({ select: 'payload,synced_at,month_key', year: `eq.${year}`, month_key: 'eq.', limit: '1' });
    const [rules, monthRows, fallbackRows] = await Promise.all([
      read(config, 'notification_rule_configs', ruleQuery, 'Không đọc được quy tắc cảnh báo Quỹ.'),
      read(config, 'fund_overview_bundles', monthQuery, 'Không đọc được số dư Quỹ.'),
      read(config, 'fund_overview_bundles', fallbackQuery, 'Không đọc được số dư Quỹ.')
    ]);
    return { rule: rules[0] || null, bundle: monthRows[0] || fallbackRows[0] || null };
  }

  async function findDailySummary(config, year) {
    return findBundle(config, `${year}:XL_VanChuyen`, 'daily-summary:latest');
  }

  async function findFundDailySummary(config, dateKey) {
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (!match) return null;
    const query = new URLSearchParams({
      select: 'payload,synced_at,month_key',
      year: `eq.${match[1]}`,
      month_key: `eq.${match[1]}-${match[2]}`,
      limit: '1'
    });
    const rows = await read(config, 'fund_overview_bundles', query, 'Không đọc được tổng hợp Quỹ theo ngày.');
    return rows[0] || null;
  }

  async function find(config, summaryDateKey, workbookYear) {
    const summaryYear = String(summaryDateKey || '').slice(0, 4);
    const syncQuery = new URLSearchParams({ select: 'sync_key,module,status,message,synced_at,updated_at', order: 'updated_at.desc', limit: '200' });
    const jobsQuery = new URLSearchParams({ select: 'id,module,action,status,payload,attempts,max_attempts,last_error,next_run_at,locked_at,claimed_at,created_at,updated_at', status: 'in.(pending,processing,failed)', 'payload->>year': `eq.${workbookYear}`, order: 'updated_at.desc', limit: '100' });
    const [trip, operations, fund, dailySummary, dailyFundSummary, syncStatuses, writeJobs] = await Promise.all([
      findBundle(config, `${workbookYear}:XL_DoiSoatChuyen`, 'notifications:active'),
      findBundle(config, `${workbookYear}:SYSTEM_NOTIFICATIONS`, 'operations:active'),
      findFund(config, workbookYear),
      findDailySummary(config, /^20\d{2}$/.test(summaryYear) ? summaryYear : workbookYear),
      findFundDailySummary(config, summaryDateKey),
      read(config, 'sync_status', syncQuery, 'Không đọc được trạng thái đồng bộ.'),
      read(config, 'write_jobs', jobsQuery, 'Không đọc được trạng thái hàng đợi ghi.')
    ]);
    return { trip, operations, fund, dailySummary, dailyFundSummary, syncStatuses, writeJobs, workbookYear };
  }

  return { find };
}

module.exports = { createNotificationBundleRepository };
