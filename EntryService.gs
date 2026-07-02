var EntryService = (function () {
  function submitRows(formType, rows) {
    return SheetService.submitRows(formType, rows);
  }

  function checkTripReconciliation(rows) {
    return SheetService.checkTripReconciliation(rows);
  }

  function saveSheetRow(sheetName, rowIndex, rowData) {
    return SheetService.saveSheetRow(sheetName, rowIndex, rowData);
  }

  function deleteSheetRow(sheetName, rowIndex, columnsToClear) {
    return SheetService.deleteSheetRow(sheetName, rowIndex, columnsToClear);
  }

  return {
    submitRows: submitRows,
    checkTripReconciliation: checkTripReconciliation,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
