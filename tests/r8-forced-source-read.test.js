const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(name, 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
function sourceHarness() {
  let live = [['Ngày', 'Khối lượng'], ['2026-10-06', '0,0']];
  let failure = false; let cacheReads = 0; let cacheWrites = 0; const cache = new Map();
  const sheet = { getLastRow: () => 2, getLastColumn: () => 2,
    getRange: (r, c, rows, columns) => ({ getValues: () => {
      if (failure) throw Error('Source unavailable');
      return live.slice(r - 1, r - 1 + rows).map((row) => row.slice(c - 1, c - 1 + columns));
    } }) };
  const s = vm.createContext({}); vm.runInContext(read('SheetReadService.gs'), s);
  const ctx = { sheets: {}, getDataVersion: () => 'unchanged-by-external-edit',
    buildCacheKey: (...args) => args.join(':'), getCached: (key) => { cacheReads++; return cache.get(key); },
    putCached: (key, value) => { cacheWrites++; cache.set(key, value); }, getLastNonEmptyRow: () => 2 };
  const readRows = () => s.SheetReadService.readSheetDataFromSpreadsheet({ getSheetByName: () => sheet }, 'NL_VanChuyen', '', '', 500, ctx);
  return { ctx, readRows, edit: () => { live[1][1] = ''; }, fail: () => { failure = true; }, counts: () => ({ cacheReads, cacheWrites }) };
}
test('sync force reads an external blank-volume edit while a60second old response and unchanged generation are still warm', () => {
  const h = sourceHarness(); assert.equal(h.readRows().rows[0].values[1], '0,0');
  h.edit(); assert.equal(h.readRows().rows[0].values[1], '0,0'); // Reproduces the old sync path.
  const before = h.counts(); h.ctx.forceRefresh = true;
  assert.equal(h.readRows().rows[0].values[1], '');
  assert.equal(h.counts().cacheReads, before.cacheReads);
  h.ctx.forceRefresh = false; assert.equal(h.readRows().rows[0].values[1], '');
});
test('forced source failure cannot fall back to an old cached success or overwrite it', () => {
  const h = sourceHarness(); h.readRows(); const before = h.counts(); h.fail(); h.ctx.forceRefresh = true;
  const result = h.readRows(); assert.equal(result.ok, false); assert.match(result.error, /Source unavailable/);
  assert.equal(h.counts().cacheWrites, before.cacheWrites);
});
test('forced catalog option read bypasses six-hour cache and warms only its own key', () => {
  let cached = { vehicles: ['old'] }; const writes = []; let reads = 0;
  const s = vm.createContext({ APP_CONFIG: { spreadsheetId: 'fixture', year: '2026' }, normalizeCleanValue_: (v) => String(v || '').trim(),
    RuntimeCacheService: { buildKey: (parts) => parts.join(':'), getChunked: () => cached, putChunked: (key, value) => { cached = value; writes.push(key); } },
    SpreadsheetApp: { openById: () => ({}) }, CatalogService: { readCatalogs: () => { reads++; return { vehicles: ['new'] }; } } });
  vm.runInContext(read('SheetService.gs'), s);
  assert.deepEqual(plain(s.SheetService.getCatalogs('vanChuyen')), { vehicles: ['old'] });
  assert.deepEqual(plain(s.SheetService.getCatalogs('vanChuyen', true)), { vehicles: ['new'] });
  assert.equal(reads, 1); assert.equal(writes.length, 1);
  assert.deepEqual(plain(s.SheetService.getCatalogs('vanChuyen')), { vehicles: ['new'] });
});
test('actual sync and audit boundaries request fresh manage, catalog table, options and startup reads', () => {
  const captured = []; const source = (forced) => ({ ok: true, rows: [{ rowIndex: 2, values: [forced ? '' : '0,0'] }] });
  const s = vm.createContext({ APP_CONFIG: { spreadsheetId: 'fixture', year: '2026' }, normalizeCleanValue_: (v) => String(v || '').trim(), console: { log() {} }, Utilities: { formatDate: (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    ManageService: { readManageData: (_name, _start, _end, _limit, options) => source(options?.forceRefresh) },
    SheetService: { getStartupData: (_form, force) => source(force) },
    CatalogService: { getCatalogs: (_form, force) => source(force), readCatalogData: (_name, force) => source(force) },
    CacheService: { getScriptCache: () => ({}) },
    SupabaseBundleRepository: { upsertRows: (_table, rows) => captured.push(...plain(rows)), readRows: () => [{ sheet_name: 'NL_VanChuyen', payload: source(false) }] },
    SupabaseSyncStatusRepository: { upsert() {} }, CacheAuditService: { normalizeManageSheets: () => ['NL_VanChuyen'], encodeSupabaseInValue: String,
      buildManageResult: (_name, _limit, _cached, live) => ({ ok: live.rows[0].values[0] === '' }) } });
  for (const file of ['ManageSyncService.gs', 'StartupCatalogSyncService.gs', 'SupabaseService.gs']) vm.runInContext(read(file), s);
  s.SupabaseService.syncManageDataBundle('NL_VanChuyen'); s.SupabaseService.syncManageMonthBundle('NL_VanChuyen', '2026-10');
  s.SupabaseService.syncCatalogDataBundle('DM_Xe'); s.SupabaseService.syncCatalogsBundle('vanChuyen'); s.SupabaseService.syncStartupBundle('vanChuyen');
  assert.equal(captured.length, 5); assert.ok(captured.every((row) => row.payload.rows[0].values[0] === ''));
  assert.equal(s.SupabaseService.getManageCacheAudit('NL_VanChuyen', 500).ok, true);
});

for (const [method, reader, scope] of [['syncStartupBundle', 'getStartupData', 'vanChuyen'], ['syncCatalogsBundle', 'getCatalogs', 'vanChuyen'], ['syncCatalogDataBundle', 'readCatalogData', 'DM_Xe']]) {
  test(`${method} cannot publish a source error as success or acknowledge its cache stage`, () => {
    const s = vm.createContext({}); vm.runInContext(read('StartupCatalogSyncService.gs'), s); let writes = 0; let statuses = 0;
    const ctx = { year: '2026', clean: String, nowISOString: () => '2026-10-07', [reader]: () => ({ ok: false, error: 'Source unavailable' }),
      upsertRows: () => { writes++; }, writeSyncStatus: () => { statuses++; } };
    assert.throws(() => s.StartupCatalogSyncService[method](scope, ctx), /Invalid .* source payload/);
    assert.equal(writes, 0); assert.equal(statuses, 0);
  });
}
