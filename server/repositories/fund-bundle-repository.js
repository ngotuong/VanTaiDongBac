function createFundBundleRepository({ fetchImpl = fetch, httpError }) {
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
  return { find, upsert };
}
module.exports = { createFundBundleRepository };
