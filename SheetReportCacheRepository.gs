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
    throw new Error('SYS_ReportCache is retired and cannot be written or recreated.');
  }

  function getCacheSheet_(ss, sheetName) {
    return ss.getSheetByName(sheetName);
  }

  return {
    getDataVersion: getDataVersion,
    bumpDataVersion: bumpDataVersion,
    readDetailsMap: readDetailsMap,
    writeDetails: writeDetails
  };
})();
