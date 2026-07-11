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

      var reservedRange = findWriteJobRange_(sheet, writeContext);
      var idempotentReplay = Boolean(reservedRange);
      var appendRow = reservedRange ? reservedRange.getRow() : context.getAppendRow(sheet, cfg.headerRow);
      context.ensureRows(sheet, appendRow + result.values.length - 1);
      if (!reservedRange && writeContext && writeContext.jobId) {
        reservedRange = sheet.getRange(appendRow, 1, result.values.length, Math.max(1, result.values[0].length));
        reservedRange.addDeveloperMetadata(
          'WRITE_JOB_ID',
          String(writeContext.jobId),
          SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT
        );
      }

      if (formType === 'dau') {
        var headers = sheet.getRange(cfg.headerRow, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
          return String(header).trim();
        });
        var totalColIdx = headers.indexOf('Thành tiền');
        if (totalColIdx === -1) totalColIdx = 6;
        var ownerColIdx = headers.indexOf('Công ty sở hữu');
        if (ownerColIdx === -1) ownerColIdx = 8;
        context.writeRows(sheet, appendRow, result.values, [totalColIdx, ownerColIdx]);
      } else {
        context.writeRows(sheet, appendRow, result.values, []);
      }
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

  function findWriteJobRange_(sheet, writeContext) {
    var jobId = writeContext && writeContext.jobId ? String(writeContext.jobId).trim() : '';
    if (!jobId) return null;
    var metadata = sheet.createDeveloperMetadataFinder()
      .withKey('WRITE_JOB_ID')
      .withValue(jobId)
      .find();
    if (!metadata || !metadata.length) return null;
    var location = metadata[0].getLocation();
    return location && location.getRange ? location.getRange() : null;
  }

  function checkTripReconciliation(rows) {
    return SheetService.checkTripReconciliation(rows);
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
    checkTripReconciliation: checkTripReconciliation,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
