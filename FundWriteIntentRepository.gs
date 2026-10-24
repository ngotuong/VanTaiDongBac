/** Durable append intent in the existing voucher cell note; no new Sheet column.
 * Caller holds the script lock. Prepare precedes values, complete follows verify.
 */
var FundWriteIntentRepository = (function () {
  var PREFIX = 'VTDB_INTENT_V1:';
  function canonical(value) {
    if (value && typeof value.getTime === 'function') return { date: value.toISOString() };
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).sort().forEach(function (key) { result[key] = canonical(value[key]); });
      return result;
    }
    return value === undefined || value === null ? '' : value;
  }
  function hash(value) {
    return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(canonical(value)), Utilities.Charset.UTF_8)).replace(/=+$/, '');
  }
  function find(sheet, id, intent) {
    var count = sheet.getMaxRows() - 1;
    if (count < 1) return null;
    var notes = sheet.getRange(2, 1, count, 1).getNotes();
    var found = null;
    notes.forEach(function (row, index) {
      var text = String(row[0] || '');
      if (text.indexOf(PREFIX) !== 0) return;
      var record = JSON.parse(text.slice(PREFIX.length));
      if (record.id !== id) return;
      if (found) throw new Error('REQUIRES_RECONCILIATION: Intent có nhiều marker; cần đối soát trước khi retry.');
      if (record.hash !== hash(intent)) throw new Error('Intent đã được dùng cho nội dung khác.');
      record.firstRow = index + 2;
      found = record;
    });
    return found;
  }
  function prepare(sheet, id, intent, rows, meta, getAppendRow) {
    var record = { id: id, hash: hash(intent), state: 'prepared', rows: canonical(rows), meta: meta || {} };
    var text = PREFIX + JSON.stringify(record);
    if (text.length > 40000) throw new Error('Intent quá lớn để lưu marker an toàn; chia nhỏ lệnh.');
    var firstRow = getAppendRow(sheet);
    var lastRow = firstRow + rows.length - 1;
    if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
    if (sheet.getRange(firstRow, 1).getNote()) throw new Error('Ô voucher có note; cần đối soát trước khi ghi.');
    sheet.getRange(firstRow, 1).setNote(text);
    SpreadsheetApp.flush();
    record.firstRow = firstRow;
    return record;
  }
  function rows(record) {
    return record.rows.map(function (row) { return row.map(function (value) {
      return value && typeof value === 'object' && value.date ? new Date(value.date) : value;
    }); });
  }
  function verifyRows(sheet, record) {
    var expected = rows(record);
    var actual = sheet.getRange(record.firstRow, 1, expected.length, expected[0].length).getValues();
    // Fund transaction/loan rows both end at L (Không qua Quỹ). Native
    // BOOLEAN validation seeds unused rows with false, not an empty string.
    // Only that checkbox may treat false as blank; other business cells and
    // a checked checkbox must still trigger partial-write/drift protection.
    var isOffsetColumn = function (col) { return col === 11 && expected[0].length === 12; };
    var blank = actual.every(function (row) { return row.every(function (cell, col) {
      return col === 10 && record.meta.transaction || cell === '' || cell === null || isOffsetColumn(col) && cell === false;
    }); });
    if (blank && record.state === 'prepared') return false;
    var normalize = function (matrix) { return matrix.map(function (row) { return row.map(function (value, col) {
      if (col === 10 && record.meta.transaction) return '';
      if (isOffsetColumn(col) && value === false) return '';
      if (typeof value === 'string' && /^'\s*=/.test(value)) return value.slice(1);
      return canonical(value);
    }); }); };
    if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
      throw new Error('REQUIRES_RECONCILIATION: Vùng intent đã thay đổi hoặc ghi một phần; cần đối soát exact rows, không append lại.');
    }
    return true;
  }
  function complete(sheet, record, result) {
    var stored = { id: record.id, hash: record.hash, state: 'complete', rows: record.rows, meta: record.meta, result: result };
    sheet.getRange(record.firstRow, 1).setNote(PREFIX + JSON.stringify(stored));
    SpreadsheetApp.flush();
  }
  return { find: find, prepare: prepare, rows: rows, verifyRows: verifyRows, complete: complete };
})();
