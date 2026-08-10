/** Sheet read adapter for Fund loan rows. */
var FundLoanRepository = (function () {
  var FILTER_COLUMN = 14;
  var FILTER_ARRAY_FORMULA = '=ARRAYFORMULA(IF(A2:A="";"";IF(BC_VAY!$P$9="";"";A2:A)&IF(BC_VAY!$R$9="";"";C2:C)&IF(BC_VAY!$S$9="";"";E2:E)))';

  function readSnapshot(spreadsheet, sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return { displayValues: [], rawDateValues: [] };
    var lastRow = sheet.getLastRow();
    return {
      displayValues: sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 14)).getDisplayValues(),
      rawDateValues: sheet.getRange(2, 2, lastRow - 1, 1).getValues()
    };
  }

  function repairFilterColumn(sheet) {
    var lastRow = Math.max(sheet.getLastRow(), 2);
    if (lastRow >= 3) sheet.getRange(3, FILTER_COLUMN, lastRow - 2, 1).clearContent();
    sheet.getRange(2, FILTER_COLUMN).setFormula(FILTER_ARRAY_FORMULA);
  }

  function appendRow(sheet, row, options) {
    var targetRow = options.getAppendRow(sheet);
    if (sheet.getMaxRows() < targetRow) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
    repairFilterColumn(sheet);
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(targetRow, 2).setNumberFormat('dd/MM/yyyy');
    sheet.getRange(targetRow, 6).setNumberFormat('#,##0');
    return targetRow;
  }
  return { readSnapshot: readSnapshot, repairFilterColumn: repairFilterColumn, appendRow: appendRow };
})();
