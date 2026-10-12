const { withDeadline } = require('../services/request-deadline');
function createFundBalanceRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  function headers(config) {
    return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: 'application/json' };
  }

  async function findBundle(config, year, monthKey) {
    const query = new URLSearchParams({
      select: 'payload,synced_at,month_key',
      year: `eq.${year}`,
      month_key: `eq.${monthKey}`,
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/fund_overview_bundles?${query}`, { headers: headers(config) });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được số dư Quỹ từ Supabase.');
    return rows[0] || null;
  }

  async function currentBalance(config, year, monthKey) {
    const row = await findBundle(config, year, monthKey) || await findBundle(config, year, '');
    const metric = row?.payload?.metrics?.find((item) => item?.key === 'currentBalance');
    const value = Number(metric?.value);
    if (!row || !Number.isFinite(value)) throw httpError(503, 'Cache chưa có giá trị Số dư hiện tại của module Quỹ.');
    return { value, syncedAt: row.synced_at || '', monthKey: row.month_key || '' };
  }

  return { currentBalance };
}

module.exports = { createFundBalanceRepository };
