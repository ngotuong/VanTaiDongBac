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
  return { readSnapshot: readSnapshot };
})();
