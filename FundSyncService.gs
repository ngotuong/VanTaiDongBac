/** Supabase sync implementation for Fund overview, transaction, loan, and catalog caches. */
var FundSyncService = (function () {
  var TABLE_FUND_OVERVIEW_BUNDLES = 'fund_overview_bundles';
  var TABLE_FUND_TRANSACTION_BUNDLES = 'fund_transaction_bundles';
  var TABLE_FUND_LOAN_BUNDLES = 'fund_loan_bundles';
  var TABLE_CATALOG_BUNDLES = 'catalog_bundles';
  var DEFAULT_FUND_YEAR = '2026';
  var DEFAULT_FUND_TRANSACTION_FILTER_KEY = 'recent_500';
  var FUND_CATALOG_GROUPS = ['incomeCategories', 'expenseCategories', 'actors', 'partners', 'loanPartners'];

  function normalizeFundMonthKey(month, clean) {
    var text = clean(month);
    if (!text || text === 'latest' || text === 'all' || text === 'Tất cả') return '';
    var iso = text.match(/^(\d{4})-(\d{1,2})/);
    if (iso) return iso[1] + '-' + ('0' + Number(iso[2])).slice(-2);
    var vn = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (vn) return vn[2] + '-' + ('0' + Number(vn[1])).slice(-2);
    return text;
  }

  function buildFundTransactionFilterKey(filter, context) {
    var month = normalizeFundMonthKey(filter.month, context.clean);
    if (month) return 'month:' + month;
    var startDate = context.clean(filter.startDate);
    var endDate = context.clean(filter.endDate);
    var search = context.clean(filter.search);
    var limit = String(filter.limit || 500);
    if (!startDate && !endDate && !search && limit === '500') return DEFAULT_FUND_TRANSACTION_FILTER_KEY;
    return [startDate || 'all', endDate || 'all', search ? context.encodeSearch(search) : 'all', limit].join('|');
  }

  function buildFundFormOptionsKey(year, clean) {
    return 'fund_form_options:' + (clean(year) || DEFAULT_FUND_YEAR);
  }

  function buildFundCatalogKey(year, group, clean) {
    return 'fund_catalog:' + (clean(year) || DEFAULT_FUND_YEAR) + ':' + (clean(group) || 'all');
  }

  function syncFundOverview(year, month, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var monthKey = normalizeFundMonthKey(month, context.clean);
    var payload = context.getFundOverview(safeYear, { month: monthKey });
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_FUND_OVERVIEW_BUNDLES, [{ year: safeYear, month_key: monthKey, payload: payload, synced_at: syncedAt }], 'year,month_key');
    context.writeSyncStatus('fund_overview:' + safeYear + ':' + (monthKey || 'latest'), 'fund', 'ok', 'Fund overview cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_OVERVIEW_BUNDLES, year: safeYear, monthKey: monthKey, syncedAt: syncedAt };
  }

  function syncFundTransactions(year, options, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var filter = options || {};
    var normalized = {
      month: normalizeFundMonthKey(filter.month, context.clean),
      startDate: context.clean(filter.startDate),
      endDate: context.clean(filter.endDate),
      search: context.clean(filter.search || filter.query),
      limit: Math.max(1, Math.min(parseInt(filter.limit, 10) || 500, 1000))
    };
    var filterKey = buildFundTransactionFilterKey(normalized, context);
    var payload = context.getFundTransactions(safeYear, normalized);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_FUND_TRANSACTION_BUNDLES, [{ year: safeYear, filter_key: filterKey, payload: payload, synced_at: syncedAt }], 'year,filter_key');
    context.writeSyncStatus('fund_transactions:' + safeYear + ':' + filterKey, 'fund', 'ok', 'Fund transaction cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_TRANSACTION_BUNDLES, year: safeYear, filterKey: filterKey, syncedAt: syncedAt };
  }

  function syncFundTransactionMonth(year, month, context) {
    var monthKey = normalizeFundMonthKey(month, context.clean);
    if (!monthKey) throw new Error('Thiếu tháng giao dịch quỹ cần sync.');
    return syncFundTransactions(year || DEFAULT_FUND_YEAR, { month: monthKey, limit: 1000 }, context);
  }

  function syncFundLoanOverview(year, month, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var monthKey = normalizeFundMonthKey(month, context.clean);
    var payload = context.getFundLoanOverview(safeYear, { month: monthKey });
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_FUND_LOAN_BUNDLES, [{ year: safeYear, month_key: monthKey, payload: payload, synced_at: syncedAt }], 'year,month_key');
    context.writeSyncStatus('fund_loans:' + safeYear + ':' + (monthKey || 'latest'), 'fund', 'ok', 'Fund loan cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_LOAN_BUNDLES, year: safeYear, monthKey: monthKey, syncedAt: syncedAt };
  }

  function syncFundFormOptionsBundle(year, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var catalogKey = buildFundFormOptionsKey(safeYear, context.clean);
    var payload = context.getFundFormOptions(safeYear);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_CATALOG_BUNDLES, [{ catalog_key: catalogKey, payload: payload, synced_at: syncedAt }], 'catalog_key');
    context.writeSyncStatus('fund_form_options:' + safeYear, 'fund', 'ok', 'Fund form options cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncFundCatalogBundle(year, group, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var safeGroup = context.clean(group) || 'all';
    var catalogKey = buildFundCatalogKey(safeYear, safeGroup, context.clean);
    var payload = context.getFundCatalog(safeYear, safeGroup);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_CATALOG_BUNDLES, [{ catalog_key: catalogKey, payload: payload, synced_at: syncedAt }], 'catalog_key');
    context.writeSyncStatus('fund_catalog:' + safeYear + ':' + safeGroup, 'fund', 'ok', 'Fund catalog cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncAllFundCatalogBundles(year, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var results = [];
    var errors = [];
    context.runSyncStep(results, errors, 'fundFormOptions:' + safeYear, function () { return syncFundFormOptionsBundle(safeYear, context); });
    FUND_CATALOG_GROUPS.forEach(function (group) {
      context.runSyncStep(results, errors, 'fundCatalog:' + group, function () { return syncFundCatalogBundle(safeYear, group, context); });
    });
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, results: results, errors: errors };
  }

  function syncAllFundBundles(year, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var results = [];
    var errors = [];
    var overviewSeed = null;
    context.runSyncStep(results, errors, 'fundOverviewLatest', function () {
      overviewSeed = syncFundOverview(safeYear, '', context);
      return overviewSeed;
    });
    var months = context.getFundMonthsFromOverview(safeYear);
    months.forEach(function (monthKey) {
      context.runSyncStep(results, errors, 'fundOverview:' + monthKey, function () { return syncFundOverview(safeYear, monthKey, context); });
      context.runSyncStep(results, errors, 'fundTransactions:' + monthKey, function () { return syncFundTransactionMonth(safeYear, monthKey, context); });
      context.runSyncStep(results, errors, 'fundLoans:' + monthKey, function () { return syncFundLoanOverview(safeYear, monthKey, context); });
    });
    context.runSyncStep(results, errors, 'fundTransactions', function () { return syncFundTransactions(safeYear, { limit: 500 }, context); });
    context.runSyncStep(results, errors, 'fundLoansLatest', function () { return syncFundLoanOverview(safeYear, '', context); });
    context.runSyncStep(results, errors, 'fundCatalogs', function () { return syncAllFundCatalogBundles(safeYear, context); });
    return { ok: errors.length === 0, year: safeYear, synced: results.length, failed: errors.length, months: months, seed: overviewSeed, errors: errors };
  }

  function syncFundAfterWrite(year, options, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var monthKeys = context.getFundWriteMonthKeys(safeYear, options || {});
    var results = [];
    var errors = [];
    if (options && options.fundCatalog) context.runSyncStep(results, errors, 'fundCatalogs', function () { return syncAllFundCatalogBundles(safeYear, context); });
    context.runSyncStep(results, errors, 'fundOverview', function () { return syncFundOverview(safeYear, '', context); });
    context.runSyncStep(results, errors, 'fundTransactions', function () { return syncFundTransactions(safeYear, { limit: 500 }, context); });
    context.runSyncStep(results, errors, 'fundLoans', function () { return syncFundLoanOverview(safeYear, '', context); });
    monthKeys.forEach(function (monthKey) {
      context.runSyncStep(results, errors, 'fundOverview:' + monthKey, function () { return syncFundOverview(safeYear, monthKey, context); });
      context.runSyncStep(results, errors, 'fundTransactions:' + monthKey, function () { return syncFundTransactionMonth(safeYear, monthKey, context); });
      context.runSyncStep(results, errors, 'fundLoans:' + monthKey, function () { return syncFundLoanOverview(safeYear, monthKey, context); });
    });
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, months: monthKeys, errors: errors };
  }

  function syncFundTransactionsAfterWrite(year, transactions, context) {
    var safeYear = context.clean(year) || DEFAULT_FUND_YEAR;
    var monthKeys = context.getFundWriteMonthKeys(safeYear, { transactions: transactions || [] });
    var results = [];
    var errors = [];
    context.runSyncStep(results, errors, 'fundOverview', function () { return syncFundOverview(safeYear, '', context); });
    context.runSyncStep(results, errors, 'fundTransactions', function () { return syncFundTransactions(safeYear, { limit: 500 }, context); });
    monthKeys.forEach(function (monthKey) {
      context.runSyncStep(results, errors, 'fundOverview:' + monthKey, function () { return syncFundOverview(safeYear, monthKey, context); });
      context.runSyncStep(results, errors, 'fundTransactions:' + monthKey, function () { return syncFundTransactionMonth(safeYear, monthKey, context); });
    });
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, months: monthKeys, errors: errors };
  }

  return {
    syncFundOverview: syncFundOverview, syncFundTransactions: syncFundTransactions,
    syncFundTransactionMonth: syncFundTransactionMonth, syncFundLoanOverview: syncFundLoanOverview,
    syncFundFormOptionsBundle: syncFundFormOptionsBundle, syncFundCatalogBundle: syncFundCatalogBundle,
    syncAllFundCatalogBundles: syncAllFundCatalogBundles, syncAllFundBundles: syncAllFundBundles,
    syncFundAfterWrite: syncFundAfterWrite, syncFundTransactionsAfterWrite: syncFundTransactionsAfterWrite,
    normalizeFundMonthKey: normalizeFundMonthKey, buildFundTransactionFilterKey: buildFundTransactionFilterKey,
    buildFundFormOptionsKey: buildFundFormOptionsKey, buildFundCatalogKey: buildFundCatalogKey
  };
})();
