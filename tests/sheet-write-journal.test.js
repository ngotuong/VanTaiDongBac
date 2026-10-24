const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'SheetWriteJournal.gs'), 'utf8');

function fixture() {
  const properties = new Map();
  const metadata = [];
  const rowDimensionRequests = [];
  function makeRange(row, rows, columns) {
    return {
      row,
      values: Array.from({ length: rows }, () => Array(columns).fill('')),
      getRow() { return this.row; },
      getNumRows: () => rows,
      getNumColumns: () => columns,
      getValues() { return this.values; },
      addDeveloperMetadata(key, value) {
        const range = this;
        metadata.push({
          getKey: () => key,
          getValue: () => value,
          getLocation: () => ({ getRow: () => range })
        });
        return this;
      }
    };
  }
  const ranges = new Map();
  const sheet = {
    getName: () => 'NL_VanChuyen',
    getMaxColumns: () => 3,
    getRange(row, column, rows, columns) {
      if (typeof row === 'string') {
        const match = /^(\d+):\1$/.exec(row);
        if (!match) throw new Error(`Unsupported A1 range: ${row}`);
        rowDimensionRequests.push(row);
        row = Number(match[1]);
        column = 1;
        rows = 1;
        columns = this.getMaxColumns();
      }
      const key = `${row}:${rows}:${columns}`;
      if (!ranges.has(key)) ranges.set(key, makeRange(row, rows, columns));
      return ranges.get(key);
    },
    createDeveloperMetadataFinder() {
      let key = '';
      return {
        withKey(next) { key = next; return this; },
        find: () => metadata.filter((item) => item.getKey() === key)
      };
    }
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: (key) => properties.delete(key)
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest(_algorithm, value) { return [...crypto.createHash('sha256').update(value, 'utf8').digest()].map((byte) => byte > 127 ? byte - 256 : byte); }
    }
  });
  new vm.Script(source, { filename: 'SheetWriteJournal.gs#test' }).runInContext(context);
  return { service: context.SheetWriteJournal, sheet, properties, metadata, rowDimensionRequests };
}

const options = { startRow: 10, intendedRows: [['A', '', 12], ['B', '', 18]], writableColumns: [0, 2] };
const writeContext = { jobId: 'job-123' };

test('journal reserves a marked range and exact replay never rewrites it', () => {
  const current = fixture();
  const prepared = current.service.prepare(current.sheet, writeContext, options);
  assert.equal(prepared.shouldWrite, true);
  assert.equal(current.metadata.length, 1);
  assert.deepEqual(current.rowDimensionRequests, ['10:10']);
  assert.ok(current.properties.has('WRITE_JOB_JOURNAL_job-123'));
  prepared.range.values = [['A', 'formula', 12], ['B', 'formula', 18]];

  const replay = current.service.prepare(current.sheet, writeContext, options);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.shouldWrite, false);
});

test('journal follows the metadata range after its row moves', () => {
  const current = fixture();
  current.service.prepare(current.sheet, writeContext, options);
  current.metadata[0].getLocation().getRow().row = 27;
  current.sheet.getRange(27, 1, 2, 3).values = [['A', '', 12], ['B', '', 18]];
  const replay = current.service.prepare(current.sheet, writeContext, options);
  assert.equal(replay.startRow, 27);
  assert.equal(replay.idempotentReplay, true);
});

test('blank marked range resumes a crash-before-write but partial or changed data requires reconciliation', () => {
  const current = fixture();
  const prepared = current.service.prepare(current.sheet, writeContext, options);
  const resumed = current.service.prepare(current.sheet, writeContext, options);
  assert.equal(resumed.shouldWrite, true);
  prepared.range.values = [['A', '', 12], ['', '', '']];
  assert.throws(() => current.service.prepare(current.sheet, writeContext, options), /REQUIRES_RECONCILIATION/);
});

test('legacy row-number reservation is replay-only and never overwrites drift', () => {
  const current = fixture();
  current.properties.set('WRITE_JOB_RESERVATION_job-123', JSON.stringify({ sheetName: 'NL_VanChuyen', startRow: 10 }));
  current.sheet.getRange(10, 1, 1, 3).values = [['OTHER', '', 99]];
  assert.throws(
    () => current.service.prepare(current.sheet, writeContext, { startRow: 10, intendedRows: [['A', '', 12]], writableColumns: [0, 2] }),
    /REQUIRES_RECONCILIATION/
  );
});

test('legacy reservation accepts an exact existing multi-row write but cannot resume an empty reservation', () => {
  const exact = fixture();
  exact.properties.set('WRITE_JOB_RESERVATION_job-123', JSON.stringify({ sheetName: 'NL_VanChuyen', startRow: 10 }));
  exact.sheet.getRange(10, 1, 2, 3).values = [['A', '', 12], ['B', '', 18]];
  const replay = exact.service.prepare(exact.sheet, writeContext, options);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.shouldWrite, false);

  const empty = fixture();
  empty.properties.set('WRITE_JOB_RESERVATION_job-123', JSON.stringify({ sheetName: 'NL_VanChuyen', startRow: 10 }));
  assert.throws(() => empty.service.prepare(empty.sheet, writeContext, options), /REQUIRES_RECONCILIATION/);
});

test('a reused job id with a changed intent hash is rejected before writing', () => {
  const current = fixture();
  current.service.prepare(current.sheet, writeContext, options);
  assert.throws(
    () => current.service.prepare(current.sheet, writeContext, { ...options, intendedRows: [['CHANGED', '', 12], ['B', '', 18]] }),
    /intent hash/
  );
});

test('a new job never reserves or overwrites a nonblank append target', () => {
  const current = fixture();
  current.sheet.getRange(10, 1, 2, 3).values = [['OTHER', '', 99], ['', '', '']];
  assert.throws(() => current.service.prepare(current.sheet, writeContext, options), /REQUIRES_RECONCILIATION/);
  assert.equal(current.metadata.length, 0);
  assert.equal(current.properties.size, 0);
});
