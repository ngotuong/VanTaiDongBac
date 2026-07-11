var SheetReadService = (function () {
  function readSheetData(sheetName, startDateStr, endDateStr, limit) {
    return SheetService.readSheetData(sheetName, startDateStr, endDateStr, limit);
  }

  function readSheetDataFromSpreadsheet(ss, sheetName, startDateStr, endDateStr, limit, context) {
    try {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

      var headerRow = resolveHeaderRow_(sheetName, context.sheets);
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var headers = [];
      var rows = [];
      var rowLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 500));
      var responseCacheKey = context.buildCacheKey(
        'read_sheet', sheetName, startDateStr || '', endDateStr || '', rowLimit, context.getDataVersion()
      );
      var responseCached = context.getCached(responseCacheKey);
      if (responseCached) return responseCached;

      if (lastCol > 0) {
        var rawHeaders = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (header) {
          return String(header).trim();
        });
        headers = normalizeHeaders_(sheetName, rawHeaders);

        if (lastRow > headerRow) {
          var isJournalSheet = sheetName.indexOf('NL_') === 0;
          var hasDateFilter = Boolean((startDateStr || endDateStr) && isJournalSheet);
          var readStartRow = headerRow + 1;
          var readRowCount = lastRow - headerRow;
          var rowEntries = [];
          var startLimit = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
          var endLimit = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;

          if (hasDateFilter) {
            rowEntries = readFilteredJournalRows_(sheet, headerRow, lastRow, lastCol, rowLimit, startLimit, endLimit);
          } else {
            if (isJournalSheet) {
              var lastDataRow = context.getLastNonEmptyRow(sheet, 1, headerRow + 1, true);
              if (lastDataRow >= headerRow + 1) {
                readRowCount = Math.min(rowLimit, lastDataRow - headerRow);
                readStartRow = lastDataRow - readRowCount + 1;
              } else {
                readRowCount = 0;
              }
            }
            var rawValues = readRowCount > 0
              ? sheet.getRange(readStartRow, 1, readRowCount, lastCol).getValues()
              : [];
            for (var rawIdx = rawValues.length - 1; rawIdx >= 0; rawIdx--) {
              rowEntries.push({ rowIndex: readStartRow + rawIdx, values: rawValues[rawIdx] });
            }
          }

          rowEntries.forEach(function (entry) {
            var cells = entry.values.map(function (value) {
              if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
                return Utilities.formatDate(value, context.timezone, 'yyyy-MM-dd');
              }
              return value;
            });
            var isEmpty = cells.every(function (cell) {
              return cell === null || cell === undefined || String(cell).trim() === '';
            });
            if (!isEmpty) rows.push({ rowIndex: entry.rowIndex, values: cells });
          });
        }
      }

      var isLimited = sheetName.indexOf('NL_') === 0 && !startDateStr && !endDateStr;
      if (sheetName.indexOf('DM_') === 0) rows.reverse();

      var result = { ok: true, headers: headers, rows: rows, isLimited: isLimited };
      context.putCached(responseCacheKey, result, 60);
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function resolveHeaderRow_(sheetName, sheets) {
    var headerRow = 1;
    Object.keys(sheets || {}).some(function (key) {
      if (sheets[key].name !== sheetName) return false;
      headerRow = sheets[key].headerRow;
      return true;
    });
    return headerRow;
  }

  function normalizeHeaders_(sheetName, headers) {
    return headers.map(function (header, index) {
      if (sheetName === 'DM_ThamSo') {
        if (index === 3) return 'Ngày áp dụng tham số';
        if (index === 5) return 'Ngày áp dụng giá dầu';
      }
      return header;
    });
  }

  function readFilteredJournalRows_(sheet, headerRow, lastRow, lastCol, rowLimit, startLimit, endLimit) {
    var matchedRows = [];
    var scanChunkSize = 1000;
    for (var scanEnd = lastRow; scanEnd > headerRow && matchedRows.length < rowLimit; scanEnd -= scanChunkSize) {
      var scanStart = Math.max(headerRow + 1, scanEnd - scanChunkSize + 1);
      var dateValues = sheet.getRange(scanStart, 1, scanEnd - scanStart + 1, 1).getValues();
      for (var dateIndex = dateValues.length - 1; dateIndex >= 0; dateIndex--) {
        var parsedDate = parseSheetDate_(dateValues[dateIndex][0]);
        if (parsedDate && (!startLimit || parsedDate >= startLimit) && (!endLimit || parsedDate <= endLimit)) {
          matchedRows.push(scanStart + dateIndex);
          if (matchedRows.length >= rowLimit) break;
        }
      }
    }
    matchedRows.sort(function (a, b) { return a - b; });
    if (!matchedRows.length) return [];

    var groups = [];
    var groupStart = matchedRows[0];
    var groupEnd = matchedRows[0];
    for (var groupIndex = 1; groupIndex < matchedRows.length; groupIndex++) {
      if (matchedRows[groupIndex] === groupEnd + 1) {
        groupEnd = matchedRows[groupIndex];
      } else {
        groups.push({ start: groupStart, end: groupEnd });
        groupStart = matchedRows[groupIndex];
        groupEnd = matchedRows[groupIndex];
      }
    }
    groups.push({ start: groupStart, end: groupEnd });

    var rowEntries = [];
    groups.forEach(function (group) {
      var groupValues = sheet.getRange(group.start, 1, group.end - group.start + 1, lastCol).getValues();
      groupValues.forEach(function (rowValues, offset) {
        rowEntries.push({ rowIndex: group.start + offset, values: rowValues });
      });
    });
    rowEntries.sort(function (a, b) { return b.rowIndex - a.rowIndex; });
    return rowEntries;
  }

  function parseSheetDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var text = String(value === null || value === undefined ? '' : value).trim();
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vn) return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]));
    return null;
  }

  return {
    readSheetData: readSheetData,
    readSheetDataFromSpreadsheet: readSheetDataFromSpreadsheet
  };
})();
