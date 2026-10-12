const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const plain = (v) => JSON.parse(JSON.stringify(v));
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const read = (name) => fs.readFileSync(name, 'utf8');

function harness() {
  let now = 1000, openCount = 0, failure = '', loggerFailure = false;
  const calls = [], logs = [];
  const sheets = new Map();
  const context = {
    clean: (v) => String(v ?? '').trim(),
    getHeaderRow: () => 2,
    parseDateValue: (v) => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()) ? v : null,
    formatDate: (v) => `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`,
    normalizeYearMonthKey: (v) => ({ '9/2026': '2026-09', '2026-10': '2026-10', '2026-08': '2026-08' }[v] || ''),
    getSheet: (name) => sheets.get(name)?.sheet
  };
  function add(name, values, display, formulas = values.map((row) => row.map(() => ''))) {
    const raw = { values, display, formulas };
    function record(phase, value) {
      calls.push({ sheet: name, phase }); now += phase === 'values' ? 42000 : 10;
      if (failure === phase) throw Error('private-cell-or-secret-must-not-be-logged');
      return value;
    }
    const sheet = {
      getLastRow: () => record('lastRow', raw.values.length),
      getLastColumn: () => record('lastColumn', raw.values[0]?.length || 0),
      getRange: (r, c, rows, columns) => {
        record('getRange', null);
        const slice = (matrix) => matrix.slice(r - 1, r - 1 + rows).map((row) => row.slice(c - 1, c - 1 + columns));
        return { getValues: () => record('values', slice(raw.values)),
          getDisplayValues: () => record('display', slice(raw.display)),
          getFormulas: () => record('formulas', slice(raw.formulas)) };
      }
    };
    sheets.set(name, { sheet, raw }); return raw;
  }
  const sandbox = vm.createContext({});
  for (const file of ['ManageSyncService.gs', 'TransportSourceProbeService.gs']) vm.runInContext(read(file), sandbox);
  const options = {
    openSpreadsheet: () => { openCount++; now += 90; return { getSheetByName: (name) => { now += 20; return sheets.get(name)?.sheet; } }; },
    nowMillis: () => now,
    log: (line) => { if (loggerFailure) throw Error('logger failure'); logs.push(line); },
    hash,
    monthKeys: (sheet, values, display) => sandbox.ManageSyncService.getManageMonthKeysFromSnapshot(sheet, values, display, context)
  };
  return { ...sandbox, context, options, add, calls, logs, reader: sandbox.TransportSourceProbeService.createReader(options),
    opens: () => openCount, fail: (phase) => { failure = phase; }, breakLogger: () => { loggerFailure = true; } };
}

function fixture(h, name = 'NL_TaiXe') {
  return h.add(name,
    [['title', '', ''], ['Ngày', 'Tháng xử lý', 'Khối lượng'],
      [new Date('2026-10-01T00:00:00Z'), '9/2026', ''], [new Date('2026-08-01T00:00:00Z'), '2026-10', 1.25], ['', '9/2026', 0], ['', '', '']],
    [['title', '', ''], ['Ngày', ' THÁNG XỬ LÝ ', 'Khối lượng'], ['01/10/2026', '09/2026', ''], ['01/08/2026', '10/2026', '1,25'], ['', '09/2026', '0,0'], ['', '', '']],
    [['', '', ''], ['', '', ''], ['', '', ''], ['', '', '=1+0.25'], ['', '', ''], ['', '', '']]);
}

test('one complete probe preserves the old hash and discovers processing months without a second Sheet read', () => {
  const h = harness(), raw = fixture(h);
  const before = plain(h.calls);
  const originalMonths = plain(h.ManageSyncService.getManageMonthKeys('NL_TaiXe', h.context));
  assert.deepEqual(originalMonths, ['2026-10', '2026-09']);
  h.calls.length = before.length;
  assert.equal(h.reader.readHash('NL_TaiXe'), hash(JSON.stringify([raw.values, raw.display, raw.formulas])));
  const count = h.calls.length;
  assert.deepEqual(plain(h.reader.monthKeys('NL_TaiXe')), originalMonths);
  assert.equal(h.calls.length, count, 'month discovery must use the captured arrays');
  assert.deepEqual(h.calls.map((c) => c.phase), ['lastRow', 'lastColumn', 'getRange', 'values', 'display', 'formulas']);
  const returned = h.reader.monthKeys('NL_TaiXe'); returned.push('private-mutated-month');
  assert.deepEqual(plain(h.reader.monthKeys('NL_TaiXe')), originalMonths);
});

test('native and captured month discovery agree on every header preference, fallback, Dates and empty sheets', () => {
  const h = harness();
  for (const header of ['Tháng xử lý', 'thang xu ly', 'Kỳ phát sinh', 'ky phat sinh', 'Tháng', 'thang', 'Ngày', 'ngay', 'unknown']) {
    const values = [['title', ''], ['Unknown', header], ['2026-08', new Date('2026-10-01T00:00:00Z')], ['2026-08', '9/2026'], ['', '']];
    const display = values.map((row) => row.map(String)); h.add('NL_Dau', values, display);
    const captured = plain(h.ManageSyncService.getManageMonthKeysFromSnapshot('NL_Dau', values, display, h.context));
    assert.deepEqual(captured, header === 'unknown' ? ['2026-08'] : ['2026-10', '2026-09']);
    assert.deepEqual(captured, plain(h.ManageSyncService.getManageMonthKeys('NL_Dau', h.context)));
  }
  for (const values of [[], [['title']], [['title'], ['Ngày']]]) {
    const display = values.map((row) => row.map(String)); h.add('NL_Dau', values, display);
    assert.deepEqual(plain(h.ManageSyncService.getManageMonthKeysFromSnapshot('NL_Dau', values, display, h.context)), []);
    assert.deepEqual(plain(h.ManageSyncService.getManageMonthKeys('NL_Dau', h.context)), []);
  }
});

test('fresh probes always recapture edits, formatting and formulas while opening the workbook only once per reader', () => {
  const h = harness(), raw = fixture(h), original = h.reader.readHash('NL_TaiXe');
  raw.values[2][2] = 2.75;
  const valueEdit = h.reader.readHash('NL_TaiXe'); assert.notEqual(valueEdit, original);
  raw.display[2][2] = '2,750';
  const displayEdit = h.reader.readHash('NL_TaiXe'); assert.notEqual(displayEdit, valueEdit);
  raw.formulas[2][2] = '=2+0.75'; assert.notEqual(h.reader.readHash('NL_TaiXe'), displayEdit);
  fixture(h, 'NL_Dau'); h.reader.readHash('NL_Dau'); assert.equal(h.opens(), 1);
  assert.throws(() => h.reader.monthKeys('NL_TaiXe'), /Missing current/);
  const nextTurn = h.TransportSourceProbeService.createReader(h.options);
  assert.throws(() => nextTurn.monthKeys('NL_Dau'), /Missing current/);
  nextTurn.readHash('NL_Dau'); assert.equal(h.opens(), 2);
});

test('native failures erase the previous snapshot, preserve the exception, and only log phase timings', () => {
  for (const phase of ['lastRow', 'lastColumn', 'getRange', 'values', 'display', 'formulas']) {
    const h = harness(); fixture(h); h.reader.readHash('NL_TaiXe'); h.fail(phase);
    assert.throws(() => h.reader.readHash('NL_TaiXe'), /private-cell-or-secret/);
    assert.throws(() => h.reader.monthKeys('NL_TaiXe'), /Missing current/);
    const last = JSON.parse(h.logs.at(-1).split('transport_probe_phase:')[1]);
    assert.equal(last.phase, phase); assert.equal(last.event, 'end'); assert.equal(last.ok, false);
    assert.ok(last.ms >= 0); assert.ok(h.logs.every((line) => !/private-cell|=1\+|1,25|9\/2026/.test(line)));
  }
});

test('slow source calls are separated from other phases and telemetry failure cannot stop the read', () => {
  const h = harness(); fixture(h); h.reader.readHash('NL_TaiXe');
  const records = h.logs.map((line) => JSON.parse(line.split('transport_probe_phase:')[1]));
  assert.equal(records.find((r) => r.phase === 'values' && r.event === 'end').ms, 42000);
  assert.equal(records.find((r) => r.phase === 'display' && r.event === 'end').ms, 10);
  assert.ok(records.findIndex((r) => r.phase === 'values' && r.event === 'start') < records.findIndex((r) => r.phase === 'values' && r.event === 'end'));
  h.breakLogger(); assert.equal(typeof h.reader.readHash('NL_TaiXe'), 'string');
});

function coordinator({ missing = false, failIndex = false, page = false, changed = false } = {}) {
  const h = harness(); fixture(h, 'NL_Dau'); fixture(h, 'NL_TaiXe');
  const properties = new Map(), results = [], queries = [];
  const props = { getProperty: (k) => properties.get(k), setProperty: (k, v) => properties.set(k, v), deleteProperty: (k) => properties.delete(k) };
  for (const sheet of ['NL_Dau', 'NL_TaiXe']) properties.set('SUPABASE_TRANSPORT_INPUT_HASH_V1_' + sheet, changed ? 'old' : h.reader.readHash(sheet));
  h.calls.length = 0;
  const initialOpens = h.opens();
  const s = vm.createContext({ console: { log: (line) => h.logs.push(line) },
    normalizeCleanValue_: h.context.clean, APP_CONFIG: { spreadsheetId: 'isolated', timezone: 'Asia/Ho_Chi_Minh', sheets: { fuel: { name: 'NL_Dau', headerRow: 2 }, driver: { name: 'NL_TaiXe', headerRow: 2 } } },
    SpreadsheetApp: { openById: h.options.openSpreadsheet },
    PropertiesService: { getScriptProperties: () => props }, CacheService: { getScriptCache: () => ({}) },
    Utilities: { getUuid: () => 'isolated-tick', formatDate: (date, pattern) => pattern === 'yyyy-MM' ? h.context.formatDate(date) : '',
      DigestAlgorithm: { SHA_256: 'SHA_256' }, computeDigest: (_algo, input) => [...crypto.createHash('sha256').update(input).digest()] },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    SupabaseSyncStatusRepository: { upsert() {} },
    SupabaseBundleRepository: { readRows: (table, query) => {
      queries.push(plain({ table, query })); if (failIndex) throw Error('index unavailable');
      if (page && query.offset === 0) return Array.from({ length: 100 }, (_, i) => ({ filter_key: `other:${i}` }));
      return ['recent_500', 'month:2026-10', ...(missing ? [] : ['month:2026-09'])].map((filter_key) => ({ filter_key }));
    } },
    ManualReportRefreshQueueService: { getPending: () => null,
      claimNextDue: () => ({ due: true, key: 'transport', claims: {}, nextPreferredKey: 'fund', item: { sources: ['signal:transport:EDIT'], inputHashes: {}, changedSheets: [], fastManagedSheets: [] } }),
      claimDue: () => ({ due: false }) },
    TransportRefreshWorker: { run: (item, c) => {
      for (const sheet of ['NL_Dau', 'NL_TaiXe']) results.push(plain(c.runTask(['probeInput', sheet, 'manage'], item)));
      return { ok: true };
    } }
  });
  for (const file of ['ManageSyncService.gs', 'TransportSourceProbeService.gs', 'SupabaseService.gs']) vm.runInContext(read(file), s);
  for (const k of ['SUPABASE_REALTIME_HEARTBEAT_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) properties.set(k, String(Date.now() + 86400000));
  return { h, results, queries, properties, initialOpens, run: () => s.SupabaseService.syncRealtimeCache() };
}

test('actual coordinator checks unchanged source cache completeness with two full reads and one workbook open', () => {
  const c = coordinator(); assert.equal(c.run().ok, true);
  assert.deepEqual(c.results, [{ result: { ok: true } }, { result: { ok: true } }]);
  assert.equal(c.h.opens() - c.initialOpens, 1);
  assert.equal(c.h.calls.filter((call) => call.phase === 'values').length, 2, 'old cachePresent performs two additional column scans');
  assert.equal(c.h.calls.length, 12);
  assert.equal(c.queries.length, 2);
});

test('missing historical cache month still schedules a refresh and paginated cache indexes are fully checked', () => {
  const missing = coordinator({ missing: true }); missing.run();
  assert.ok(missing.results.every((r) => r.added.some((task) => task[0] === 'manage')));
  const pages = coordinator({ page: true }); pages.run();
  assert.equal(pages.queries.length, 4); assert.equal(pages.queries[1].query.offset, 100);
  assert.ok(pages.results.every((r) => !r.added));
  const changed = coordinator({ changed: true }); changed.run();
  assert.equal(changed.queries.length, 0, 'changed inputs preserve the early refresh path');
  assert.ok(changed.results.every((r) => r.added.some((task) => task[0] === 'manage')));
});

test('cache index failure propagates without committing input hashes or retaining the realtime owner', () => {
  const c = coordinator({ failIndex: true }); const old = c.properties.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau');
  assert.throws(c.run, /index unavailable/);
  assert.equal(c.properties.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau'), old);
  assert.equal(c.properties.has('SUPABASE_REALTIME_TICK_RUNNING'), false);
  const last = c.h.logs.filter((line) => line.startsWith('transport_probe_phase:')).at(-1);
  assert.equal(JSON.parse(last.split('transport_probe_phase:')[1]).ok, false);
  assert.ok(!last.includes('index unavailable'));
});
