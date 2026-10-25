const { withDeadline } = require('../services/request-deadline');
function createFundBundleRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  async function find(config, table, filters) {
    const query = new URLSearchParams({ select: 'payload,synced_at', limit: '1' });
    Object.entries(filters).forEach(([key, value]) => query.set(key, `eq.${String(value ?? '').trim()}`));
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${table}?${query.toString()}`, {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: 'application/json' }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được cache Thu chi từ Supabase.');
    return rows[0] || null;
  }
  async function upsert(config, table, row, onConflict) {
    const query = new URLSearchParams({ on_conflict: onConflict });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${table}?${query.toString()}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([row])
    });
    if (!response.ok) throw httpError(502, 'Không cập nhật được cache Thu chi trong Supabase.');
    return row;
  }
  async function findPages(config, table, year, prefix) {
    const query = new URLSearchParams({
      select: 'filter_key,payload,synced_at',
      year: `eq.${String(year || '').trim()}`,
      filter_key: `like.${String(prefix || '').trim()}*`,
      order: 'filter_key.asc',
      limit: '1000'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${table}?${query.toString()}`, {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: 'application/json' }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows)) throw httpError(502, 'Không đọc được trang cache Thu chi từ Supabase.');
    return rows;
  }
  return { find, findPages, upsert };
}
module.exports = { createFundBundleRepository };
