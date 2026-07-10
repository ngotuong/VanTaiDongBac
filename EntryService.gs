var EntryService = (function () {
  function submitRows(formType, rows, writeContext) {
    return SheetService.submitRows(formType, rows, writeContext);
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
    checkTripReconciliation: checkTripReconciliation,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
