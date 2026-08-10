const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadTempService(state) {
  const lock = { waitLock: () => { state.locked = true; }, releaseLock: () => { state.released = true; } };
  const context = vm.createContext({
    console,
    LockService: { getScriptLock: () => lock },
    SpreadsheetApp: { flush: () => { state.flushes += 1; } },
    Utilities: { getUuid: () => '12345678-abcd' }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#temp-test' }).runInContext(context);
  new vm.Script(read('ReportTempSheetService.gs'), { filename: 'ReportTempSheetService.gs#test' }).runInContext(context);
  return context.ReportTempSheetService;
}

test('temp report computation uses a unique hidden copy, preserves original B1, and always deletes the copy', () => {
  const state = { flushes: 0, deleted: [], locked: false, released: false };
  const original = { b1: '07/2026' };
  const temp = {
    name: 'Bản sao của BC_TongQuan', b1: '', hidden: false,
    setName(name) { this.name = name; }, hideSheet() { this.hidden = true; },
    getRange(a1) { assert.equal(a1, 'B1'); return { setValue: (value) => { this.b1 = value; } }; }
  };
  const source = { getName: () => 'BC_TongQuan', copyTo: () => temp };
  const ss = {
    getSheets: () => [source],
    deleteSheet: (sheet) => state.deleted.push(sheet)
  };
  const service = loadTempService(state);
  const result = plain(service.computeDetails(ss, source, ['05/2026', '06/2026'], {
    clean: (value) => String(value || '').trim(),
    parseMonth: (value) => value,
    normalizeMonth: (value) => value,
    readDetails: (sheet) => [[sheet.b1, 'detail']]
  }));

  assert.deepEqual(result, { '05/2026': [['05/2026', 'detail']], '06/2026': [['06/2026', 'detail']] });
  assert.equal(original.b1, '07/2026');
  assert.equal(temp.name, '_TMP_BC_TongQuan_12345678');
  assert.equal(temp.hidden, true);
  assert.equal(state.flushes, 2);
  assert.deepEqual(state.deleted, [temp]);
  assert.equal(state.released, true);
});

test('temp cleanup recognizes all legacy patterns and reports deleted names', () => {
  const state = { flushes: 0, deleted: [] };
  const names = ['_TMP_BC_TongQuan_abcd', 'Bản sao của BC_TongQuan 2', 'Copy of BC_TongQuan', 'BC_TongQuan'];
  const sheets = names.map((name) => ({ getName: () => name }));
  const ss = { getSheets: () => sheets, deleteSheet: (sheet) => state.deleted.push(sheet.getName()) };
  const result = plain(loadTempService(state).cleanupAndReport(ss));
  assert.deepEqual(result, { ok: true, deleted: names.slice(0, 3), count: 3 });
  assert.deepEqual(state.deleted, names.slice(0, 3));
});

function loadCacheRepository() {
  const properties = new Map();
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value)
    }) }
  });
  new vm.Script(read('SheetReportCacheRepository.gs'), { filename: 'SheetReportCacheRepository.gs#test' }).runInContext(context);
  return { properties, repository: context.SheetReportCacheRepository };
}

test('retired sheet report cache repository remains read-only and never recreates the sheet', () => {
  const stored = [];
  const sheet = {
    hidden: false,
    getLastRow: () => stored.length,
    hideSheet() { this.hidden = true; },
    getRange(row, column, rowCount, columnCount) {
      return {
        setValues(values) { values.forEach((value, index) => { stored[row - 1 + index] = value; }); },
        getValues() { return stored.slice(row - 1, row - 1 + rowCount); }
      };
    }
  };
  let currentSheet = null;
  const ss = { getSheetByName: () => currentSheet };
  const { repository } = loadCacheRepository();
  const options = { sheetName: 'SYS_ReportCache', cacheVersion: 'v13', dataVersion: 'data-1', clean: (value) => String(value || '').trim() };
  assert.deepEqual(plain(repository.readDetailsMap(ss, options)), {});
  assert.throws(() => repository.writeDetails(ss, { '2026-07': [['A', 'B', 'C', 'D', 'E']] }, options), /retired/);
  currentSheet = sheet;
  stored.push(['cacheVersion', 'dataVersion', 'monthKey', 'monthLabel', 'rowOrder', 'colA', 'colB', 'colC', 'colD', 'colE']);
  stored.push(['v13', 'data-1', '2026-07', '2026-07', 1, 'A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(plain(repository.readDetailsMap(ss, options)), { '2026-07': [['A', 'B', 'C', 'D', 'E']] });
  assert.deepEqual(plain(repository.readDetailsMap(ss, { ...options, dataVersion: 'other' })), {});
});

test('report infrastructure keeps versions in Script Properties and has no SYS_ReportCache runtime dependency', () => {
  const { properties, repository } = loadCacheRepository();
  assert.equal(repository.getDataVersion('REPORT_DATA_VERSION_V1'), '0');
  repository.bumpDataVersion('REPORT_DATA_VERSION_V1');
  assert.match(properties.get('REPORT_DATA_VERSION_V1'), /^\d+$/);

  const source = read('SheetService.gs');
  assert.match(source, /ReportTempSheetService\.computeDetails/);
  assert.match(source, /PropertiesService\.getScriptProperties\(\)\.getProperty\(REPORT_DATA_VERSION_PROP\)/);
  assert.match(source, /SupabaseReportCacheRepository\.readDetailsMap/);
  assert.doesNotMatch(source, /SheetReportCacheRepository\./);
  assert.doesNotMatch(source, /SYS_ReportCache/);
  assert.doesNotMatch(source, /sheet\.copyTo\(ss\)/);
  assert.doesNotMatch(source, /function getReportCacheSheet_/);
});
