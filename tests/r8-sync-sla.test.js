const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const read = (file) => fs.readFileSync(file, 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function scopedEditHarness({ lockError = false } = {}) {
  const properties = new Map();
  const dates = Array.from({ length: 10 }, (_, index) => new Date(2026, 9, 10 + index));
  const sheet = {
    getLastColumn: () => 2,
    getLastRow: () => 2000,
    getRange(row, column, numRows) {
      if (row === 2 && numRows === 1) return { getDisplayValues: () => [['Ngày', 'Tháng']] };
      assert.equal(column, 1);
      return { getValues: () => dates.slice(0, numRows).map((date) => [date]) };
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
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
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
    SupabaseSyncStatusRepository: { upsert() {} }
  });
  for (const file of ['ManageSyncService.gs', 'ManualReportRefreshQueueService.gs', 'SupabaseService.gs']) {
    vm.runInContext(read(file), sandbox);
  }
  return { service: sandbox.SupabaseService, properties };
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
