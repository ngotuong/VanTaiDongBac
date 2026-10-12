var EntryService = (function () {
  function submitRows(formType, rows, writeContext) {
    return SheetService.submitRows(formType, rows, writeContext);
  }

  function submitRowsWithContext(formType, rows, writeContext, context) {
    if (!context.sheets[formType]) {
      throw new Error('Loai form khong hop le: ' + formType);
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Chua co dong nao de ghi.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = context.getSpreadsheet();
      var catalogs = context.getCatalogs(formType);
      var result = ValidationService.buildRows(formType, rows, catalogs);
      if (writeContext && writeContext.jobId && result.errors && result.errors.length) {
        return { ok: false, inserted: 0, errors: result.errors, warnings: result.warnings };
      }
      if (!result.values.length) {
        return { ok: false, inserted: 0, errors: result.errors, warnings: result.warnings };
      }

      var cfg = context.sheets[formType];
      var sheet = ss.getSheetByName(cfg.name);
      if (!sheet) throw new Error('Khong tim thay sheet ' + cfg.name);
      var liveSchema = assertLiveHeaders_(sheet, cfg);

      var reservedRange = findWriteJobRange_(sheet, writeContext);
      var idempotentReplay = Boolean(reservedRange);
      var appendRow = reservedRange ? reservedRange.getRow() : context.getAppendRow(sheet, cfg.headerRow);
      context.ensureRows(sheet, appendRow + result.values.length - 1);
      if (!reservedRange && writeContext && writeContext.jobId) {
        reserveWriteJobRange_(sheet, writeContext.jobId, appendRow);
        reservedRange = sheet.getRange(appendRow, 1, 1, sheet.getMaxColumns());
      }

      var expectedIndexByLiveColumn = {};
      liveSchema.expectedIndexes.forEach(function (liveIndex, expectedIndex) {
        expectedIndexByLiveColumn[liveIndex] = expectedIndex;
      });
      var computedHeaders = cfg.computedHeaders || [];
      var skippedColumns = liveSchema.headers.map(function (_, liveIndex) {
        var expectedIndex = expectedIndexByLiveColumn[liveIndex];
        return expectedIndex === undefined || computedHeaders.indexOf(cfg.headers[expectedIndex]) !== -1 ? liveIndex : -1;
      }).filter(function (index) { return index >= 0; });
      var physicalRows = result.values.map(function (logicalRow) {
        var physicalRow = liveSchema.headers.map(function () { return ''; });
        liveSchema.expectedIndexes.forEach(function (liveIndex, expectedIndex) {
          physicalRow[liveIndex] = logicalRow[expectedIndex];
        });
        return physicalRow;
      });
      context.writeRows(sheet, appendRow, physicalRows, skippedColumns);
      context.clearAfterSubmitCache();
      return {
        ok: result.errors.length === 0,
        inserted: result.values.length,
        startRow: appendRow,
        sheetName: cfg.name,
        idempotentReplay: idempotentReplay,
        errors: result.errors,
        warnings: result.warnings
      };
    } finally {
      lock.releaseLock();
    }
  }

  function assertLiveHeaders_(sheet, cfg) {
    var expected = cfg.headers || [];
    var aliases = cfg.headerAliases || {};
    if (!expected.length) throw new Error('Chua khai bao schema ghi cho ' + cfg.name + '.');
    var actual = sheet.getRange(cfg.headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (header) {
      return String(header || '').trim();
    });
    var usedIndexes = {};
    var expectedIndexes = [];
    for (var index = 0; index < expected.length; index++) {
      var canonical = String(expected[index]).trim();
      var accepted = [canonical].concat(aliases[canonical] || []).map(function (header) {
        return String(header || '').trim();
      });
      var liveIndex = -1;
      for (var candidateIndex = 0; candidateIndex < actual.length; candidateIndex++) {
        if (!usedIndexes[candidateIndex] && accepted.indexOf(actual[candidateIndex]) !== -1) {
          liveIndex = candidateIndex;
          break;
        }
      }
      if (liveIndex === -1) {
        var current = index < actual.length ? ', dang la "' + actual[index] + '"' : '';
        throw new Error('Schema ' + cfg.name + ' thieu header bat buoc: chap nhan "' + accepted.join('" hoac "') + '"' + current + '.');
      }
      usedIndexes[liveIndex] = true;
      expectedIndexes.push(liveIndex);
    }
    return { headers: actual, expectedIndexes: expectedIndexes };
  }

  function findWriteJobRange_(sheet, writeContext) {
    var jobId = writeContext && writeContext.jobId ? String(writeContext.jobId).trim() : '';
    if (!jobId) return null;
    var raw = PropertiesService.getScriptProperties().getProperty(reservationKey_(jobId));
    if (!raw) return null;
    try {
      var reservation = JSON.parse(raw);
      var startRow = Number(reservation.startRow);
      if (String(reservation.sheetName || '') !== String(sheet.getName() || '')) return null;
      if (!Number.isInteger(startRow) || startRow <= 0) return null;
      return sheet.getRange(startRow, 1, 1, sheet.getMaxColumns());
    } catch (e) {
      return null;
    }
  }

  function reserveWriteJobRange_(sheet, jobId, startRow) {
    PropertiesService.getScriptProperties().setProperty(reservationKey_(jobId), JSON.stringify({
      sheetName: sheet.getName(),
      startRow: startRow
    }));
  }

  function releaseWriteJobReservation(jobId) {
    var safeJobId = jobId ? String(jobId).trim() : '';
    if (!safeJobId) return;
    PropertiesService.getScriptProperties().deleteProperty(reservationKey_(safeJobId));
  }

  function reservationKey_(jobId) {
    return 'WRITE_JOB_RESERVATION_' + String(jobId);
  }

  function checkTripReconciliation(rows) {
    return TransportReconciliationService.checkTripReconciliation(rows);
  }

  function saveSheetRow(sheetName, rowIndex, rowData, expectedRowData) {
    return SheetService.saveSheetRow(sheetName, rowIndex, rowData, expectedRowData);
  }

  function deleteSheetRow(sheetName, rowIndex, columnsToClear, expectedRowData) {
    return SheetService.deleteSheetRow(sheetName, rowIndex, columnsToClear, expectedRowData);
  }

  return {
    submitRows: submitRows,
    submitRowsWithContext: submitRowsWithContext,
    releaseWriteJobReservation: releaseWriteJobReservation,
    checkTripReconciliation: checkTripReconciliation,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
