var ReportTableService = (function () {
  function readTables(ss) {
    return {
      payroll: readTable_(ss, 'BC_BangLuong', 2, 1, 200, 16),
      vehicles: readTable_(ss, 'BC_TongHopXe', 2, 1, 200, 12)
    };
  }

  function filterByMonth(matrix, month, normalizeMonth) {
    if (month === 'Tất cả') return matrix || [];
    var key = normalizeMonth(month);
    if (!key || !matrix || matrix.length < 2) return matrix || [];
    var header = matrix[0];
    var rows = matrix.slice(1).filter(function (row) {
      return normalizeMonth(row[0]) === key;
    });
    return [header].concat(rows);
  }

  function readTable_(ss, sheetName, startRow, startColumn, numRows, numColumns) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var safeRows = Math.min(numRows, Math.max(sheet.getLastRow() - startRow + 1, 1));
    return sheet.getRange(startRow, startColumn, safeRows, numColumns).getDisplayValues()
      .filter(function (row, index) {
        return index === 0 || row.some(function (cell) { return normalizeCleanValue_(cell); });
      });
  }

  return {
    readTables: readTables,
    filterByMonth: filterByMonth
  };
})();
