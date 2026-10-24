/** Durable row intent journal for queued Sheet appends. */
var SheetWriteJournal = (function () {
  var METADATA_KEY = 'WRITE_JOB_INTENT_V2';
  var JOURNAL_PREFIX = 'WRITE_JOB_JOURNAL_';
  var LEGACY_PREFIX = 'WRITE_JOB_RESERVATION_';

  function reconciliation_(message) {
    throw new Error('REQUIRES_RECONCILIATION: ' + message);
  }

  function jobId_(writeContext) {
    return writeContext && writeContext.jobId ? String(writeContext.jobId).trim() : '';
  }

  function propertyStore_() {
    return PropertiesService.getScriptProperties();
  }

  function journalKey_(jobId) {
    return JOURNAL_PREFIX + jobId;
  }

  function legacyKey_(jobId) {
    return LEGACY_PREFIX + jobId;
  }

  function normalizeValue_(value) {
    if (value === null || value === undefined || value === '') return '';
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return { type: 'date', value: value.getTime() };
    }
    if (typeof value === 'number') return { type: 'number', value: value === 0 ? 0 : value };
    if (typeof value === 'boolean') return { type: 'boolean', value: value };
    return { type: 'string', value: String(value) };
  }

  function valuesEqual_(left, right) {
    return JSON.stringify(normalizeValue_(left)) === JSON.stringify(normalizeValue_(right));
  }

  function isBlank_(value) {
    return value === '' || value === null || value === undefined;
  }

  function intentHash_(sheet, intendedRows, writableColumns) {
    var canonical = {
      sheetName: String(sheet.getName() || ''),
      rowCount: intendedRows.length,
      columnCount: intendedRows[0] ? intendedRows[0].length : 0,
      writableColumns: writableColumns,
      values: intendedRows.map(function (row) {
        return writableColumns.map(function (column) { return normalizeValue_(row[column]); });
      })
    };
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(canonical),
      Utilities.Charset.UTF_8
    );
    return bytes.map(function (byte) {
      var value = byte < 0 ? byte + 256 : byte;
      return ('0' + value.toString(16)).slice(-2);
    }).join('');
  }

  function metadataForJob_(sheet, jobId) {
    if (!sheet.createDeveloperMetadataFinder) return [];
    return sheet.createDeveloperMetadataFinder().withKey(METADATA_KEY).find().filter(function (metadata) {
      return String(metadata.getValue() || '').indexOf(jobId + '|') === 0;
    });
  }

  function rangeFromMetadata_(metadata) {
    var location = metadata.getLocation();
    return location && location.getRow ? location.getRow() : null;
  }

  function parseProperty_(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function locate(sheet, writeContext) {
    var jobId = jobId_(writeContext);
    if (!jobId) return null;
    var matches = metadataForJob_(sheet, jobId);
    if (matches.length > 1) reconciliation_('Job ' + jobId + ' có nhiều marker dòng ghi.');
    if (matches.length === 1) {
      var markedRange = rangeFromMetadata_(matches[0]);
      if (!markedRange) reconciliation_('Marker của job ' + jobId + ' không còn trỏ tới vùng dữ liệu.');
      return { range: markedRange, markerValue: String(matches[0].getValue() || ''), legacy: false };
    }

    var store = propertyStore_();
    var journal = parseProperty_(store.getProperty(journalKey_(jobId)));
    if (journal && Number(journal.version) === 2) {
      reconciliation_('Journal của job ' + jobId + ' còn tồn tại nhưng marker dòng ghi đã mất.');
    }
    var legacy = parseProperty_(store.getProperty(legacyKey_(jobId)));
    if (!legacy) return null;
    var startRow = Number(legacy.startRow);
    if (String(legacy.sheetName || '') !== String(sheet.getName() || '') || !Number.isInteger(startRow) || startRow <= 0) {
      reconciliation_('Reservation cũ của job ' + jobId + ' không hợp lệ.');
    }
    return {
      range: sheet.getRange(startRow, 1, 1, sheet.getMaxColumns()),
      markerValue: '',
      legacy: true
    };
  }

  function validateRangeShape_(range, rows, columnCount, jobId) {
    if (range.getNumRows && range.getNumRows() !== rows) {
      reconciliation_('Marker của job ' + jobId + ' sai số dòng.');
    }
    if (range.getNumColumns && range.getNumColumns() !== columnCount) {
      reconciliation_('Marker của job ' + jobId + ' sai số cột.');
    }
  }

  function classify_(range, intendedRows, writableColumns) {
    var currentRows = range.getValues();
    var allExact = true;
    var allBlank = true;
    for (var row = 0; row < intendedRows.length; row++) {
      for (var index = 0; index < writableColumns.length; index++) {
        var column = writableColumns[index];
        var current = currentRows[row] ? currentRows[row][column] : undefined;
        if (!valuesEqual_(current, intendedRows[row][column])) allExact = false;
        if (!isBlank_(current)) allBlank = false;
      }
    }
    return allExact ? 'exact' : allBlank ? 'blank' : 'drift';
  }

  function prepare(sheet, writeContext, options) {
    var jobId = jobId_(writeContext);
    var intendedRows = options.intendedRows || [];
    var columnCount = intendedRows[0] ? intendedRows[0].length : 0;
    var writableColumns = options.writableColumns || [];
    if (!jobId) {
      return {
        range: sheet.getRange(options.startRow, 1, intendedRows.length, columnCount),
        startRow: options.startRow,
        shouldWrite: true,
        idempotentReplay: false
      };
    }
    if (!intendedRows.length || !columnCount || !writableColumns.length) {
      reconciliation_('Ý định ghi của job ' + jobId + ' không có vùng dữ liệu hợp lệ.');
    }

    var hash = intentHash_(sheet, intendedRows, writableColumns);
    var markerValue = jobId + '|' + hash;
    var located = options.located || locate(sheet, writeContext);
    var range;
    if (located) {
      range = sheet.getRange(located.range.getRow(), 1, intendedRows.length, columnCount);
      validateRangeShape_(range, intendedRows.length, columnCount, jobId);
      if (!located.legacy && located.markerValue !== markerValue) {
        reconciliation_('Payload của job ' + jobId + ' không khớp intent hash đã giữ chỗ.');
      }
      var state = classify_(range, intendedRows, writableColumns);
      if (state === 'exact') {
        return { range: range, startRow: range.getRow(), shouldWrite: false, idempotentReplay: true };
      }
      if (located.legacy || state !== 'blank') {
        reconciliation_('Dòng đã giữ chỗ của job ' + jobId + ' đã có dữ liệu khác hoặc chỉ được ghi một phần.');
      }
      return { range: range, startRow: range.getRow(), shouldWrite: true, idempotentReplay: false };
    }

    range = sheet.getRange(options.startRow, 1, intendedRows.length, columnCount);
    if (classify_(range, intendedRows, writableColumns) !== 'blank') {
      reconciliation_('Vùng append của job ' + jobId + ' đã có dữ liệu trước khi giữ chỗ.');
    }
    // Apps Script only accepts developer metadata on a true row dimension.
    // A numeric range spanning getMaxColumns() is still treated as arbitrary.
    sheet.getRange(String(options.startRow) + ':' + String(options.startRow))
      .addDeveloperMetadata(METADATA_KEY, markerValue);
    propertyStore_().setProperty(journalKey_(jobId), JSON.stringify({
      version: 2,
      sheetName: sheet.getName(),
      startRow: options.startRow,
      rowCount: intendedRows.length,
      columnCount: columnCount,
      writableColumns: writableColumns,
      intentHash: hash,
      markerValue: markerValue
    }));
    return { range: range, startRow: options.startRow, shouldWrite: true, idempotentReplay: false };
  }

  function release(jobId) {
    var safeJobId = jobId ? String(jobId).trim() : '';
    if (!safeJobId) return;
    var store = propertyStore_();
    store.deleteProperty(journalKey_(safeJobId));
    store.deleteProperty(legacyKey_(safeJobId));
  }

  return { locate: locate, prepare: prepare, release: release };
})();
