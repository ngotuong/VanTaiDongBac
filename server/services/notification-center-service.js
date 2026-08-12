function createNotificationCenterService({ repository, httpError, send }) {
  function handles(action) {
    return action === 'getNotifications';
  }

  async function handle(action, req, res, config) {
    if (!handles(action)) throw httpError(400, 'Hành động thông báo không hợp lệ.');
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    const row = await repository.find(config);
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 100) : [];
    return send(res, 200, {
      ok: true,
      source: 'supabase',
      sourceSheet: 'XL_DoiSoatChuyen',
      count: items.length,
      items,
      syncedAt: payload.syncedAt || row?.synced_at || null,
      lookbackDays: Number(payload.lookbackDays || 45)
    });
  }

  return { handles, handle };
}

module.exports = { createNotificationCenterService };
