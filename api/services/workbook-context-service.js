const MODULES = new Set(['transport', 'cashflow']);
const YEAR_PATTERN = /^20\d{2}$/;

function createWorkbookContextService({ env = process.env, httpError }) {
  function configuration() {
    let contexts;
    try {
      contexts = JSON.parse(String(env.WORKBOOK_CONTEXTS_JSON || '{}'));
    } catch (_error) {
      throw httpError(503, 'WORKBOOK_CONTEXTS_JSON không phải JSON hợp lệ.');
    }
    return { contexts, defaultYear: String(env.DEFAULT_WORKBOOK_YEAR || '').trim() };
  }

  function resolve(input = {}) {
    const { contexts, defaultYear } = configuration();
    const module = String(input.module || 'transport').trim().toLowerCase();
    const year = String(input.year || defaultYear).trim();
    if (!MODULES.has(module)) throw httpError(400, 'Module workbook không hợp lệ.');
    if (!YEAR_PATTERN.test(year)) throw httpError(400, 'Năm workbook không hợp lệ hoặc chưa được chọn.');
    const spreadsheetId = String(contexts?.[year]?.[module] || '').trim();
    if (!spreadsheetId) throw httpError(404, `Chưa cấu hình workbook ${module} cho năm ${year}.`);
    return { module, year, spreadsheetId };
  }

  function publicContext(input = {}) {
    const context = resolve(input);
    return { module: context.module, year: context.year };
  }

  return { resolve, publicContext };
}

module.exports = { createWorkbookContextService };
