var SheetReadService = (function () {
  function readSheetData(sheetName, startDateStr, endDateStr, limit) {
    return SheetService.readSheetData(sheetName, startDateStr, endDateStr, limit);
  }

  return {
    readSheetData: readSheetData
  };
})();
