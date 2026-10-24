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

  function appendRow(sheet, row, options) {
    var targetRow = options.reservedRow || options.getAppendRow(sheet);
    if (sheet.getMaxRows() < targetRow) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
    // Formula repair belongs to an explicitly approved migration, not a write.
    var rootFormula = String(sheet.getRange(2, FILTER_COLUMN).getFormula() || '');
    if (!/^\s*=\s*ARRAYFORMULA\s*\(/i.test(rootFormula)) throw new Error('Thiếu công thức mảng lọc khoản vay; cần migration riêng.');
    if (options.jobId) sheet.getRange(targetRow, 1).setNote('VTDB_JOB:' + String(options.jobId).trim());
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row.map(function (value) { return typeof value === 'string' && /^\s*=/.test(value) ? "'" + value : value; })]);
    sheet.getRange(targetRow, 2).setNumberFormat('dd/MM/yyyy');
    sheet.getRange(targetRow, 6).setNumberFormat('#,##0');
    return targetRow;
  }

  function findJobRow(sheet, jobId) {
    var marker = 'VTDB_JOB:' + String(jobId || '').trim();
    var lastRow = sheet.getLastRow();
    if (marker === 'VTDB_JOB:' || lastRow < 2) return null;
    var notes = sheet.getRange(2, 1, lastRow - 1, 1).getNotes();
    var codes = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (var index = 0; index < notes.length; index += 1) {
      if (String(notes[index][0] || '').trim() === marker && String(codes[index][0] || '').trim()) {
        return { rowIndex: index + 2, code: String(codes[index][0] || '').trim() };
      }
    }
    return null;
  }

  return { readSnapshot: readSnapshot, appendRow: appendRow,
    findJobRow: findJobRow };
})();
