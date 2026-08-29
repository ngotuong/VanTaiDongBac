const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadEntry(buildResult, reservedRange = null, options = {}) {
  const events = [];
  const properties = new Map();
  if (reservedRange) {
    properties.set('WRITE_JOB_RESERVATION_job-123', JSON.stringify({ sheetName: 'NL_VanChuyen', startRow: reservedRange.getRow() }));
  }
  const liveHeaders = {
    NL_VanChuyen: options.liveVanChuyenHeaders || ['Ngày', 'Tháng', 'Biển số', 'Dự án', 'Số chuyến', 'Số phiếu', 'Ghi chú', 'Khối lượng thực tế (m³)'],
    NL_Dau: ['Ngày', 'Tháng', 'Biển số', 'Nguồn dầu', 'Số lít', 'Giá dầu', 'Thành tiền', 'Nguồn chi', 'Công ty sở hữu', 'Ghi Chú']
  };
  function makeSheet(sheetName) { return {
    getName: () => sheetName,
    getLastColumn: () => liveHeaders[sheetName].length,
    getMaxColumns: () => 12,
    getRange(row, column, rowCount, columnCount) {
      if (row === 2 && rowCount === 1) {
        return { getDisplayValues: () => [liveHeaders[sheetName]], getValues: () => [liveHeaders[sheetName]] };
      }
      events.push({ type: 'range', row, column, rowCount, columnCount });
      return { getRow: () => row };
    }
  }; }
  const lock = { waitLock: (ms) => events.push({ type: 'lock', ms }), releaseLock: () => events.push({ type: 'unlock' }) };
  const context = vm.createContext({
    SheetService: {},
    LockService: { getScriptLock: () => lock },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || null,
      setProperty(key, value) { properties.set(key, value); events.push({ type: 'reservation', key, value }); },
      deleteProperty(key) { properties.delete(key); events.push({ type: 'release', key }); }
    }) },
    ValidationService: { buildRows: () => buildResult }
  });
  new vm.Script(read('EntryService.gs'), { filename: 'EntryService.gs#test' }).runInContext(context);
  const service = context.EntryService;
  const submitContext = {
    sheets: {
      vanChuyen: { name: 'NL_VanChuyen', headerRow: 2 },
      dau: { name: 'NL_Dau', headerRow: 2 }
    },
    getSpreadsheet: () => ({ getSheetByName: (sheetName) => makeSheet(sheetName) }),
    getCatalogs: () => ({ vehicles: [] }),
    getAppendRow: () => 10,
    ensureRows: (targetSheet, lastRow) => events.push({ type: 'ensure', targetSheet, lastRow }),
    writeRows: (targetSheet, startRow, values, skipped) => events.push({ type: 'write', targetSheet, startRow, values, skipped }),
    clearAfterSubmitCache: () => events.push({ type: 'clearCache' })
  };
  submitContext.sheets.vanChuyen.headers = ['Ngày', 'Tháng', 'Biển số', 'Dự án', 'Số chuyến', 'Số phiếu', 'Ghi chú', 'Khối lượng thực tế (m³)'];
  submitContext.sheets.vanChuyen.headerAliases = { 'Biển số': ['Biển số xe'] };
  submitContext.sheets.vanChuyen.computedHeaders = ['Tháng'];
  submitContext.sheets.dau.headers = liveHeaders.NL_Dau;
  submitContext.sheets.dau.computedHeaders = ['Tháng', 'Thành tiền', 'Công ty sở hữu'];
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
  assert.deepEqual(JSON.parse(JSON.stringify(events.find((event) => event.type === 'write').skipped)), [1]);
  assert.equal(events.filter((event) => event.type === 'clearCache').length, 1);
  assert.equal(events.at(-1).type, 'unlock');
});

test('queued submit stores a stable Script Property reservation and replay reuses its original range', () => {
  const result = { values: [[1], [2]], errors: [], warnings: [] };
  const first = loadEntry(result);
  const firstResponse = first.service.submitRowsWithContext('vanChuyen', [{}, {}], { jobId: 'job-123' }, first.submitContext);
  assert.equal(firstResponse.startRow, 10);
  assert.deepEqual(first.events.find((event) => event.type === 'reservation'), {
    type: 'reservation', key: 'WRITE_JOB_RESERVATION_job-123',
    value: JSON.stringify({ sheetName: 'NL_VanChuyen', startRow: 10 })
  });
  assert.deepEqual(first.events.find((event) => event.type === 'range'), {
    type: 'range', row: 10, column: 1, rowCount: 1, columnCount: 12
  });

  const replayRange = { getRow: () => 27 };
  const replay = loadEntry(result, replayRange);
  const replayResponse = replay.service.submitRowsWithContext('vanChuyen', [{}, {}], { jobId: 'job-123' }, replay.submitContext);
  assert.equal(replayResponse.startRow, 27);
  assert.equal(replayResponse.idempotentReplay, true);
  assert.equal(replay.events.some((event) => event.type === 'reservation'), false);
});

test('fuel submit preserves formula/helper skip columns and queued validation errors never write', () => {
  const valid = loadEntry({ values: [[1, 2, 3, 4, 5, 6, '', 8, '']], errors: [], warnings: [] });
  valid.service.submitRowsWithContext('dau', [{}], null, valid.submitContext);
  assert.deepEqual(JSON.parse(JSON.stringify(valid.events.find((event) => event.type === 'write').skipped)), [1, 6, 8]);

  const invalid = loadEntry({ values: [[1]], errors: ['invalid'], warnings: ['warning'] });
  const response = invalid.service.submitRowsWithContext('vanChuyen', [{}], { jobId: 'job-invalid' }, invalid.submitContext);
  assert.equal(response.ok, false);
  assert.equal(response.inserted, 0);
  assert.equal(invalid.events.some((event) => event.type === 'write'), false);
  assert.equal(invalid.events.at(-1).type, 'unlock');
});

test('transport submit accepts the renamed NL_VanChuyen plate header and its controlled legacy alias only', () => {
  const result = { values: [[1]], errors: [], warnings: [] };
  const renamed = loadEntry(result);
  assert.equal(renamed.service.submitRowsWithContext('vanChuyen', [{}], null, renamed.submitContext).ok, true);

  const legacyHeaders = ['Ngày', 'Tháng', 'Biển số xe', 'Dự án', 'Số chuyến', 'Số phiếu', 'Ghi chú', 'Khối lượng thực tế (m³)'];
  const legacy = loadEntry(result, null, { liveVanChuyenHeaders: legacyHeaders });
  assert.equal(legacy.service.submitRowsWithContext('vanChuyen', [{}], null, legacy.submitContext).ok, true);

  const invalidHeaders = ['Ngày', 'Tháng', 'Xe', 'Dự án', 'Số chuyến', 'Số phiếu', 'Ghi chú', 'Khối lượng thực tế (m³)'];
  const invalid = loadEntry(result, null, { liveVanChuyenHeaders: invalidHeaders });
  assert.throws(
    () => invalid.service.submitRowsWithContext('vanChuyen', [{}], null, invalid.submitContext),
    /chap nhan "Biển số" hoac "Biển số xe", dang la "Xe"/
  );
});

test('EntryService owns submit orchestration while SheetService retains only the compatibility adapter', () => {
  const entry = read('EntryService.gs');
  const sheet = read('SheetService.gs');
  assert.match(entry, /function submitRowsWithContext/);
  assert.match(sheet, /EntryService\.submitRowsWithContext/);
  assert.doesNotMatch(sheet, /addDeveloperMetadata\('WRITE_JOB_ID'/);
  assert.doesNotMatch(sheet, /var idempotentReplay = Boolean\(reservedRange\)/);
});
