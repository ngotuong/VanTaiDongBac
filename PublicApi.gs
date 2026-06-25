function getInitialData() {
  return SheetService.getInitialData();
}

function getBootstrap() {
  return SheetService.getBootstrap();
}

function getCatalogs(formType) {
  return SheetService.getCatalogs(formType);
}

function getDashboard(month, forceRefresh) {
  return SheetService.getDashboard(month, forceRefresh);
}

function getReports(forceRefresh) {
  return SheetService.getReports(forceRefresh);
}

function getReport(type, month, forceRefresh) {
  return SheetService.getReport(type, month, forceRefresh);
}

function getReportBundle(month, forceRefresh) {
  return SheetService.getReportBundle(month, forceRefresh);
}

function invalidateCaches() {
  return SheetService.invalidateCaches();
}

function submitRows(formType, rows) {
  return SheetService.submitRows(formType, rows);
}

function checkTripReconciliation(rows) {
  return SheetService.checkTripReconciliation(rows);
}

function readSheetData(sheetName, startDate, endDate, limit) {
  return SheetService.readSheetData(sheetName, startDate, endDate, limit);
}

function saveSheetRow(sheetName, rowIndex, rowData) {
  return SheetService.saveSheetRow(sheetName, rowIndex, rowData);
}

function deleteSheetRow(sheetName, rowIndex, columnsToClear) {
  return SheetService.deleteSheetRow(sheetName, rowIndex, columnsToClear);
}
