var ManageService = (function () {
  function readManageData(sheetName, startDateStr, endDateStr, limit, options) {
    return SheetReadService.readSheetData(sheetName, startDateStr, endDateStr, limit, options);
  }

  return {
    readManageData: readManageData
  };
})();
