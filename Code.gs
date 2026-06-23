var APP_CONFIG = {
  spreadsheetId: '1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA',
  timezone: 'Asia/Saigon',
  sheets: {
    vanChuyen: { name: 'NL_VanChuyen', headerRow: 2, columns: 7 },
    taiXe: { name: 'NL_TaiXe', headerRow: 1, columns: 6 },
    dau: { name: 'NL_Dau', headerRow: 2, columns: 8 },
    chamCong: { name: 'NL_ChamCong', headerRow: 1, columns: 9 },
    phat: { name: 'NL_Phat', headerRow: 1, columns: 7 },
    nghiVanHanh: { name: 'NL_NghiVanHanh', headerRow: 1, columns: 9 }
  }
};

function doGet(e) {
  var action = e.parameter.action;
  try {
    if (!action) {
      // Direct access fallback: render UI for developer/admin convenience
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('Vận tải Đông Bắc - Hệ thống điều hành nội bộ')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
    }
    
    if (action === 'getBootstrap') return jsonResponse_(SheetService.getBootstrap());
    if (action === 'getInitialData') return jsonResponse_(SheetService.getInitialData());
    if (action === 'getCatalogs') return jsonResponse_(SheetService.getCatalogs(e.parameter.formType));
    if (action === 'getDashboard') return jsonResponse_(SheetService.getDashboard(e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'getReports') return jsonResponse_(SheetService.getReports(e.parameter.forceRefresh === 'true'));
    if (action === 'getReport') return jsonResponse_(SheetService.getReport(e.parameter.type, e.parameter.month, e.parameter.forceRefresh === 'true'));
    if (action === 'getReportBundle') return jsonResponse_(SheetService.getReportBundle(e.parameter.month, e.parameter.forceRefresh === 'true'));
    
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
    var action = payload.action;
    
    if (action === 'submitRows') {
      var result = SheetService.submitRows(payload.formType, payload.rows);
      return jsonResponse_(result);
    }
    if (action === 'checkTripReconciliation') {
      var result = SheetService.checkTripReconciliation(payload.rows);
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

function submitRows(formType, rows) {
  return SheetService.submitRows(formType, rows);
}

function checkTripReconciliation(rows) {
  return SheetService.checkTripReconciliation(rows);
}
