/** Supabase sync implementation for Transport startup and catalog caches. */
var StartupCatalogSyncService = (function () {
  var TABLE_STARTUP_BUNDLES = 'startup_bundles';
  var TABLE_CATALOG_BUNDLES = 'catalog_bundles';
  var DEFAULT_STARTUP_FORM_TYPE = 'vanChuyen';
  var CATALOG_FORM_TYPES = ['', 'vanChuyen', 'taiXe', 'dau', 'chamCong', 'phat', 'nghiVanHanh'];
  var CATALOG_DISPLAY_SHEETS = [
    'DM_NhanSu',
    'DM_Xe',
    'DM_DuAn',
    'DM_CheDoLuong',
    'DM_LuongChuyen',
    'DM_ThamSo_TS',
    'DM_GiaDau',
    'DM_DonGiaVanChuyen',
    'DM_ThuongQuanLy',
    'DM_PhatNoiBo',
    'DM_PhanCongXe',
    'DM_BaoHiem',
    'DM_UuDaiNoiBo'
  ];

  function requireYear_(context) {
    var year = context.clean(context.year);
    if (!/^20\d{2}$/.test(year)) throw new Error('Thiếu năm cache Vận tải hợp lệ.');
    return year;
  }

  function buildStartupKey_(formType, context) {
    return requireYear_(context) + ':' + (context.clean(formType) || DEFAULT_STARTUP_FORM_TYPE);
  }

  function buildCatalogsKey(formType, year, clean) {
    return 'transport:' + clean(year) + ':catalogs:' + (clean(formType) || 'all');
  }

  function buildCatalogDataKey(displaySheetName, year, clean) {
    return 'transport:' + clean(year) + ':catalog_data:' + clean(displaySheetName);
  }

  function syncStartupBundle(formType, context) {
    var safeFormType = context.clean(formType) || DEFAULT_STARTUP_FORM_TYPE;
    var payload = context.getStartupData(safeFormType);
    if (!payload || payload.ok === false) throw new Error('Invalid startup source payload.');
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_STARTUP_BUNDLES, [{
      form_type: buildStartupKey_(safeFormType, context),
      payload: payload,
      synced_at: syncedAt
    }], 'form_type');
    context.writeSyncStatus(requireYear_(context) + ':startup:' + safeFormType, 'startup', 'ok', 'Startup cache synced.', syncedAt);
    return { ok: true, table: TABLE_STARTUP_BUNDLES, formType: safeFormType, syncedAt: syncedAt };
  }

  function syncCatalogsBundle(formType, context) {
    var safeFormType = context.clean(formType);
    var catalogKey = buildCatalogsKey(safeFormType, requireYear_(context), context.clean);
    var payload = context.getCatalogs(safeFormType);
    if (!payload || payload.ok === false) throw new Error('Invalid catalog options source payload.');
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_CATALOG_BUNDLES, [{
      catalog_key: catalogKey,
      payload: payload,
      synced_at: syncedAt
    }], 'catalog_key');
    context.writeSyncStatus(requireYear_(context) + ':catalogs:' + (safeFormType || 'all'), 'catalog', 'ok', 'Catalog options cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncCatalogDataBundle(displaySheetName, context) {
    var safeDisplaySheetName = context.clean(displaySheetName);
    if (!safeDisplaySheetName) throw new Error('Thiếu tên danh mục cần sync.');
    var catalogKey = buildCatalogDataKey(safeDisplaySheetName, requireYear_(context), context.clean);
    var payload = context.readCatalogData(safeDisplaySheetName);
    if (!payload || payload.ok === false) throw new Error('Invalid catalog table source payload.');
    var syncedAt = context.nowISOString();
    context.upsertRows(TABLE_CATALOG_BUNDLES, [{
      catalog_key: catalogKey,
      payload: payload,
      synced_at: syncedAt
    }], 'catalog_key');
    context.writeSyncStatus(requireYear_(context) + ':catalog_data:' + safeDisplaySheetName, 'catalog', 'ok', 'Catalog table cache synced.', syncedAt);
    return { ok: true, table: TABLE_CATALOG_BUNDLES, catalogKey: catalogKey, syncedAt: syncedAt };
  }

  function syncAllStartupAndCatalogs(context) {
    var results = [];
    var errors = [];
    context.runSyncStep(results, errors, 'startup:' + DEFAULT_STARTUP_FORM_TYPE, function () {
      return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE, context);
    });
    CATALOG_FORM_TYPES.forEach(function (formType) {
      context.runSyncStep(results, errors, 'catalogs:' + (formType || 'all'), function () {
        return syncCatalogsBundle(formType, context);
      });
    });
    CATALOG_DISPLAY_SHEETS.forEach(function (displaySheetName) {
      context.runSyncStep(results, errors, 'catalogData:' + displaySheetName, function () {
        return syncCatalogDataBundle(displaySheetName, context);
      });
    });
    return {
      ok: errors.length === 0,
      synced: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    };
  }

  function syncCatalogAfterWrite(displaySheetName, context) {
    var safeDisplaySheetName = context.clean(displaySheetName);
    var results = [];
    var errors = [];
    context.runSyncStep(results, errors, 'startup', function () {
      return syncStartupBundle(DEFAULT_STARTUP_FORM_TYPE, context);
    });
    CATALOG_FORM_TYPES.forEach(function (formType) {
      context.runSyncStep(results, errors, 'catalogs:' + (formType || 'all'), function () {
        return syncCatalogsBundle(formType, context);
      });
    });
    if (safeDisplaySheetName) {
      context.runSyncStep(results, errors, 'catalogData:' + safeDisplaySheetName, function () {
        return syncCatalogDataBundle(safeDisplaySheetName, context);
      });
    }
    return { ok: errors.length === 0, synced: results.length, failed: errors.length, errors: errors };
  }

  return {
    getCatalogFormTypes: function () { return CATALOG_FORM_TYPES.slice(); },
    syncStartupBundle: syncStartupBundle,
    syncCatalogsBundle: syncCatalogsBundle,
    syncCatalogDataBundle: syncCatalogDataBundle,
    syncAllStartupAndCatalogs: syncAllStartupAndCatalogs,
    syncCatalogAfterWrite: syncCatalogAfterWrite,
    buildCatalogsKey: buildCatalogsKey,
    buildCatalogDataKey: buildCatalogDataKey
  };
})();
