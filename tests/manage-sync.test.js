const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadService(overrides = {}) {
  const vmContext = vm.createContext({});
  new vm.Script(read('ManageSyncService.gs'), { filename: 'ManageSyncService.gs#test' }).runInContext(vmContext);
  const calls = { reads: [], upserts: [], statuses: [], cache: [], dashboards: 0 };
  const syncTime = '2026-07-11T16:00:00.000Z';
  const dates = [new Date(2026, 6, 11), new Date(2026, 5, 30), new Date(2026, 6, 1)];
  const runtimeValues = {};
  const context = {
    clean(value) { return value === null || value === undefined ? '' : String(value).trim(); },
    nowISOString() { return syncTime; },
    normalizeYearMonthKey(value) {
      const text = String(value || '').trim();
      const iso = text.match(/^(\d{4})-(\d{1,2})/);
      if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`;
      const vn = text.match(/^(\d{1,2})\/(\d{4})$/);
      return vn ? `${vn[2]}-${String(Number(vn[1])).padStart(2, '0')}` : '';
    },
    formatDate(date, pattern) {
      if (pattern === 'yyyy-MM') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },
    parseDateValue(value) { return value instanceof Date ? value : null; },
    getHeaderRow() { return 2; },
    getSheet() {
      return {
        getLastRow: () => 5,
        getRange: (row, column, numRows) => ({ getValues: () => dates.slice(0, numRows).map((date) => [date]) })
      };
    },
    readManageData(sheetName, startDate, endDate, limit) {
      calls.reads.push({ sheetName, startDate, endDate, limit });
      return { ok: true, sheetName, startDate, endDate, limit };
    },
    upsertRows(tableName, rows, onConflict) { calls.upserts.push({ tableName, rows, onConflict }); },
    writeSyncStatus(...args) { calls.statuses.push(args); },
    runSyncStep(results, errors, name, fn) {
      try { results.push({ name, result: fn() }); } catch (error) { errors.push({ name, error: error.message }); }
    },
    syncDashboard() { calls.dashboards += 1; return { ok: true }; },
    runtimeCache: {
      get(key) { return runtimeValues[key] || null; },
      put(key, value, ttl) { runtimeValues[key] = value; calls.cache.push(['put', key, ttl]); },
      remove(key) { delete runtimeValues[key]; calls.cache.push(['remove', key]); }
    },
    runningKeyPrefix: 'SYNC_RUNNING',
    runningTtlSeconds: 120,
    ...overrides
  };
  return { service: vmContext.ManageSyncService, context, calls, syncTime };
}

test('recent and month bundle sync preserve payload limits, rows, conflict keys, and statuses', () => {
  const { service, context, calls, syncTime } = loadService();
  const recent = service.syncManageDataBundle(' NL_VanChuyen ', context);
  const month = service.syncManageMonthBundle('NL_VanChuyen', '7/2026', context);
  assert.deepEqual(JSON.parse(JSON.stringify([recent, month])), [
    { ok: true, table: 'manage_data_bundles', sheetName: 'NL_VanChuyen', filterKey: 'recent_500', syncedAt: syncTime },
    { ok: true, table: 'manage_data_bundles', sheetName: 'NL_VanChuyen', filterKey: 'month:2026-07', monthKey: '2026-07', syncedAt: syncTime }
  ]);
  assert.deepEqual(calls.reads, [
    { sheetName: 'NL_VanChuyen', startDate: '', endDate: '', limit: 500 },
    { sheetName: 'NL_VanChuyen', startDate: '2026-07-01', endDate: '2026-07-31', limit: 500 }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.upserts.map((call) => [call.tableName, call.rows[0].filter_key, call.onConflict]))), [
    ['manage_data_bundles', 'recent_500', 'sheet_name,filter_key'],
    ['manage_data_bundles', 'month:2026-07', 'sheet_name,filter_key']
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.statuses.map((row) => row[0]))), [
    'manage_data:NL_VanChuyen:recent_500', 'manage_data:NL_VanChuyen:month:2026-07'
  ]);
});

test('manage month discovery remains unique, newest-first, and full sync keeps all seven sheets', () => {
  const original = loadService();
  assert.deepEqual(JSON.parse(JSON.stringify(original.service.getManageMonthKeys('NL_VanChuyen', original.context))), ['2026-07', '2026-06']);
  const result = original.service.syncAllManageDataBundles(original.context);
  assert.equal(result.ok, true);
  assert.equal(result.synced, 21);
  assert.equal(result.failed, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.results.slice(0, 3).map((item) => item.name))), [
    'manageData:NL_VanChuyen', 'manageData:NL_VanChuyen:2026-07', 'manageData:NL_VanChuyen:2026-06'
  ]);
});

test('sheet-change sync preserves lock, edited/fallback scope, dashboard rule, and status key', () => {
  const edited = loadService();
  const range = { getRow: () => 3, getNumRows: () => 1 };
  const result = edited.service.syncTransportSheetChange('EDIT', 'NL_VanChuyen', range, edited.context);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), ['2026-07']);
  assert.equal(result.synced, 3);
  assert.equal(edited.calls.dashboards, 1);
  assert.deepEqual(edited.calls.cache, [['put', 'SYNC_RUNNING:NL_VanChuyen', 120], ['remove', 'SYNC_RUNNING:NL_VanChuyen']]);
  assert.equal(edited.calls.statuses.at(-1)[0], 'transport_sheet_change:NL_VanChuyen');

  const fallback = loadService();
  const fallbackResult = fallback.service.syncUnknownTransportSheetChange('REMOVE_ROW', fallback.context);
  assert.equal(fallbackResult.fallback, true);
  assert.equal(fallbackResult.synced, 4);
  assert.equal(fallback.calls.statuses.at(-1)[0], 'transport_sheet_change:unknown');
  assert.equal(fallback.calls.dashboards, 1);
});

test('SupabaseService retains manage facades while ManageSyncService owns manage sync implementation', () => {
  const facade = read('SupabaseService.gs');
  const implementation = read('ManageSyncService.gs');
  assert.match(facade, /ManageSyncService\.syncManageDataBundle\(sheetName, manageSyncContext_\(\)\)/);
  assert.match(facade, /ManageSyncService\.syncTransportSheetChange\(eventType, sheetName, editedRange, manageSyncContext_\(\)\)/);
  assert.match(facade, /ManageSyncService\.syncUnknownTransportSheetChange\(eventType, manageSyncContext_\(\)\)/);
  assert.doesNotMatch(facade, /filter_key: DEFAULT_MANAGE_FILTER_KEY/);
  assert.match(implementation, /var DEFAULT_MANAGE_FILTER_KEY = 'recent_500'/);
});
