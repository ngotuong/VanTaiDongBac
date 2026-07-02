var ManageService = (function () {
  function readManageData(sheetName, startDateStr, endDateStr, limit) {
    return SheetReadService.readSheetData(sheetName, startDateStr, endDateStr, limit);
  }

  return {
    readManageData: readManageData
  };
})();
