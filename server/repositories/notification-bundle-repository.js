function createNotificationBundleRepository({ fetchImpl = fetch, httpError }) {
  async function find(config) {
    const query = new URLSearchParams({
      select: 'payload,synced_at',
      sheet_name: 'eq.XL_DoiSoatChuyen',
      filter_key: 'eq.notifications:active',
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/manage_data_bundles?${query}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được trung tâm thông báo.');
    return rows[0] || null;
  }

  return { find };
}

module.exports = { createNotificationBundleRepository };
