function createPublicationInvalidationRepository({ fetchImpl = fetch, httpError }) {
  async function findNext(config, input) {
    const year = String(input?.year || '').trim();
    const afterId = Math.max(0, Number(input?.afterId) || 0);
    const audience = String(input?.audience || config.publicationInvalidationAudience || 'preview').trim().toLowerCase();
    if (!/^20\d{2}$/.test(year)) throw httpError(400, 'Năm invalidation không hợp lệ.');
    if (!['preview', 'production'].includes(audience)) throw httpError(503, 'Audience publication chưa được cấu hình hợp lệ.');
    const query = new URLSearchParams({
      select: 'id,audience,workbook_year,report_month,generation_id,source_data_version,cache_version,published_at',
      audience: `eq.${audience}`,
      workbook_year: `eq.${year}`,
      id: `gt.${afterId}`,
      order: 'id.asc',
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/publication_invalidations?${query.toString()}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000)
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được metadata publication mới.');
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  return { findNext };
}

module.exports = { createPublicationInvalidationRepository };
