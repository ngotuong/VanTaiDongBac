function getInitialData() {
  return SheetService.getInitialData();
}

function getBootstrap() {
  return SheetService.getBootstrap();
}

function getCatalogs(formType, forceRefresh) {
  return SheetService.getCatalogs(formType, forceRefresh);
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

function verifySubmittedRows(formType, rows) {
  return SheetService.verifySubmittedRows(formType, rows);
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

function getFundTransactions(year, filter) {
  return FundService.getFundTransactions(year, filter);
}

function getFundFormOptions(year, forceRefresh) {
  return FundService.getFundFormOptions(year, forceRefresh);
}

function getFundCatalog(year, group, forceRefresh) {
  return FundService.getFundCatalog(year, group, forceRefresh);
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

function invokeApi(method, action, params, bodyData) {
  var normalizedMethod = String(method || '').toUpperCase();
  var safeParams = params || {};
  var safeBody = bodyData || {};
  AppConfig.activate({
    spreadsheetId: safeBody.spreadsheetId || safeBody.ssId || safeParams.spreadsheetId || safeParams.ssId,
    year: safeBody.year || safeParams.year
  });

  if (normalizedMethod === 'GET') {
    if (action === 'getBootstrap') return SheetService.getBootstrap();
    if (action === 'getInitialData') return SheetService.getInitialData();
    if (action === 'getCatalogs') return SheetService.getCatalogs(safeParams.formType, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getDashboard') return SheetService.getDashboard(safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReports') return SheetService.getReports(safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReport') return SheetService.getReport(safeParams.type, safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getReportBundle') return SheetService.getReportBundle(safeParams.month, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'invalidateCaches') return SheetService.invalidateCaches();
    if (action === 'readSheetData') return SheetService.readSheetData(safeParams.sheetName, safeParams.startDate, safeParams.endDate, safeParams.limit);
    if (action === 'verifySubmittedRows') return SheetService.verifySubmittedRows(safeParams.formType, JSON.parse(safeParams.rows || '[]'));
    if (action === 'getFundTransactions') {
      return FundService.getFundTransactions(safeParams.year, {
        month: safeParams.month,
        limit: safeParams.limit,
        forceRefresh: safeParams.forceRefresh === true || safeParams.forceRefresh === 'true'
      });
    }
    if (action === 'getFundOverview') {
      return FundService.getFundOverview(safeParams.year, {
        month: safeParams.month,
        forceRefresh: safeParams.forceRefresh === true || safeParams.forceRefresh === 'true'
      });
    }
    if (action === 'getFundLoanOverview') {
      return FundService.getFundLoanOverview(safeParams.year, {
        month: safeParams.month,
        forceRefresh: safeParams.forceRefresh === true || safeParams.forceRefresh === 'true'
      });
    }
    if (action === 'getFundFormOptions') return FundService.getFundFormOptions(safeParams.year, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    if (action === 'getFundCatalog') return FundService.getFundCatalog(safeParams.year, safeParams.group, safeParams.forceRefresh === true || safeParams.forceRefresh === 'true');
    throw new Error('Hành động GET không hợp lệ: ' + action);
  }

  if (normalizedMethod === 'POST') {
    if (action === 'submitRows') return SheetService.submitRows(safeBody.formType, safeBody.rows);
    if (action === 'verifySubmittedRows') return SheetService.verifySubmittedRows(safeBody.formType, safeBody.rows);
    if (action === 'checkTripReconciliation') return SheetService.checkTripReconciliation(safeBody.rows);
    if (action === 'saveSheetRow') return SheetService.saveSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.rowData);
    if (action === 'deleteSheetRow') return SheetService.deleteSheetRow(safeBody.sheetName, safeBody.rowIndex, safeBody.columnsToClear);
    if (action === 'addFundTransaction') return FundService.addFundTransaction(safeBody.year, safeBody.transaction);
    if (action === 'addFundLoan') return FundService.addFundLoan(safeBody.year, safeBody.loan);
    if (action === 'addFundLoanPayment') return FundService.addFundLoanPayment(safeBody.year, safeBody.payment);
    if (action === 'saveFundCatalogItem') return FundService.saveFundCatalogItem(safeBody.year, safeBody.item || safeBody.payload || safeBody);
    if (action === 'deleteFundCatalogItem') return FundService.deleteFundCatalogItem(safeBody.year, safeBody.item || safeBody.payload || safeBody);
    throw new Error('Hành động POST không hợp lệ: ' + action);
  }

  throw new Error('Phương thức không hợp lệ: ' + normalizedMethod);
}
