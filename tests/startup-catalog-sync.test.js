const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadService(overrides = {}) {
  const context = vm.createContext({});
  new vm.Script(read('StartupCatalogSyncService.gs'), { filename: 'StartupCatalogSyncService.gs#test' }).runInContext(context);
  const calls = { reads: [], upserts: [], statuses: [] };
  const syncTime = '2026-07-11T14:00:00.000Z';
  const dependencies = {
    clean(value) {
      return value === null || value === undefined ? '' : String(value).trim();
    },
    nowISOString() {
      return syncTime;
    },
    getStartupData(formType) {
      calls.reads.push(['startup', formType]);
      return { kind: 'startup', formType };
    },
    getCatalogs(formType) {
      calls.reads.push(['catalogs', formType]);
      return { kind: 'catalogs', formType };
    },
    readCatalogData(displaySheetName) {
      calls.reads.push(['catalogData', displaySheetName]);
      return { kind: 'catalogData', displaySheetName };
    },
    upsertRows(tableName, rows, onConflict) {
      calls.upserts.push({ tableName, rows, onConflict });
    },
    writeSyncStatus(...args) {
      calls.statuses.push(args);
    },
    runSyncStep(results, errors, name, fn) {
      try {
        results.push({ name, result: fn() });
      } catch (error) {
        errors.push({ name, error: error.message });
      }
    },
    ...overrides
  };
  return { service: context.StartupCatalogSyncService, dependencies, calls, syncTime };
}

test('startup and catalog bundle sync preserve rows, conflict keys, status keys, and responses', () => {
  const { service, dependencies, calls, syncTime } = loadService();
  const startup = service.syncStartupBundle('', dependencies);
  const catalogs = service.syncCatalogsBundle('', dependencies);
  const catalogData = service.syncCatalogDataBundle(' DM_Xe ', dependencies);

  assert.deepEqual(JSON.parse(JSON.stringify([startup, catalogs, catalogData])), [
    { ok: true, table: 'startup_bundles', formType: 'vanChuyen', syncedAt: syncTime },
    { ok: true, table: 'catalog_bundles', catalogKey: 'catalogs:all', syncedAt: syncTime },
    { ok: true, table: 'catalog_bundles', catalogKey: 'catalog_data:DM_Xe', syncedAt: syncTime }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.upserts)), [
    {
      tableName: 'startup_bundles',
      rows: [{ form_type: 'vanChuyen', payload: { kind: 'startup', formType: 'vanChuyen' }, synced_at: syncTime }],
      onConflict: 'form_type'
    },
    {
      tableName: 'catalog_bundles',
      rows: [{ catalog_key: 'catalogs:all', payload: { kind: 'catalogs', formType: '' }, synced_at: syncTime }],
      onConflict: 'catalog_key'
    },
    {
      tableName: 'catalog_bundles',
      rows: [{ catalog_key: 'catalog_data:DM_Xe', payload: { kind: 'catalogData', displaySheetName: 'DM_Xe' }, synced_at: syncTime }],
      onConflict: 'catalog_key'
    }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.statuses)), [
    ['startup:vanChuyen', 'startup', 'ok', 'Startup cache synced.', syncTime],
    ['catalogs:all', 'catalog', 'ok', 'Catalog options cache synced.', syncTime],
    ['catalog_data:DM_Xe', 'catalog', 'ok', 'Catalog table cache synced.', syncTime]
  ]);
});

test('full startup/catalog sync preserves the 21 live targets and isolated failure response', () => {
  const original = loadService();
  const result = original.service.syncAllStartupAndCatalogs(original.dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.synced, 21);
  assert.equal(result.failed, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.results.map((entry) => entry.name))), [
    'startup:vanChuyen',
    'catalogs:all', 'catalogs:vanChuyen', 'catalogs:taiXe', 'catalogs:dau',
    'catalogs:chamCong', 'catalogs:phat', 'catalogs:nghiVanHanh',
    'catalogData:DM_NhanSu', 'catalogData:DM_Xe', 'catalogData:DM_DuAn',
    'catalogData:DM_CheDoLuong', 'catalogData:DM_LuongChuyen', 'catalogData:DM_ThamSo_TS',
    'catalogData:DM_GiaDau', 'catalogData:DM_DonGiaVanChuyen', 'catalogData:DM_ThuongQuanLy',
    'catalogData:DM_PhatNoiBo', 'catalogData:DM_PhanCongXe', 'catalogData:DM_BaoHiem',
    'catalogData:DM_UuDaiNoiBo'
  ]);

  const failed = loadService({
    readCatalogData(displaySheetName) {
      if (displaySheetName === 'DM_Xe') throw new Error('synthetic read failure');
      return { displaySheetName };
    }
  });
  const failedResult = failed.service.syncAllStartupAndCatalogs(failed.dependencies);
  assert.equal(failedResult.ok, false);
  assert.equal(failedResult.synced, 20);
  assert.equal(failedResult.failed, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(failedResult.errors)), [
    { name: 'catalogData:DM_Xe', error: 'synthetic read failure' }
  ]);
});

test('catalog after-write sync preserves broad option refresh and narrow table refresh', () => {
  const { service, dependencies, calls } = loadService();
  const result = service.syncCatalogAfterWrite('DM_Xe', dependencies);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, synced: 9, failed: 0, errors: [] });
  assert.deepEqual(calls.reads.map((entry) => entry.join(':')), [
    'startup:vanChuyen',
    'catalogs:', 'catalogs:vanChuyen', 'catalogs:taiXe', 'catalogs:dau',
    'catalogs:chamCong', 'catalogs:phat', 'catalogs:nghiVanHanh',
    'catalogData:DM_Xe'
  ]);
});

test('SupabaseService retains public wrappers while startup/catalog implementation has one owner', () => {
  const facade = read('SupabaseService.gs');
  const implementation = read('StartupCatalogSyncService.gs');
  assert.match(facade, /StartupCatalogSyncService\.syncStartupBundle\(formType, startupCatalogSyncContext_\(\)\)/);
  assert.match(facade, /StartupCatalogSyncService\.syncAllStartupAndCatalogs\(startupCatalogSyncContext_\(\)\)/);
  assert.match(facade, /StartupCatalogSyncService\.syncCatalogAfterWrite\(displaySheetName, startupCatalogSyncContext_\(\)\)/);
  assert.doesNotMatch(facade, /form_type: safeFormType/);
  assert.match(implementation, /var TABLE_STARTUP_BUNDLES = 'startup_bundles'/);
  assert.match(implementation, /var TABLE_CATALOG_BUNDLES = 'catalog_bundles'/);
});
