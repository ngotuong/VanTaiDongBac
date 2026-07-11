const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadEntry(buildResult, reservedRange = null) {
  const events = [];
  const metadataRange = {
    addDeveloperMetadata(key, value, visibility) { events.push({ type: 'metadata', key, value, visibility }); }
  };
  const sheet = {
    getLastColumn: () => 9,
    getRange(row, column, rowCount, columnCount) {
      if (row === 2 && rowCount === 1) {
        return { getValues: () => [['Ngày', 'Tháng', 'Xe', 'Nguồn', 'Lít', 'Giá', 'Thành tiền', 'Nguồn chi', 'Công ty sở hữu']] };
      }
      return metadataRange;
    },
    createDeveloperMetadataFinder() {
      return {
        withKey() { return this; },
        withValue() { return this; },
        find: () => reservedRange ? [{ getLocation: () => ({ getRange: () => reservedRange }) }] : []
      };
    }
  };
  const lock = { waitLock: (ms) => events.push({ type: 'lock', ms }), releaseLock: () => events.push({ type: 'unlock' }) };
  const context = vm.createContext({
    SheetService: {},
    LockService: { getScriptLock: () => lock },
    SpreadsheetApp: { DeveloperMetadataVisibility: { DOCUMENT: 'DOCUMENT' } },
    ValidationService: { buildRows: () => buildResult }
  });
  new vm.Script(read('EntryService.gs'), { filename: 'EntryService.gs#test' }).runInContext(context);
  const service = context.EntryService;
  const submitContext = {
    sheets: {
      vanChuyen: { name: 'NL_VanChuyen', headerRow: 2 },
      dau: { name: 'NL_Dau', headerRow: 2 }
    },
    getSpreadsheet: () => ({ getSheetByName: () => sheet }),
    getCatalogs: () => ({ vehicles: [] }),
    getAppendRow: () => 10,
    ensureRows: (targetSheet, lastRow) => events.push({ type: 'ensure', targetSheet, lastRow }),
    writeRows: (targetSheet, startRow, values, skipped) => events.push({ type: 'write', targetSheet, startRow, values, skipped }),
    clearAfterSubmitCache: () => events.push({ type: 'clearCache' })
  };
  return { events, service, submitContext };
}

test('transport submit preserves validation result, append range, cache callback, and result shape', () => {
  const result = { values: [['2026-07-11', '', '30A']], errors: [], warnings: ['synthetic warning'] };
  const { events, service, submitContext } = loadEntry(result);
  const response = service.submitRowsWithContext('vanChuyen', [{}], null, submitContext);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    ok: true, inserted: 1, startRow: 10, sheetName: 'NL_VanChuyen',
    idempotentReplay: false, errors: [], warnings: ['synthetic warning']
  });
  assert.equal(events.find((event) => event.type === 'ensure').lastRow, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(events.find((event) => event.type === 'write').skipped)), []);
  assert.equal(events.filter((event) => event.type === 'clearCache').length, 1);
  assert.equal(events.at(-1).type, 'unlock');
});

test('queued submit attaches stable WRITE_JOB_ID metadata and replay reuses its original range', () => {
  const result = { values: [[1], [2]], errors: [], warnings: [] };
  const first = loadEntry(result);
  const firstResponse = first.service.submitRowsWithContext('vanChuyen', [{}, {}], { jobId: 'job-123' }, first.submitContext);
  assert.equal(firstResponse.startRow, 10);
  assert.deepEqual(first.events.find((event) => event.type === 'metadata'), {
    type: 'metadata', key: 'WRITE_JOB_ID', value: 'job-123', visibility: 'DOCUMENT'
  });

  const replayRange = { getRow: () => 27 };
  const replay = loadEntry(result, replayRange);
  const replayResponse = replay.service.submitRowsWithContext('vanChuyen', [{}, {}], { jobId: 'job-123' }, replay.submitContext);
  assert.equal(replayResponse.startRow, 27);
  assert.equal(replayResponse.idempotentReplay, true);
  assert.equal(replay.events.some((event) => event.type === 'metadata'), false);
});

test('fuel submit preserves formula/helper skip columns and queued validation errors never write', () => {
  const valid = loadEntry({ values: [[1, 2, 3, 4, 5, 6, '', 8, '']], errors: [], warnings: [] });
  valid.service.submitRowsWithContext('dau', [{}], null, valid.submitContext);
  assert.deepEqual(JSON.parse(JSON.stringify(valid.events.find((event) => event.type === 'write').skipped)), [6, 8]);

  const invalid = loadEntry({ values: [[1]], errors: ['invalid'], warnings: ['warning'] });
  const response = invalid.service.submitRowsWithContext('vanChuyen', [{}], { jobId: 'job-invalid' }, invalid.submitContext);
  assert.equal(response.ok, false);
  assert.equal(response.inserted, 0);
  assert.equal(invalid.events.some((event) => event.type === 'write'), false);
  assert.equal(invalid.events.at(-1).type, 'unlock');
});

test('EntryService owns submit orchestration while SheetService retains only the compatibility adapter', () => {
  const entry = read('EntryService.gs');
  const sheet = read('SheetService.gs');
  assert.match(entry, /function submitRowsWithContext/);
  assert.match(sheet, /EntryService\.submitRowsWithContext/);
  assert.doesNotMatch(sheet, /addDeveloperMetadata\('WRITE_JOB_ID'/);
  assert.doesNotMatch(sheet, /var idempotentReplay = Boolean\(reservedRange\)/);
});
