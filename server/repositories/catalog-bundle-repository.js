function createCatalogBundleRepository({ fetchImpl = fetch, httpError }) {
  async function find(config, catalogKey) {
    const query = new URLSearchParams({
      select: 'catalog_key,payload,synced_at',
      catalog_key: `eq.${String(catalogKey || '').trim()}`,
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/catalog_bundles?${query.toString()}`, {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: 'application/json' }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được Danh mục từ API cache.');
    return rows[0] || null;
  }
  return { find };
}

module.exports = { createCatalogBundleRepository };
