var ReportTableService = (function () {
  function readTables(ss) {
    return {
      payroll: readTable_(ss, 'BC_BangLuong', 2, 1, 0, 16),
      vehicles: readTable_(ss, 'BC_TongHopXe', 2, 1, 0, 14),
      projectGroups: readTable_(ss, 'BC_TongHopDuAn', 2, 1, 0, 7),
      projects: readTable_(ss, 'BC_TongHopDuAn', 2, 9, 0, 7)
    };
  }

  function readFreshnessTables(ss) {
    var tables = readTables(ss);
    var overviewSheet = ss.getSheetByName('BC_TongQuan');
    var overview = [];
    if (overviewSheet) {
      var rowCount = Math.min(Math.max(overviewSheet.getLastRow(), 1), 24);
      var lastColumn = Math.max(overviewSheet.getLastColumn(), 7);
      overview = overviewSheet.getRange(1, 7, rowCount, Math.max(11, lastColumn - 7 + 1)).getDisplayValues();
    }
    return {
      overview: overview,
      payroll: tables.payroll,
      vehicles: tables.vehicles,
      projectGroups: tables.projectGroups,
      projects: tables.projects
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
    var availableRows = Math.max(sheet.getLastRow() - startRow + 1, 1);
    var keyValues = sheet.getRange(startRow, startColumn, availableRows, 1).getDisplayValues();
    var lastDataOffset = keyValues.length - 1;
    while (lastDataOffset > 0 && !normalizeCleanValue_(keyValues[lastDataOffset][0])) lastDataOffset--;
    var dataRows = Math.max(lastDataOffset + 1, 1);
    var safeRows = numRows > 0 ? Math.min(numRows, dataRows) : dataRows;
    return sheet.getRange(startRow, startColumn, safeRows, numColumns).getDisplayValues()
      .filter(function (row, index) {
        return index === 0 || row.some(function (cell) { return normalizeCleanValue_(cell); });
      });
  }

  return {
    readTables: readTables,
    readFreshnessTables: readFreshnessTables,
    filterByMonth: filterByMonth
  };
})();
