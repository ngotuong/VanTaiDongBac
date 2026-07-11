var SheetWritePreserver = (function () {
  function writeRowSkippingColumns(sheet, rowNum, values, skippedColumns) {
    var skipMap = buildSkipMap_(skippedColumns);
    writeRowSegments_(sheet, rowNum, values, skipMap, function (range, segment) {
      range.setValues([segment]);
    });
  }

  function writeRowsPreservingSheetState(sheet, startRow, rows, skippedColumns) {
    if (!rows || !rows.length) return;
    var columnCount = rows[0].length;
    var skipMap = buildSkipMap_(skippedColumns);

    copyRowFormatSafely_(sheet, startRow, rows.length, columnCount);
    var existingFormulas = sheet.getRange(startRow, 1, rows.length, columnCount).getFormulasR1C1();
    var sourceFormulas = startRow > 1
      ? sheet.getRange(startRow - 1, 1, 1, columnCount).getFormulasR1C1()[0]
      : [];

    rows.forEach(function (values, rowOffset) {
      var rowNum = startRow + rowOffset;
      var rowSkipMap = {};
      for (var colIdx = 0; colIdx < columnCount; colIdx++) {
        if (skipMap[colIdx]) rowSkipMap[colIdx] = true;
        if (existingFormulas[rowOffset] && existingFormulas[rowOffset][colIdx]) rowSkipMap[colIdx] = true;
        if (!rowSkipMap[colIdx] && isBlankCell_(values[colIdx]) && sourceFormulas[colIdx]) {
          rowSkipMap[colIdx] = true;
          sheet.getRange(rowNum, colIdx + 1).setFormulaR1C1(sourceFormulas[colIdx]);
        }
      }
      writeRowSegments_(sheet, rowNum, values, rowSkipMap, function (range, segment) {
        range.setValues([segment]);
      });
    });
  }

  function ensureRows(sheet, requiredLastRow) {
    if (sheet.getMaxRows() < requiredLastRow) {
      sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
    }
  }

  function getLastNonEmptyRowInColumn(sheet, column, minRow, cacheKey, cacheTtlSeconds) {
    var cache = cacheKey ? CacheService.getScriptCache() : null;
    if (cache) {
      var cached = cache.get(cacheKey);
      if (cached !== null) {
        var cachedRow = parseInt(cached, 10);
        if (!isNaN(cachedRow)) return cachedRow;
      }
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < minRow) {
      if (cache) cache.put(cacheKey, String(minRow - 1), cacheTtlSeconds);
      return minRow - 1;
    }
    var chunkSize = 1000;
    for (var endRow = lastRow; endRow >= minRow; endRow -= chunkSize) {
      var startRow = Math.max(minRow, endRow - chunkSize + 1);
      var values = sheet.getRange(startRow, column, endRow - startRow + 1, 1).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        var value = values[i][0];
        if (value !== '' && value !== null && value !== undefined) {
          if (cache) cache.put(cacheKey, String(startRow + i), cacheTtlSeconds);
          return startRow + i;
        }
      }
    }
    if (cache) cache.put(cacheKey, String(minRow - 1), cacheTtlSeconds);
    return minRow - 1;
  }

  function buildSkipMap_(skippedColumns) {
    var skipMap = {};
    (skippedColumns || []).forEach(function (colIdx) {
      skipMap[colIdx] = true;
    });
    return skipMap;
  }

  function copyRowFormatSafely_(sheet, targetStartRow, rowCount, columnCount) {
    if (!(targetStartRow > 1) || !(rowCount > 0) || !(columnCount > 0)) return;
    try {
      var source = sheet.getRange(targetStartRow - 1, 1, 1, columnCount);
      var target = sheet.getRange(targetStartRow, 1, rowCount, columnCount);
      source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    } catch (e) {
      console.log('copy_row_format_failed: ' + e.message);
    }
  }

  function isBlankCell_(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function writeRowSegments_(sheet, rowNum, values, skipMap, writeFn) {
    var startCol = null;
    var segment = [];
    for (var colIdx = 0; colIdx < values.length; colIdx++) {
      if (skipMap[colIdx]) {
        if (segment.length) {
          writeFn(sheet.getRange(rowNum, startCol + 1, 1, segment.length), segment);
          segment = [];
          startCol = null;
        }
        continue;
      }
      if (startCol === null) startCol = colIdx;
      segment.push(values[colIdx]);
    }
    if (segment.length) {
      writeFn(sheet.getRange(rowNum, startCol + 1, 1, segment.length), segment);
    }
  }

  return {
    writeRowSkippingColumns: writeRowSkippingColumns,
    writeRowsPreservingSheetState: writeRowsPreservingSheetState,
    ensureRows: ensureRows,
    getLastNonEmptyRowInColumn: getLastNonEmptyRowInColumn
  };
})();
