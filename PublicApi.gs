function health() {
  return SheetService.health();
}

function getInitialData() {
  return SheetService.getInitialData();
}

function getBootstrap() {
  return SheetService.getBootstrap();
}

function getStartupData(formType) {
  return SheetService.getStartupData(formType);
}

function getCatalogs(formType) {
  return CatalogService.getCatalogs(formType);
}

function getDashboard(month, forceRefresh) {
  return ReportService.getDashboard(month, forceRefresh);
}

function getReports(forceRefresh) {
  return ReportService.getReports(forceRefresh);
}

function getReport(type, month, forceRefresh) {
  return ReportService.getReport(type, month, forceRefresh);
}

function getReportBundle(month, forceRefresh) {
  return ReportService.getReportBundle(month, forceRefresh);
}

function invalidateCaches() {
  return SheetService.invalidateCaches();
}

function submitRows(formType, rows) {
  return EntryService.submitRows(formType, rows);
}

function checkTripReconciliation(rows) {
  return EntryService.checkTripReconciliation(rows);
}

function readSheetData(sheetName, startDate, endDate, limit) {
  return SheetReadService.readSheetData(sheetName, startDate, endDate, limit);
}

function readManageData(sheetName, startDate, endDate, limit) {
  return ManageService.readManageData(sheetName, startDate, endDate, limit);
}

function readCatalogData(displaySheetName) {
  return CatalogService.readCatalogData(displaySheetName);
}

function saveSheetRow(sheetName, rowIndex, rowData) {
  return EntryService.saveSheetRow(sheetName, rowIndex, rowData);
}

function deleteSheetRow(sheetName, rowIndex, columnsToClear) {
  return EntryService.deleteSheetRow(sheetName, rowIndex, columnsToClear);
}

function getFundTransactions(year, filter) {
  return FundService.getFundTransactions(year, filter);
}

function getFundFormOptions(year) {
  return FundService.getFundFormOptions(year);
}

function getFundCatalog(year, group) {
  return FundService.getFundCatalog(year, group);
}

function updateFundTransaction(year, rowIndex, transaction) {
  return FundService.updateFundTransaction(year, rowIndex, transaction);
}

function deleteFundTransaction(year, rowIndex) {
  return FundService.deleteFundTransaction(year, rowIndex);
}

function addFundTransaction(year, transaction) {
  return FundService.addFundTransaction(year, transaction);
}

function getFundOverview(year, filter) {
  return FundService.getFundOverview(year, filter);
}

function getFundLoanOverview(year, filter) {
  return FundService.getFundLoanOverview(year, filter);
}

function addFundLoan(year, loan) {
  return FundService.addFundLoan(year, loan);
}

function addFundLoanPayment(year, payment) {
  return FundService.addFundLoanPayment(year, payment);
}

function saveFundCatalogItem(year, item) {
  return FundService.saveFundCatalogItem(year, item);
}

function deleteFundCatalogItem(year, item) {
  return FundService.deleteFundCatalogItem(year, item);
}

function syncReportBundleToSupabase(month) {
  return SupabaseService.syncReportBundle(month);
}

function testSupabaseReportSync() {
  return SupabaseService.testReportSync();
}

function syncAllReportBundlesToSupabase() {
  return SupabaseService.syncAllReportBundles();
}

function invokeApi(method, action, params, bodyData) {
  var normalizedMethod = String(method || '').toUpperCase();
  var safeParams = params || {};
  var safeBody = bodyData || {};
  AppConfig.activate({
    spreadsheetId: safeBody.spreadsheetId || safeBody.ssId || safeParams.spreadsheetId || safeParams.ssId,
    year: safeBody.year || safeParams.year
  });

  if (normalizedMethod === 'GET') {
    if (action === 'health') return SheetService.health();
    if (action === 'getBootstrap') return SheetService.getBootstrap();
    if (action === 'getStartupData') return SheetService.getStartupData(safeParams.formType);
    if (action === 'getInitialData') return SheetService.getInitialData();
    if (action === 'getCatalogs') return CatalogService.getCatalogs(safeParams.formType);
    if (action === 'getDashboard') return ReportService.getDashboard(safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReports') return ReportService.getReports(safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReport') return ReportService.getReport(safeParams.type, safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReportBundle') return ReportService.getReportBundle(safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'invalidateCaches') return SheetService.invalidateCaches();
    if (action === 'readSheetData') return SheetReadService.readSheetData(safeParams.sheetName, safeParams.startDate, safeParams.endDate, safeParams.limit);
    if (action === 'readManageData') return ManageService.readManageData(safeParams.sheetName, safeParams.startDate, safeParams.endDate, safeParams.limit);
    if (action === 'readCatalogData') return CatalogService.readCatalogData(safeParams.displaySheetName || safeParams.sheetName);
    if (action === 'getFundTransactions') {
      return FundService.getFundTransactions(safeParams.year, {
        month: safeParams.month,
        limit: safeParams.limit
      });
    }
    if (action === 'getFundOverview') {
      return FundService.getFundOverview(safeParams.year, {
        month: safeParams.month
      });
    }
    if (action === 'getFundLoanOverview') {
      return FundService.getFundLoanOverview(safeParams.year, {
        month: safeParams.month
      });
    }
    if (action === 'getFundFormOptions') return FundService.getFundFormOptions(safeParams.year);
    if (action === 'getFundCatalog') return FundService.getFundCatalog(safeParams.year, safeParams.group);
    throw new Error('Hành động GET không hợp lệ: ' + action);
  }

  if (normalizedMethod === 'POST') {
    if (action === 'submitRows') return EntryService.submitRows(safeBody.formType, safeBody.rows);
    if (action === 'checkTripReconciliation') return EntryService.checkTripReconciliation(safeBody.rows);
    if (action === 'saveSheetRow') return EntryService.saveSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.rowData);
    if (action === 'deleteSheetRow') return EntryService.deleteSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.columnsToClear);
    if (action === 'updateFundTransaction') return FundService.updateFundTransaction(safeBody.year, safeBody.rowIndex, safeBody.transaction);
    if (action === 'deleteFundTransaction') return FundService.deleteFundTransaction(safeBody.year, safeBody.rowIndex);
    if (action === 'addFundTransaction') return FundService.addFundTransaction(safeBody.year, safeBody.transaction);
    if (action === 'addFundLoan') return FundService.addFundLoan(safeBody.year, safeBody.loan);
    if (action === 'addFundLoanPayment') return FundService.addFundLoanPayment(safeBody.year, safeBody.payment);
    if (action === 'saveFundCatalogItem') return FundService.saveFundCatalogItem(safeBody.year, safeBody.item || safeBody.payload || safeBody);
    if (action === 'deleteFundCatalogItem') return FundService.deleteFundCatalogItem(safeBody.year, safeBody.item || safeBody.payload || safeBody);
    throw new Error('Hành động POST không hợp lệ: ' + action);
  }

  throw new Error('Phương thức không hợp lệ: ' + normalizedMethod);
}
