function doGet(e) {
  e = e || { parameter: {} };
  AppConfig.activateFromEvent(e);
  var action = e.parameter.action;
  try {
    if (!action) {
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
    if (action === 'getFundTransactions') {
      return jsonResponse_(FundService.getFundTransactions(e.parameter.year, {
        month: e.parameter.month,
        limit: e.parameter.limit
      }));
    }
    if (action === 'getFundOverview') {
      return jsonResponse_(FundService.getFundOverview(e.parameter.year, {
        month: e.parameter.month
      }));
    }
    if (action === 'getFundLoanOverview') {
      return jsonResponse_(FundService.getFundLoanOverview(e.parameter.year, {
        month: e.parameter.month
      }));
    }
    if (action === 'getFundFormOptions') return jsonResponse_(FundService.getFundFormOptions(e.parameter.year));

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
      var submitResult = SheetService.submitRows(payload.formType, payload.rows);
      return jsonResponse_(submitResult);
    }
    if (action === 'checkTripReconciliation') {
      var checkResult = SheetService.checkTripReconciliation(payload.rows);
      return jsonResponse_(checkResult);
    }
    if (action === 'saveSheetRow') {
      var saveResult = SheetService.saveSheetRow(payload.sheetName, payload.rowIndex, payload.rowData);
      return jsonResponse_(saveResult);
    }
    if (action === 'deleteSheetRow') {
      var deleteResult = SheetService.deleteSheetRow(payload.sheetName, payload.rowIndex, payload.columnsToClear);
      return jsonResponse_(deleteResult);
    }
    if (action === 'addFundTransaction') {
      var fundResult = FundService.addFundTransaction(payload.year, payload.transaction);
      return jsonResponse_(fundResult);
    }
    if (action === 'addFundLoan') {
      var loanResult = FundService.addFundLoan(payload.year, payload.loan);
      return jsonResponse_(loanResult);
    }
    if (action === 'addFundLoanPayment') {
      var loanPaymentResult = FundService.addFundLoanPayment(payload.year, payload.payment);
      return jsonResponse_(loanPaymentResult);
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
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
