var ManageService = (function () {
  function readManageData(sheetName, startDateStr, endDateStr, limit) {
    return SheetService.readSheetData(sheetName, startDateStr, endDateStr, limit);
  }

  return {
    readManageData: readManageData
  };
})();
