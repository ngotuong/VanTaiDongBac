const CATALOG_ACTIONS = new Set(['getCatalogs']);
const CATALOG_FORM_TYPES = new Set(['', 'vanChuyen', 'taiXe', 'dau', 'chamCong', 'phat', 'nghiVanHanh']);

function createCatalogService({ catalogBundleRepository, appsScriptClient, workbookContextService, httpError, send }) {
  function handles(action) { return CATALOG_ACTIONS.has(action); }

  async function forward(action, req, config, user, workbook) {
    const params = { ...req.query, year: workbook.year, spreadsheetId: workbook.spreadsheetId };
    delete params.action;
    return appsScriptClient.forward({
      url: config.appsScriptUrl,
      action,
      method: req.method,
      params,
      body: {},
      proxySecret: config.proxySecret,
      requestUser: user
    });
  }

  async function handle(action, req, res, config, user) {
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    const formType = String(req.query?.formType || '').trim();
    if (!CATALOG_FORM_TYPES.has(formType)) throw httpError(400, 'Loại biểu mẫu không hợp lệ.');
    const forceRefresh = String(req.query?.forceRefresh || '') === 'true';
    const resolveWorkbook = workbookContextService.resolveAsync || workbookContextService.resolve;
    const workbook = await resolveWorkbook.call(workbookContextService, { module: 'transport', year: req.query?.year });

    if (!forceRefresh) {
      try {
        const row = await catalogBundleRepository.find(config, `transport:${workbook.year}:catalogs:${formType || 'all'}`);
        if (row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) {
          return send(res, 200, {
            ...row.payload,
            apiCached: true,
            supabaseCached: true,
            supabaseSyncedAt: row.synced_at
          });
        }
      } catch (error) {
        throw httpError(503, error?.message || 'Không đọc được danh sách nhập liệu từ Supabase.');
      }
      throw httpError(503, 'Cache danh sách nhập liệu trên Supabase chưa sẵn sàng.');
    }

    const result = await forward(action, req, config, user, workbook);
    return send(res, result.status, result.body);
  }

  return { handles, handle };
}

module.exports = { createCatalogService, CATALOG_ACTIONS, CATALOG_FORM_TYPES };
