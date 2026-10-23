const MODULES = new Set(['transport', 'cashflow']);
const YEAR_PATTERN = /^20\d{2}$/;

function createWorkbookContextService({ env = process.env, repository = null, config = null, httpError }) {
  function environmentConfiguration_(strict) {
    let contexts;
    try {
      contexts = JSON.parse(String(env.WORKBOOK_CONTEXTS_JSON || '{}'));
    } catch (_error) {
      throw httpError(503, 'WORKBOOK_CONTEXTS_JSON không phải JSON hợp lệ.');
    }
    const defaultYear = String(env.DEFAULT_WORKBOOK_YEAR || '').trim();
    const availableYears = Object.keys(contexts || {}).filter((year) => YEAR_PATTERN.test(year)).sort().reverse();
    if (strict && (!YEAR_PATTERN.test(defaultYear) || !availableYears.includes(defaultYear))) {
      throw httpError(503, 'DEFAULT_WORKBOOK_YEAR chưa khớp WORKBOOK_CONTEXTS_JSON.');
    }
    return { contexts, defaultYear, availableYears };
  }

  function configuration() {
    return environmentConfiguration_(true);
  }

  async function configurationAsync(options = {}) {
    const fallback = environmentConfiguration_(false);
    if (!repository || !config?.supabaseUrl || !config?.serviceRoleKey) {
      if (!YEAR_PATTERN.test(fallback.defaultYear) || !fallback.availableYears.includes(fallback.defaultYear)) {
        throw httpError(503, 'Chưa cấu hình registry workbook phía server.');
      }
      return fallback;
    }
    const rows = await repository.list(config, options);
    if (!rows.length) {
      if (!YEAR_PATTERN.test(fallback.defaultYear) || !fallback.availableYears.includes(fallback.defaultYear)) {
        throw httpError(503, 'Registry workbook chưa có dữ liệu và cấu hình fallback không hợp lệ.');
      }
      return fallback;
    }
    const contexts = { ...fallback.contexts };
    let defaultYear = fallback.defaultYear;
    for (const row of rows) {
      const year = String(row?.year || '').trim();
      const status = String(row?.lifecycle_status || '').trim();
      if (!YEAR_PATTERN.test(year)) continue;
      if (!['ready', 'active', 'archived'].includes(status)) {
        delete contexts[year];
        continue;
      }
      const transport = String(row?.transport_spreadsheet_id || '').trim();
      const cashflow = String(row?.cashflow_spreadsheet_id || '').trim();
      if (!transport || !cashflow || transport === cashflow) continue;
      contexts[year] = { transport, cashflow };
      if (status === 'active') defaultYear = year;
    }
    const availableYears = Object.keys(contexts).filter((year) => YEAR_PATTERN.test(year) && contexts[year]?.transport && contexts[year]?.cashflow).sort().reverse();
    if (!YEAR_PATTERN.test(defaultYear) || !availableYears.includes(defaultYear)) {
      throw httpError(503, 'Registry workbook chưa có một năm hoạt động hợp lệ.');
    }
    return { contexts, defaultYear, availableYears };
  }

  function resolvedFrom_(input, state) {
    const module = String(input.module || 'transport').trim().toLowerCase();
    if (!MODULES.has(module)) throw httpError(400, 'Module workbook không hợp lệ.');
    const requestedYear = String(input.year || '').trim();
    if (requestedYear && !YEAR_PATTERN.test(requestedYear)) throw httpError(400, 'Năm workbook không hợp lệ hoặc chưa được chọn.');
    const { contexts, defaultYear, availableYears } = state;
    const year = requestedYear || defaultYear;
    if (!YEAR_PATTERN.test(year)) throw httpError(400, 'Năm workbook không hợp lệ hoặc chưa được chọn.');
    const spreadsheetId = String(contexts?.[year]?.[module] || '').trim();
    if (!spreadsheetId) throw httpError(404, `Chưa cấu hình workbook ${module} cho năm ${year}.`);
    return { module, year, spreadsheetId, activeYear: defaultYear, availableYears, readOnly: year !== defaultYear };
  }

  function resolve(input = {}) {
    return resolvedFrom_(input, configuration());
  }

  async function resolveAsync(input = {}, options = {}) {
    return resolvedFrom_(input, await configurationAsync(options));
  }

  function publicContext(input = {}) {
    const context = resolve(input);
    return {
      module: context.module,
      year: context.year,
      activeYear: context.activeYear,
      availableYears: context.availableYears,
      readOnly: context.readOnly
    };
  }

  function assertWritable(input = {}) {
    const context = resolve(input);
    if (context.readOnly) throw httpError(409, `Năm ${context.year} đã khóa chỉ đọc. Hãy chuyển sang năm ${context.activeYear} để nhập liệu.`);
    return context;
  }

  async function publicContextAsync(input = {}, options = {}) {
    const context = await resolveAsync(input, options);
    return {
      module: context.module,
      year: context.year,
      activeYear: context.activeYear,
      availableYears: context.availableYears,
      readOnly: context.readOnly
    };
  }

  async function assertWritableAsync(input = {}, options = {}) {
    const context = await resolveAsync(input, options);
    if (context.readOnly) throw httpError(409, `Năm ${context.year} đã khóa chỉ đọc. Hãy chuyển sang năm ${context.activeYear} để nhập liệu.`);
    return context;
  }

  return {
    resolve, resolveAsync, publicContext, publicContextAsync,
    assertWritable, assertWritableAsync, configuration, configurationAsync
  };
}

module.exports = { createWorkbookContextService };
