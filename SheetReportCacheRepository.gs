var SheetReportCacheRepository = (function () {
  function getDataVersion(propertyName) {
    return PropertiesService.getScriptProperties().getProperty(propertyName) || '0';
  }

  function bumpDataVersion(propertyName) {
    PropertiesService.getScriptProperties().setProperty(propertyName, String(new Date().getTime()));
  }

  function readDetailsMap(ss, options) {
    var sheet = getCacheSheet_(ss, options.sheetName, false);
    var map = {};
    if (!sheet || sheet.getLastRow() < 2) return map;
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    rows.forEach(function (row) {
      if (options.clean(row[0]) !== options.cacheVersion || options.clean(row[1]) !== options.dataVersion) return;
      var monthKey = options.clean(row[2]);
      var rowOrder = Number(row[4]);
      if (!monthKey || !rowOrder) return;
      if (!map[monthKey]) map[monthKey] = [];
      map[monthKey][rowOrder - 1] = [row[5], row[6], row[7], row[8], row[9]];
    });
    Object.keys(map).forEach(function (key) {
      map[key] = map[key].filter(function (row) { return row && row.length; });
    });
    return map;
  }

  function writeDetails(ss, detailsByMonth, options) {
    var rows = [];
    Object.keys(detailsByMonth || {}).forEach(function (monthKey) {
      var matrix = detailsByMonth[monthKey] || [];
      matrix.forEach(function (row, index) {
        rows.push([
          options.cacheVersion, options.dataVersion, monthKey, monthKey, index + 1,
          row[0] || '', row[1] || '', row[2] || '', row[3] || '', row[4] || ''
        ]);
      });
    });
    if (!rows.length) return;
    var sheet = getCacheSheet_(ss, options.sheetName, true);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
  }

  function getCacheSheet_(ss, sheetName, createIfMissing) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet && createIfMissing) {
      sheet = ss.insertSheet(sheetName);
      sheet.hideSheet();
      sheet.getRange(1, 1, 1, 10).setValues([[
        'cacheVersion', 'dataVersion', 'monthKey', 'monthLabel', 'rowOrder',
        'colA', 'colB', 'colC', 'colD', 'colE'
      ]]);
    }
    return sheet;
  }

  return {
    getDataVersion: getDataVersion,
    bumpDataVersion: bumpDataVersion,
    readDetailsMap: readDetailsMap,
    writeDetails: writeDetails
  };
})();
