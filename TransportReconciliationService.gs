var TransportReconciliationService = (function () {
  function checkTripReconciliation(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    var keys = {};
    rows.forEach(function (row) {
      var date = ValidationService.parseDate(row.date);
      var plate = clean_(row.vehicle);
      if (!date || !plate) return;
      var key = pairKey_(date, plate);
      keys[key] = { date: date, plate: plate };
    });
    var pairs = Object.keys(keys).map(function (key) { return keys[key]; });
    if (!pairs.length) return [];

    var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var vanChuyen = sumTripsByPairs_(ss.getSheetByName('NL_VanChuyen'), 2, pairs, 1, 3, 5);
    var taiXe = sumTripsByPairs_(ss.getSheetByName('NL_TaiXe'), 1, pairs, 1, 3, 5);
    return pairs.map(function (pair) {
      var key = pairKey_(pair.date, pair.plate);
      var planned = vanChuyen[key] || 0;
      var actual = taiXe[key] || 0;
      var diff = planned - actual;
      if (diff === 0) return null;
      return Utilities.formatDate(pair.date, APP_CONFIG.timezone, 'dd/MM/yyyy')
        + ' - ' + pair.plate + ': báo cáo ' + planned + ', tài xế ' + actual + ', lệch ' + diff + '.';
    }).filter(function (message) { return message; });
  }

  function sumTripsByPairs_(sheet, headerRow, pairs, dateColumn, plateColumn, tripsColumn) {
    var result = {};
    if (!sheet) return result;
    var wanted = {};
    pairs.forEach(function (pair) {
      wanted[pairKey_(pair.date, pair.plate)] = true;
    });
    var lastRow = SheetWritePreserver.getLastNonEmptyRowInColumn(sheet, 1, headerRow + 1, '', 300);
    var rowCount = Math.max(lastRow - headerRow, 0);
    if (!rowCount) return result;
    var width = Math.max(dateColumn, plateColumn, tripsColumn);
    var values = sheet.getRange(headerRow + 1, 1, rowCount, width).getValues();
    values.forEach(function (row) {
      var date = row[dateColumn - 1];
      var plate = clean_(row[plateColumn - 1]);
      if (Object.prototype.toString.call(date) !== '[object Date]' || !plate) return;
      var key = pairKey_(date, plate);
      if (!wanted[key]) return;
      result[key] = (result[key] || 0) + ValidationService.parseNumber(row[tripsColumn - 1], false);
    });
    return result;
  }

  function pairKey_(date, plate) {
    return Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM-dd') + '|' + clean_(plate);
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  return { checkTripReconciliation: checkTripReconciliation };
})();
