function doGet(e) {
  e = e || { parameter: {} };
  AppConfig.activateFromEvent(e);
  var action = e.parameter.action;
  try {
    if (!action) {
      // Direct access fallback: render UI for developer/admin convenience
      return renderIndex_();
    }
    
    if (action === 'debugSheet') {
      var ss = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
      var sheet = ss.getSheetByName('BC_TongQuan');
      var vals = sheet ? sheet.getRange(4, 1, 14, 8).getDisplayValues() : [];
      return ContentService.createTextOutput(JSON.stringify(vals)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getBootstrap') return jsonResponse_(SheetService.getBootstrap());
    if (action === 'getInitialData') return jsonResponse_(SheetService.getInitialData());
    if (action === 'getCatalogs') return jsonResponse_(SheetService.getCatalogs(e.parameter.formType));
    if (action === 'getDashboard') return jsonResponse_(SheetService.getDashboard(e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'getReports') return jsonResponse_(SheetService.getReports(e.parameter.forceRefresh === 'true'));
    if (action === 'getReport') return jsonResponse_(SheetService.getReport(e.parameter.type, e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'getReportBundle') return jsonResponse_(SheetService.getReportBundle(e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'invalidateCaches') return jsonResponse_(SheetService.invalidateCaches());
    if (action === 'readSheetData') return jsonResponse_(SheetService.readSheetData(e.parameter.sheetName, e.parameter.startDate, e.parameter.endDate, e.parameter.limit));
    
    throw new Error('Hành động GET không hợp lệ: ' + action);
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var contents = e.postData.contents;
    if (!contents) {
      throw new Error('Yêu cầu POST thiếu nội dung dữ liệu.');
    }
    var payload = JSON.parse(contents);
    AppConfig.activate({
      spreadsheetId: payload.spreadsheetId || payload.ssId,
      year: payload.year
    });
    var action = payload.action;
    
    if (action === 'submitRows') {
      var result = SheetService.submitRows(payload.formType, payload.rows);
      return jsonResponse_(result);
    }
    if (action === 'checkTripReconciliation') {
      var result = SheetService.checkTripReconciliation(payload.rows);
      return jsonResponse_(result);
    }
    if (action === 'saveSheetRow') {
      var result = SheetService.saveSheetRow(payload.sheetName, payload.rowIndex, payload.rowData);
      return jsonResponse_(result);
    }
    if (action === 'deleteSheetRow') {
      var result = SheetService.deleteSheetRow(payload.sheetName, payload.rowIndex, payload.columnsToClear);
      return jsonResponse_(result);
    }
    
    throw new Error('Hành động POST không hợp lệ: ' + action);
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function renderIndex_() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Vận tải Đông Bắc - Hệ thống điều hành nội bộ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

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
