/** Supabase sync implementation for Fund overview, transaction, loan, and catalog caches. */
var FundSyncService = (function () {
  var TABLE_FUND_OVERVIEW_BUNDLES = 'fund_overview_bundles';
  var TABLE_FUND_TRANSACTION_BUNDLES = 'fund_transaction_bundles';
  var TABLE_FUND_LOAN_BUNDLES = 'fund_loan_bundles';
  var TABLE_CATALOG_BUNDLES = 'catalog_bundles';
  var DEFAULT_FUND_TRANSACTION_FILTER_KEY = 'recent_500';
  var FUND_TRANSACTION_CACHE_PAGE_SIZE = 200;
  var FUND_TRANSACTION_UPSERT_BATCH_SIZE = 10;
  var FUND_CATALOG_GROUPS = ['incomeCategories', 'expenseCategories', 'actors', 'partners', 'loanPartners'];

  function requireYear_(year, clean) {
    var value = clean(year);
    if (!/^20\d{2}$/.test(value)) throw new Error('Thiếu năm Thu chi hợp lệ.');
    return value;
  }

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
    return 'fund_form_options:' + requireYear_(year, clean);
  }

  function buildFundCatalogKey(year, group, clean) {
    return 'fund_catalog:' + requireYear_(year, clean) + ':' + (clean(group) || 'all');
  }

  function normalizeFundWriteMonthKey(value, context) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return context.formatDate(value, 'yyyy-MM');
    }
    var text = context.clean(value);
    if (!text || text === 'latest' || text === 'all' || text === 'Tất cả') return '';
    var isoMonth = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
    if (isoMonth) return isoMonth[1] + '-' + ('0' + Number(isoMonth[2])).slice(-2);
    var vnMonth = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (vnMonth) return vnMonth[2] + '-' + ('0' + Number(vnMonth[1])).slice(-2);
    var date = context.parseDateValue(text);
    return date ? context.formatDate(date, 'yyyy-MM') : '';
  }

  function getFundMonthsFromOverview(year, context) {
    try {
      var overview = context.getFundOverview(year, { month: '' });
      return (overview.months || []).map(function (item) {
        return context.clean(item && item.key);
      }).filter(function (key) { return key; });
    } catch (err) {
      return [];
    }
  }

  function getRecentFundMonthKeys(year, maxCount, context) {
    var seen = {};
    getFundMonthsFromOverview(year, context).forEach(function (monthKey) {
      var normalized = normalizeFundWriteMonthKey(monthKey, context);
      if (normalized) seen[normalized] = true;
    });
    return Object.keys(seen).sort().reverse().slice(0, Math.max(1, maxCount || 1));
  }

  function addFundMonthKey_(seen, value, context) {
    var monthKey = normalizeFundWriteMonthKey(value, context);
    if (monthKey) seen[monthKey] = true;
  }

  function addFundPayloadMonthKey_(seen, payload, context) {
    if (!payload) return;
    addFundMonthKey_(seen, payload.month || payload.monthKey || payload.selectedMonth, context);
    addFundMonthKey_(seen, payload.date || payload.dateText || payload.loanDate || payload.paymentDate, context);
  }

  function getFundWriteMonthKeys(year, options, context) {
    var seen = {};
    var explicitMonths = options.months || options.monthKeys;
    (Array.isArray(explicitMonths) ? explicitMonths : []).forEach(function (monthKey) {
      addFundMonthKey_(seen, monthKey, context);
    });
    addFundPayloadMonthKey_(seen, options.transaction, context);
    (Array.isArray(options.transactions) ? options.transactions : []).forEach(function (transaction) {
      addFundPayloadMonthKey_(seen, transaction, context);
    });
    addFundPayloadMonthKey_(seen, options.loan, context);
    addFundPayloadMonthKey_(seen, options.payment, context);
    addFundPayloadMonthKey_(seen, options.result, context);
    (Array.isArray(options.result && options.result.rows) ? options.result.rows : []).forEach(function (row) {
      addFundPayloadMonthKey_(seen, row, context);
    });
    var monthKeys = Object.keys(seen).sort().reverse();
    return monthKeys.length ? monthKeys : getRecentFundMonthKeys(year, 2, context);
  }

  function syncFundOverview(year, month, context) {
    var safeYear = requireYear_(year, context.clean);
    var monthKey = normalizeFundMonthKey(month, context.clean);
    var payload = context.getFundOverview(safeYear, { month: monthKey });
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_FUND_OVERVIEW_BUNDLES, [{ year: safeYear, month_key: monthKey, payload: payload, synced_at: syncedAt }], 'year,month_key');
    context.writeSyncStatus('fund_overview:' + safeYear + ':' + (monthKey || 'latest'), 'fund', 'ok', 'Fund overview cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_OVERVIEW_BUNDLES, year: safeYear, monthKey: monthKey, syncedAt: syncedAt };
  }

  function syncFundTransactions(year, options, context) {
    var safeYear = requireYear_(year, context.clean);
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
    if (normalized.month && payload && payload.completeCapture === true && payload.cacheVersion) {
      var transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      var pageCount = Math.max(1, Math.ceil(transactions.length / FUND_TRANSACTION_CACHE_PAGE_SIZE));
      var pageRows = [];
      for (var pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        pageRows.push({
          year: safeYear,
          filter_key: filterKey + ':version:' + payload.cacheVersion + ':page:' + (pageIndex + 1),
          payload: {
            ok: true, year: safeYear, selectedMonth: normalized.month,
            cacheVersion: payload.cacheVersion, cachePage: pageIndex + 1, cachePageSize: FUND_TRANSACTION_CACHE_PAGE_SIZE,
            pageCount: pageCount, totalRows: transactions.length,
            transactions: transactions.slice(pageIndex * FUND_TRANSACTION_CACHE_PAGE_SIZE, (pageIndex + 1) * FUND_TRANSACTION_CACHE_PAGE_SIZE)
          },
          synced_at: syncedAt
        });
      }
      for (var batchStart = 0; batchStart < pageRows.length; batchStart += FUND_TRANSACTION_UPSERT_BATCH_SIZE) {
        context.upsertRows(TABLE_FUND_TRANSACTION_BUNDLES, pageRows.slice(batchStart, batchStart + FUND_TRANSACTION_UPSERT_BATCH_SIZE), 'year,filter_key');
      }
      var manifest = {};
      Object.keys(payload).forEach(function (key) { if (key !== 'transactions' && key !== 'completeCapture') manifest[key] = payload[key]; });
      manifest.transactions = transactions.slice(0, FUND_TRANSACTION_CACHE_PAGE_SIZE);
      manifest.totalRows = transactions.length;
      manifest.displayedRows = manifest.transactions.length;
      manifest.sourceTotalRows = transactions.length;
      manifest.limited = false;
      manifest.incomplete = false;
      manifest.pagination = { version: payload.cacheVersion, cachePageSize: FUND_TRANSACTION_CACHE_PAGE_SIZE, pageCount: pageCount, totalRows: transactions.length };
      context.upsertRows(TABLE_FUND_TRANSACTION_BUNDLES, [{ year: safeYear, filter_key: filterKey, payload: manifest, synced_at: syncedAt }], 'year,filter_key');
      context.deleteRows(TABLE_FUND_TRANSACTION_BUNDLES, {
        year: 'eq.' + safeYear,
        and: '(filter_key.like.' + filterKey + ':version:*,filter_key.not.like.' + filterKey + ':version:' + payload.cacheVersion + ':*)'
      });
      context.writeSyncStatus('fund_transactions:' + safeYear + ':' + filterKey, 'fund', 'ok', 'Fund transaction paged cache synced.', syncedAt);
      return { ok: true, table: TABLE_FUND_TRANSACTION_BUNDLES, year: safeYear, filterKey: filterKey, syncedAt: syncedAt, pageCount: pageCount };
    }
    // A bounded direct read must never replace a complete monthly manifest.
    // The realtime capture worker publishes the canonical month key after all source pages are available.
    if (normalized.month) filterKey += ':recent_' + normalized.limit;
    context.upsertRows(TABLE_FUND_TRANSACTION_BUNDLES, [{ year: safeYear, filter_key: filterKey, payload: payload, synced_at: syncedAt }], 'year,filter_key');
    context.writeSyncStatus('fund_transactions:' + safeYear + ':' + filterKey, 'fund', 'ok', 'Fund transaction cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_TRANSACTION_BUNDLES, year: safeYear, filterKey: filterKey, syncedAt: syncedAt };
  }

  function syncFundTransactionMonth(year, month, context) {
    var monthKey = normalizeFundMonthKey(month, context.clean);
    if (!monthKey) throw new Error('Thiếu tháng giao dịch quỹ cần sync.');
    return syncFundTransactions(requireYear_(year, context.clean), { month: monthKey, limit: 1000 }, context);
  }

  function syncFundLoanOverview(year, month, context) {
    var safeYear = requireYear_(year, context.clean);
    var monthKey = normalizeFundMonthKey(month, context.clean);
    var payload = context.getFundLoanOverview(safeYear, { month: monthKey });
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_FUND_LOAN_BUNDLES, [{ year: safeYear, month_key: monthKey, payload: payload, synced_at: syncedAt }], 'year,month_key');
    context.writeSyncStatus('fund_loans:' + safeYear + ':' + (monthKey || 'latest'), 'fund', 'ok', 'Fund loan cache synced.', syncedAt);
    return { ok: true, table: TABLE_FUND_LOAN_BUNDLES, year: safeYear, monthKey: monthKey, syncedAt: syncedAt };
  }

  function syncFundFormOptionsBundle(year, context) {
    var safeYear = requireYear_(year, context.clean);
    var catalogKey = buildFundFormOptionsKey(safeYear, context.clean);
    var payload = context.getFundFormOptions(safeYear, true);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_CATALOG_BUNDLES, [{ catalog_key: catalogKey, payload: payload, synced_at: syncedAt }], 'catalog_key');
    context.writeSyncStatus('fund_form_options:' + safeYear, 'fund', 'ok', 'Fund form options cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncFundCatalogBundle(year, group, context) {
    var safeYear = requireYear_(year, context.clean);
    var safeGroup = context.clean(group) || 'all';
    var catalogKey = buildFundCatalogKey(safeYear, safeGroup, context.clean);
    var payload = context.getFundCatalog(safeYear, safeGroup, true);
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_CATALOG_BUNDLES, [{ catalog_key: catalogKey, payload: payload, synced_at: syncedAt }], 'catalog_key');
    context.writeSyncStatus('fund_catalog:' + safeYear + ':' + safeGroup, 'fund', 'ok', 'Fund catalog cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncAllFundCatalogBundles(year, context) {
    var safeYear = requireYear_(year, context.clean);
    var results = [];
    var errors = [];
    context.runSyncStep(results, errors, 'fundFormOptions:' + safeYear, function () { return syncFundFormOptionsBundle(safeYear, context); });
    FUND_CATALOG_GROUPS.forEach(function (group) {
      context.runSyncStep(results, errors, 'fundCatalog:' + group, function () { return syncFundCatalogBundle(safeYear, group, context); });
    });
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, results: results, errors: errors };
  }

  function syncAllFundBundles(year, context) {
    var safeYear = requireYear_(year, context.clean);
    var results = [];
    var errors = [];
    var overviewSeed = null;
    context.runSyncStep(results, errors, 'fundOverviewLatest', function () {
      overviewSeed = syncFundOverview(safeYear, '', context);
      return overviewSeed;
    });
    var months = getFundMonthsFromOverview(safeYear, context);
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
    var safeYear = requireYear_(year, context.clean);
    var monthKeys = getFundWriteMonthKeys(safeYear, options || {}, context);
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
    var safeYear = requireYear_(year, context.clean);
    var monthKeys = getFundWriteMonthKeys(safeYear, { transactions: transactions || [] }, context);
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
    buildFundFormOptionsKey: buildFundFormOptionsKey, buildFundCatalogKey: buildFundCatalogKey,
    normalizeFundWriteMonthKey: normalizeFundWriteMonthKey,
    getFundMonthsFromOverview: getFundMonthsFromOverview,
    getRecentFundMonthKeys: getRecentFundMonthKeys,
    getFundWriteMonthKeys: getFundWriteMonthKeys
  };
})();
