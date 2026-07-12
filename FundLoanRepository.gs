/** Sheet read adapter for Fund loan rows. */
var FundLoanRepository = (function () {
  function readSnapshot(spreadsheet, sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return { displayValues: [], rawDateValues: [] };
    var lastRow = sheet.getLastRow();
    return {
      displayValues: sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 14)).getDisplayValues(),
      rawDateValues: sheet.getRange(2, 2, lastRow - 1, 1).getValues()
    };
  }

  function appendRow(sheet, row, options) {
    var targetRow = options.getAppendRow(sheet);
    if (sheet.getMaxRows() < targetRow) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(targetRow, 2).setNumberFormat('dd/MM/yyyy');
    sheet.getRange(targetRow, 6).setNumberFormat('#,##0');
    sheet.getRange(targetRow, 14).setFormula(options.buildFilterFormula(targetRow));
    return targetRow;
  }
  return { readSnapshot: readSnapshot, appendRow: appendRow };
})();
