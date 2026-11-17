const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const read = (file) => fs.readFileSync(file, 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function scopedEditHarness({ lockError = false } = {}) {
  const properties = new Map();
  const dates = Array.from({ length: 10 }, (_, index) => `${10 + index}/10/2026`);
  const sheet = {
    getSheetId: () => 731,
    getName: () => 'NL_TaiXe',
    getLastColumn: () => 2,
    getLastRow: () => 2000,
    getRange(row, column, numRows) {
      if (row === 2 && numRows === 1) return { getDisplayValues: () => [['Ngày', 'Tháng']] };
      assert.ok(column === 1 || column === 2);
      return {
        getRow: () => row,
        getNumRows: () => numRows,
        getValues: () => dates.slice(0, numRows).map((date) => [date])
      };
    }
  };
  const props = {
    getProperty: (key) => properties.get(key),
    setProperty: (key, value) => properties.set(key, value),
    deleteProperty: (key) => properties.delete(key)
  };
  const sandbox = vm.createContext({
    Date,
    console: { log() {} },
    normalizeCleanValue_: (value) => String(value ?? '').trim(),
    APP_CONFIG: {
      spreadsheetId: 'transport-sheet', year: '2026', timezone: 'Asia/Ho_Chi_Minh',
      sheets: { vanChuyen: { name: 'NL_VanChuyen', headerRow: 2 } }
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, getSheets: () => [sheet] }) },
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({
      tryLock: () => {
        if (lockError) throw new Error('There are too many LockService operations against the same script.');
        return true;
      },
      releaseLock() {}
    }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    Utilities: {
      getUuid: () => 'uuid',
      formatDate: (date, _timezone, pattern) => pattern === 'yyyy-MM'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : ''
    },
    SupabaseSyncStatusRepository: { upsert() {} },
    NotificationPipelineService: { run: () => ({ checked: false }) }
  });
  for (const file of ['ManageSyncService.gs', 'ManualReportRefreshQueueService.gs', 'SheetChangeSignalService.gs', 'SupabaseService.gs']) {
    vm.runInContext(read(file), sandbox);
  }
  return { service: sandbox.SupabaseService, signalService: sandbox.SheetChangeSignalService, properties };
}

function mixedSignalHarness() {
  const h = scopedEditHarness();
  const properties = h.properties;
  let seq = 0;
  const context = {
    year: '2026',
    getProperty: (key) => properties.get(key),
    setProperty: (key, value) => properties.set(key, value),
    nowMillis: () => Date.now(),
    createUuid: () => `signal-${++seq}`
  };
  properties.set('SUPABASE_SHEET_TRIGGER_BINDINGS_V1', JSON.stringify({
    edit: { handler: 'handleTransportSheetEdit', spreadsheetId: 'transport-sheet' },
    change: { handler: 'handleTransportSheetChange', spreadsheetId: 'transport-sheet' }
  }));
  const edit = { triggerUid: 'edit', range: { getGridId: () => 731, getRow: () => 1361, getNumRows: () => 1 } };
  h.signalService.record(edit, 'transport', 'handleTransportSheetEdit', 'transport-sheet', context);
  h.signalService.record({ triggerUid: 'change', changeType: 'INSERT_ROW' }, 'transport', 'handleTransportSheetChange', 'transport-sheet', context);
  return h;
}

test('a burst of ordinary transport edits merges into one exact-month foreground scope', () => {
  const h = scopedEditHarness();
  const range = { getRow: () => 1361, getNumRows: () => 10 };
  for (let index = 0; index < 10; index++) h.service.syncTransportSheetChange('EDIT', 'NL_VanChuyen', range);
  const pending = JSON.parse(h.properties.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026'));
  assert.equal(pending.full, false);
  assert.equal(pending.includeAll, false);
  assert.equal(pending.verificationPasses, 0);
  assert.equal(pending.refreshDashboard, true);
  assert.deepEqual(plain(pending.sheets), ['NL_VanChuyen']);
  assert.deepEqual(plain(pending.months), ['2026-10']);
  assert.deepEqual(plain(pending.priorityMonths), ['2026-10']);
});

test('structural transport changes still retain a full verified scope', () => {
  const h = scopedEditHarness();
  h.service.syncTransportSheetChange('REMOVE_ROW', 'NL_VanChuyen', null);
  const pending = JSON.parse(h.properties.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026'));
  assert.equal(pending.full, true);
  assert.equal(pending.includeAll, true);
  assert.equal(pending.verificationPasses, 1);
});

test('LockService pressure defers an edit without falsely acknowledging its queue request', () => {
  const h = scopedEditHarness({ lockError: true });
  const result = h.service.syncTransportSheetChange('EDIT', 'NL_VanChuyen', null);
  assert.equal(result.ok, false);
  assert.equal(result.queued, false);
  assert.equal(result.deferred, true);
  assert.equal(h.properties.has('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026'), false);
});

test('narrow transport plans never discover unrelated historical manage months', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(read('TransportRefreshWorker.gs'), sandbox);
  const tasks = sandbox.TransportRefreshWorker.buildCacheTasks({
    full: false, includeAll: false, sheets: ['NL_VanChuyen'], months: ['2026-10'], priorityMonths: ['2026-10']
  }, { currentMonth: '2026-10', catalogForms: [] });
  assert.equal(plain(tasks).some((task) => task[0] === 'discoverManage'), false);
  assert.ok(plain(tasks).some((task) => task.join(':') === 'manageMonth:NL_VanChuyen:2026-10'));
});

test('signal drain coalesces row scopes before enqueueing transport and Fund work', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /coalesceSignalScopes_\(scopes, transportSheetNames\)/);
  assert.match(source, /coalesceSignalScopes_\(scopes, fundSheetNames\)/);
  assert.match(source, /sheet\.getRange\(Number\(scope\.startRow\), 1, Number\(scope\.numRows\), 1\)/);
});

test('mixed transport signals keep exact edit work foreground and move full verification to background', () => {
  const h = mixedSignalHarness();
  const signal = JSON.parse(h.properties.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026'));
  assert.deepEqual(plain(signal.eventTypes), ['EDIT', 'INSERT_ROW']);
  assert.deepEqual(plain(signal.scopes), [{ gridId: 731, startRow: 1361, numRows: 1 }]);
  const future = String(Date.now() + 60 * 60 * 1000);
  for (const key of [
    'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_REALTIME_HEARTBEAT_NEXT_AT',
    'SUPABASE_SOURCE_POLL_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT',
    'SUPABASE_TRIP_NOTIFICATION_NEXT_AT'
  ]) h.properties.set(`${key}_2026`, future);
  const tick = h.service.syncRealtimeCache();
  assert.equal(tick.ok, true);
  const foreground = JSON.parse(h.properties.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026'));
  assert.equal(foreground.full, false);
  assert.equal(foreground.includeAll, false);
  assert.equal(foreground.refreshDashboard, true);
  assert.deepEqual(plain(foreground.sheets), ['NL_TaiXe']);
  assert.deepEqual(plain(foreground.months), ['2026-10']);
  assert.deepEqual(plain(foreground.sources), ['sheet:NL_TaiXe:EDIT']);
  const background = JSON.parse(h.properties.get('SUPABASE_PENDING_TRANSPORT_BACKGROUND_SYNC_2026'));
  assert.equal(background.full, true);
  assert.equal(background.includeAll, true);
  assert.equal(background.verificationPasses, 1);
  assert.equal(background.sheets.length, 8);
  assert.equal(background.catalogs.length, 13);
  assert.deepEqual(plain(background.sources), ['signal:transport:BACKGROUND:INSERT_ROW']);
  assert.equal(h.properties.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026_CONSUMED'), signal.token);
});
