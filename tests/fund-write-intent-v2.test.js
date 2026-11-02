const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const HEADERS = ['Intent ID', 'Intent Hash', 'Sheet', 'State', 'First Row', 'Row Count', 'Rows JSON', 'Meta JSON', 'Result JSON', 'Updated At'];

function harness({ withJournal = true } = {}) {
  const business = new Map();
  const notes = new Map();
  const metadata = [];
  const journal = [HEADERS.slice()];
  let flushes = 0;
  const key = (row, column) => `${row}:${column}`;
  const rowRange = (row) => ({
    getRow: () => row,
    addDeveloperMetadata(metadataKey, value) { metadata.push({ key: metadataKey, value, row }); }
  });
  const journalSheet = {
    getLastRow: () => journal.length,
    getRange(row, column, height = 1, width = 1) {
      return {
        getDisplayValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => String(journal[row - 1 + i]?.[column - 1 + j] ?? ''))),
        getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => journal[row - 1 + i]?.[column - 1 + j] ?? '')),
        setValues(matrix) { matrix.forEach((values, i) => { journal[row - 1 + i] = values.slice(); }); }
      };
    }
  };
  const spreadsheet = { getSheetByName: (name) => name === 'SYS_FUND_WRITE_INTENTS' && withJournal ? journalSheet : null };
  const sheet = {
    getName: () => 'NHAP_THUCHI',
    getParent: () => spreadsheet,
    getMaxRows: () => 2000,
    insertRowsAfter() {},
    createDeveloperMetadataFinder() {
      let wanted = '';
      return {
        withKey(value) { wanted = value; return this; },
        find: () => metadata.filter((item) => item.key === wanted).map((item) => ({
          getValue: () => item.value,
          getLocation: () => ({ getRow: () => rowRange(item.row) })
        }))
      };
    },
    getRange(row, column, height = 1, width = 1) {
      if (typeof row === 'string') return rowRange(Number(row.split(':')[0]));
      return {
        getRow: () => row,
        getNote: () => notes.get(row) || '',
        getNotes: () => Array.from({ length: height }, (_, i) => [notes.get(row + i) || '']),
        setNote: (value) => notes.set(row, value),
        getDisplayValue: () => String(business.get(key(row, column)) ?? ''),
        getDisplayValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => String(business.get(key(row + i, column + j)) ?? ''))),
        getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => business.get(key(row + i, column + j)) ?? ''))
      };
    }
  };
  const sandbox = vm.createContext({
    Date,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => crypto.createHash('sha256').update(value).digest(),
      base64EncodeWebSafe: (value) => Buffer.from(value).toString('base64url')
    },
    SpreadsheetApp: { flush: () => { flushes++; } }
  });
  vm.runInContext(fs.readFileSync('FundWriteIntentRepository.gs', 'utf8'), sandbox);
  return { repo: sandbox.FundWriteIntentRepository, sheet, business, notes, metadata, journal, key, flushes: () => flushes };
}

test('Fund V2 journal keeps JSON out of voucher notes and follows row metadata moves', () => {
  const h = harness();
  const intent = { transactions: [{ amount: 5000000 }] };
  const rows = [['261101000003', new Date('2026-10-31T17:00:00.000Z'), '', 'Ứng lương', '', 5000000, 'Tường', 'Lái xe', 'Vũ Văn Thuật T10', '', '', '']];
  const record = h.repo.prepare(h.sheet, 'web-job', intent, rows, { transaction: true }, () => 3);
  assert.equal(record.storage, 'v2');
  assert.equal(h.notes.size, 0);
  assert.equal(h.journal.length, 2);
  assert.equal(h.metadata.length, 1);
  rows[0].forEach((value, index) => h.business.set(h.key(3, index + 1), value));
  assert.equal(h.repo.verifyRows(h.sheet, record), true);
  h.repo.complete(h.sheet, record, { ok: true, firstRow: 3 });
  assert.equal(h.journal[1][3], 'complete');

  rows[0].forEach((value, index) => { h.business.delete(h.key(3, index + 1)); h.business.set(h.key(4, index + 1), value); });
  h.metadata[0].row = 4;
  const replay = h.repo.find(h.sheet, 'web-job', intent);
  assert.equal(replay.firstRow, 4);
  assert.equal(h.repo.verifyRows(h.sheet, replay), true);
});

test('Fund V2 journal rejects payload changes, missing markers and edited vouchers', () => {
  const h = harness();
  const intent = { transactions: [{ amount: 1 }] };
  const row = ['261101000001', new Date('2026-10-31T17:00:00.000Z'), '', 'Ứng lương', '', 1, 'A', 'B', 'C', '', '', ''];
  const record = h.repo.prepare(h.sheet, 'job', intent, [row], { transaction: true }, () => 2);
  assert.throws(() => h.repo.find(h.sheet, 'job', { transactions: [{ amount: 2 }] }), /nội dung khác/);
  row.forEach((value, index) => h.business.set(h.key(2, index + 1), value));
  h.repo.complete(h.sheet, record, { ok: true });
  h.business.set(h.key(2, 1), '261101000009');
  assert.throws(() => h.repo.verifyRows(h.sheet, h.repo.find(h.sheet, 'job', intent)), /REQUIRES_RECONCILIATION/);
  h.metadata.length = 0;
  assert.throws(() => h.repo.find(h.sheet, 'job', intent), /không còn marker dòng/);
});

test('legacy audit marks the observed voucher journal drift as a blocker', () => {
  const h = harness({ withJournal: false });
  const intent = { transactions: [{ amount: 5000000 }] };
  const expected = [['261101000001', { date: '2026-10-31T17:00:00.000Z' }, '', 'Ứng lương', '', 5000000, 'Tường', 'Lái xe', 'Vũ Văn Thuật T10', '', '', '']];
  const hash = crypto.createHash('sha256').update(JSON.stringify(intent)).digest('base64url');
  h.notes.set(1096, `VTDB_INTENT_V1:${JSON.stringify({ id: 'web-job', hash, state: 'complete', rows: expected, meta: { transaction: true }, result: { ok: true } })}`);
  h.business.set(h.key(1096, 1), '261101000003');
  const audit = h.repo.auditLegacy(h.sheet);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].status, 'blocked');
  assert.equal(audit[0].reason, 'row-drift');
  assert.equal(audit[0].expectedVoucher, '261101000001');
  assert.equal(audit[0].actualVoucher, '261101000003');
});

test('legacy migration copies only an exact row to V2 before clearing its visible note', () => {
  const h = harness();
  const row = ['261101000004', new Date('2026-10-31T17:00:00.000Z'), '', 'Ứng lương', '', 3000000, 'Tường', 'Lái xe', 'Exact row', '', '', ''];
  const storedRows = row.map((value) => value instanceof Date ? { date: value.toISOString() } : value);
  h.notes.set(10, `VTDB_INTENT_V1:${JSON.stringify({ id: 'exact-job', hash: 'hash', state: 'complete', rows: [storedRows], meta: { transaction: true }, result: { ok: true } })}`);
  row.forEach((value, index) => h.business.set(h.key(10, index + 1), value));
  const audit = h.repo.auditLegacy(h.sheet);
  assert.equal(audit[0].status, 'migratable');
  const migrated = h.repo.migrateLegacyRecord(h.sheet, audit[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), { id: 'exact-job', row: 10, state: 'complete' });
  assert.equal(h.notes.get(10), '');
  assert.equal(h.metadata.length, 1);
  assert.equal(h.journal.length, 2);
  assert.equal(h.journal[1][0], 'exact-job');
});

test('controlled migration source remains approval-gated and never rewrites drifted rows', () => {
  const source = fs.readFileSync('FundWriteIntentMigration.gs', 'utf8');
  assert.match(source, /prepareFundWriteIntentMigration/);
  assert.match(source, /approveFundWriteIntentMigration/);
  assert.match(source, /runFundWriteIntentMigration/);
  assert.match(source, /item\.status === 'migratable'/);
  assert.doesNotMatch(source, /setValue\([^\n]*expectedVoucher/);
});
