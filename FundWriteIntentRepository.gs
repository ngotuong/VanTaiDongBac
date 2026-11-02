/** Durable Fund append intent.
 * V2 keeps the payload in a hidden system sheet and uses row Developer Metadata
 * to follow row moves. Until the controlled migration creates that sheet, the
 * legacy voucher-cell note remains the compatibility store.
 */
var FundWriteIntentRepository = (function () {
  var LEGACY_PREFIX = 'VTDB_INTENT_V1:';
  var METADATA_KEY = 'FUND_WRITE_INTENT_V2';
  var JOURNAL_SHEET_NAME = 'SYS_FUND_WRITE_INTENTS';
  var JOURNAL_HEADERS = ['Intent ID', 'Intent Hash', 'Sheet', 'State', 'First Row', 'Row Count', 'Rows JSON', 'Meta JSON', 'Result JSON', 'Updated At'];

  function reconciliation_(message) {
    throw new Error('REQUIRES_RECONCILIATION: ' + message);
  }

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

  function parseJson_(raw, fallback) {
    if (raw === '' || raw === null || raw === undefined) return fallback;
    try { return JSON.parse(String(raw)); } catch (error) { reconciliation_('Journal Fund chứa JSON không hợp lệ.'); }
  }

  function parent_(sheet) {
    return sheet && typeof sheet.getParent === 'function' ? sheet.getParent() : null;
  }

  function journalSheet_(sheet) {
    var spreadsheet = parent_(sheet);
    return spreadsheet && typeof spreadsheet.getSheetByName === 'function' ? spreadsheet.getSheetByName(JOURNAL_SHEET_NAME) : null;
  }

  function assertJournalHeaders_(journalSheet) {
    var headers = journalSheet.getRange(1, 1, 1, JOURNAL_HEADERS.length).getDisplayValues()[0].map(function (value) { return String(value || '').trim(); });
    if (JSON.stringify(headers) !== JSON.stringify(JOURNAL_HEADERS)) reconciliation_('Sheet ' + JOURNAL_SHEET_NAME + ' sai header.');
  }

  function journalRecords_(journalSheet, id) {
    assertJournalHeaders_(journalSheet);
    var lastRow = journalSheet.getLastRow();
    if (lastRow < 2) return [];
    var matches = [];
    journalSheet.getRange(2, 1, lastRow - 1, JOURNAL_HEADERS.length).getValues().forEach(function (row, index) {
      if (String(row[0] || '') !== id) return;
      matches.push({
        id: String(row[0] || ''), hash: String(row[1] || ''), sheetName: String(row[2] || ''), state: String(row[3] || ''),
        storedFirstRow: Number(row[4] || 0), rowCount: Number(row[5] || 0), rows: parseJson_(row[6], []),
        meta: parseJson_(row[7], {}), result: parseJson_(row[8], null), journalRow: index + 2, storage: 'v2'
      });
    });
    return matches;
  }

  function metadataForJob_(sheet, id) {
    if (!sheet || typeof sheet.createDeveloperMetadataFinder !== 'function') return [];
    return sheet.createDeveloperMetadataFinder().withKey(METADATA_KEY).find().filter(function (metadata) {
      return String(metadata.getValue() || '').indexOf(id + '|') === 0;
    });
  }

  function rangeFromMetadata_(metadata) {
    var location = metadata && metadata.getLocation ? metadata.getLocation() : null;
    return location && location.getRow ? location.getRow() : null;
  }

  function markerValue_(record) {
    return record.id + '|' + record.hash;
  }

  function addMarker_(sheet, row, record) {
    if (!sheet || typeof sheet.createDeveloperMetadataFinder !== 'function') reconciliation_('Workbook chưa hỗ trợ Developer Metadata cho journal Fund V2.');
    sheet.getRange(String(row) + ':' + String(row)).addDeveloperMetadata(METADATA_KEY, markerValue_(record));
  }

  function writeJournalRecord_(journalSheet, record, journalRow) {
    var targetRow = journalRow || Math.max(2, journalSheet.getLastRow() + 1);
    journalSheet.getRange(targetRow, 1, 1, JOURNAL_HEADERS.length).setValues([[
      record.id, record.hash, record.sheetName, record.state, record.storedFirstRow || record.firstRow, record.rows.length,
      JSON.stringify(record.rows), JSON.stringify(record.meta || {}), record.result ? JSON.stringify(record.result) : '', new Date()
    ]]);
    return targetRow;
  }

  function findV2_(sheet, id, intent) {
    var journalSheet = journalSheet_(sheet);
    var metadata = metadataForJob_(sheet, id);
    if (!journalSheet) {
      if (metadata.length) reconciliation_('Marker Fund V2 còn tồn tại nhưng thiếu sheet journal.');
      return null;
    }
    var records = journalRecords_(journalSheet, id);
    if (!records.length && !metadata.length) return null;
    if (records.length > 1) reconciliation_('Intent Fund V2 có nhiều journal: ' + id + '.');
    if (metadata.length > 1) reconciliation_('Intent Fund V2 có nhiều marker dòng: ' + id + '.');
    if (!records.length) reconciliation_('Marker Fund V2 không có journal: ' + id + '.');
    var record = records[0];
    if (record.hash !== hash(intent)) throw new Error('Intent đã được dùng cho nội dung khác.');
    if (record.sheetName !== String(sheet.getName ? sheet.getName() : '')) reconciliation_('Journal Fund V2 trỏ sai sheet.');

    if (!metadata.length) {
      record.firstRow = record.storedFirstRow;
      if (record.state === 'prepared' && classifyRows_(sheet, record) === 'blank') {
        addMarker_(sheet, record.firstRow, record);
        SpreadsheetApp.flush();
        metadata = metadataForJob_(sheet, id);
      }
    }
    if (metadata.length !== 1) reconciliation_('Journal Fund V2 không còn marker dòng: ' + id + '.');
    if (String(metadata[0].getValue() || '') !== markerValue_(record)) reconciliation_('Marker Fund V2 sai intent hash.');
    var markedRange = rangeFromMetadata_(metadata[0]);
    if (!markedRange || typeof markedRange.getRow !== 'function') reconciliation_('Marker Fund V2 không còn trỏ tới dòng dữ liệu.');
    record.firstRow = markedRange.getRow();
    return record;
  }

  function findLegacy_(sheet, id, intent) {
    var count = sheet.getMaxRows() - 1;
    if (count < 1) return null;
    var found = null;
    sheet.getRange(2, 1, count, 1).getNotes().forEach(function (row, index) {
      var text = String(row[0] || '');
      if (text.indexOf(LEGACY_PREFIX) !== 0) return;
      var record = parseJson_(text.slice(LEGACY_PREFIX.length), null);
      if (!record || record.id !== id) return;
      if (found) reconciliation_('Intent có nhiều marker; cần đối soát trước khi retry.');
      if (record.hash !== hash(intent)) throw new Error('Intent đã được dùng cho nội dung khác.');
      record.firstRow = index + 2;
      record.storage = 'legacy-note';
      found = record;
    });
    return found;
  }

  function find(sheet, id, intent) {
    return findV2_(sheet, id, intent) || findLegacy_(sheet, id, intent);
  }

  function prepareV2_(sheet, id, intent, rows, meta, getAppendRow) {
    var journalSheet = journalSheet_(sheet);
    assertJournalHeaders_(journalSheet);
    if (journalRecords_(journalSheet, id).length || metadataForJob_(sheet, id).length) reconciliation_('Intent Fund V2 đã tồn tại trước khi prepare.');
    var firstRow = getAppendRow(sheet);
    var record = { id: id, hash: hash(intent), sheetName: String(sheet.getName() || ''), state: 'prepared',
      storedFirstRow: firstRow, firstRow: firstRow, rows: canonical(rows), meta: meta || {}, result: null, storage: 'v2' };
    var text = JSON.stringify(record.rows);
    if (text.length > 40000) throw new Error('Intent quá lớn để lưu journal an toàn; chia nhỏ lệnh.');
    var lastRow = firstRow + rows.length - 1;
    if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
    record.journalRow = writeJournalRecord_(journalSheet, record);
    addMarker_(sheet, firstRow, record);
    SpreadsheetApp.flush();
    return record;
  }

  function prepareLegacy_(sheet, id, intent, rows, meta, getAppendRow) {
    var record = { id: id, hash: hash(intent), state: 'prepared', rows: canonical(rows), meta: meta || {}, storage: 'legacy-note' };
    var text = LEGACY_PREFIX + JSON.stringify(record);
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

  function prepare(sheet, id, intent, rows, meta, getAppendRow) {
    return journalSheet_(sheet)
      ? prepareV2_(sheet, id, intent, rows, meta, getAppendRow)
      : prepareLegacy_(sheet, id, intent, rows, meta, getAppendRow);
  }

  function rows(record) {
    return record.rows.map(function (row) { return row.map(function (value) {
      return value && typeof value === 'object' && value.date ? new Date(value.date) : value;
    }); });
  }

  function normalizedRows_(matrix, record) {
    return matrix.map(function (row) { return row.map(function (value, col) {
      if (col === 10 && record.meta.transaction) return '';
      if (col === 11 && record.rows[0].length === 12 && value === false) return '';
      if (typeof value === 'string' && /^'\s*=/.test(value)) return value.slice(1);
      return canonical(value);
    }); });
  }

  function classifyRows_(sheet, record) {
    var expected = rows(record);
    var actual = sheet.getRange(record.firstRow, 1, expected.length, expected[0].length).getValues();
    var blank = actual.every(function (row) { return row.every(function (cell, col) {
      return col === 10 && record.meta.transaction || cell === '' || cell === null || col === 11 && expected[0].length === 12 && cell === false;
    }); });
    if (blank) return 'blank';
    return JSON.stringify(normalizedRows_(actual, record)) === JSON.stringify(normalizedRows_(expected, record)) ? 'exact' : 'drift';
  }

  function verifyRows(sheet, record) {
    var state = classifyRows_(sheet, record);
    if (state === 'blank' && record.state === 'prepared') return false;
    if (state !== 'exact') reconciliation_('Vùng intent đã thay đổi hoặc ghi một phần; cần đối soát exact rows, không append lại.');
    return true;
  }

  function complete(sheet, record, result) {
    if (record.storage === 'v2') {
      var journalSheet = journalSheet_(sheet);
      if (!journalSheet) reconciliation_('Thiếu sheet journal khi hoàn tất Fund V2.');
      record.state = 'complete';
      record.result = result;
      record.storedFirstRow = record.firstRow;
      writeJournalRecord_(journalSheet, record, record.journalRow);
    } else {
      var stored = { id: record.id, hash: record.hash, state: 'complete', rows: record.rows, meta: record.meta, result: result };
      sheet.getRange(record.firstRow, 1).setNote(LEGACY_PREFIX + JSON.stringify(stored));
    }
    SpreadsheetApp.flush();
  }

  function auditLegacy(sheet) {
    var count = sheet.getMaxRows() - 1;
    if (count < 1) return [];
    var seen = {};
    var items = [];
    sheet.getRange(2, 1, count, 1).getNotes().forEach(function (row, index) {
      var text = String(row[0] || '');
      if (text.indexOf(LEGACY_PREFIX) !== 0) return;
      var item = { row: index + 2, status: 'blocked', reason: '', id: '', state: '', record: null };
      try {
        var record = JSON.parse(text.slice(LEGACY_PREFIX.length));
        item.id = String(record.id || '');
        item.state = String(record.state || '');
        item.record = record;
        record.firstRow = item.row;
        record.storage = 'legacy-note';
        item.expectedVoucher = record.rows && record.rows[0] ? String(record.rows[0][0] || '') : '';
        item.actualVoucher = String(sheet.getRange(item.row, 1).getDisplayValue() || '');
        item.fingerprint = hash({ note: text, actual: sheet.getRange(item.row, 1, Math.max(1, record.rows ? record.rows.length : 1),
          record.rows && record.rows[0] ? record.rows[0].length : 1).getValues() });
        if (!item.id || !record.hash || !Array.isArray(record.rows) || !record.rows.length) item.reason = 'invalid-record';
        else if (seen[item.id]) item.reason = 'duplicate-id';
        else {
          seen[item.id] = true;
          var classification = classifyRows_(sheet, record);
          if (classification === 'drift') item.reason = 'row-drift';
          else if (classification === 'blank' && record.state !== 'prepared') item.reason = 'completed-row-blank';
          else { item.status = 'migratable'; item.reason = classification; }
        }
      } catch (error) { item.reason = 'invalid-json'; }
      items.push(item);
    });
    return items;
  }

  function migrateLegacyRecord(sheet, item) {
    if (!item || item.status !== 'migratable' || !item.record) throw new Error('Legacy Fund intent chưa đủ điều kiện migration.');
    var journalSheet = journalSheet_(sheet);
    if (!journalSheet) throw new Error('Thiếu sheet ' + JOURNAL_SHEET_NAME + ' cho migration.');
    var record = item.record;
    record.sheetName = String(sheet.getName() || '');
    record.storedFirstRow = item.row;
    record.firstRow = item.row;
    record.storage = 'v2';
    if (journalRecords_(journalSheet, record.id).length || metadataForJob_(sheet, record.id).length) reconciliation_('Intent đã có dữ liệu V2: ' + record.id + '.');
    record.journalRow = writeJournalRecord_(journalSheet, record);
    addMarker_(sheet, item.row, record);
    SpreadsheetApp.flush();
    if (metadataForJob_(sheet, record.id).length !== 1 || journalRecords_(journalSheet, record.id).length !== 1) reconciliation_('Không xác minh được intent V2 sau migration.');
    sheet.getRange(item.row, 1).setNote('');
    SpreadsheetApp.flush();
    return { id: record.id, row: item.row, state: record.state };
  }

  return {
    find: find, prepare: prepare, rows: rows, verifyRows: verifyRows, complete: complete,
    auditLegacy: auditLegacy, migrateLegacyRecord: migrateLegacyRecord,
    journalSheetName: function () { return JOURNAL_SHEET_NAME; }, journalHeaders: function () { return JOURNAL_HEADERS.slice(); },
    legacyPrefix: function () { return LEGACY_PREFIX; }, metadataKey: function () { return METADATA_KEY; }
  };
})();
