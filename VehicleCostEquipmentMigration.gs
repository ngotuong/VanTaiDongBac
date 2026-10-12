/**
 * Controlled migration for BC_TongHopXe vehicle costs.
 *
 * Adds vehicle-specific "Trang thiết bị" expenses to the report without
 * changing IMP_ThuChi classification used by other downstream reports. It
 * also gives expense-only vehicle/month pairs a report row, with zero trips,
 * mass and revenue.
 */
var VehicleCostEquipmentMigration = (function () {
  var IMPORT_SHEET_NAME = 'IMP_ThuChi';
  var REPORT_SHEET_NAME = 'BC_TongHopXe';
  var IMPORT_SHEET_ID = 1924990050;
  var REPORT_SHEET_ID = 20260623;
  var LEGACY_HEADER = 'Chi phí sửa chữa';
  var TARGET_HEADER = 'Chi phí xe';

  var LEGACY_BASE_FORMULA = '=QUERY({XL_VanChuyen!B2:B\\XL_VanChuyen!O2:O\\XL_VanChuyen!C2:C\\XL_VanChuyen!E2:E\\XL_VanChuyen!F2:F\\XL_VanChuyen!M2:M};"select Col1, Col2, Col3, sum(Col4), sum(Col5), sum(Col6) where Col1 is not null and Col3 is not null group by Col1, Col2, Col3 label sum(Col4) \'\', sum(Col5) \'\', sum(Col6) \'\'";0)';
  var TARGET_BASE_FORMULA = [
    '=LET(',
    'costRows;FILTER({IMP_ThuChi!G$2:G$999\\IMP_ThuChi!E$2:E$999&" "&IMP_ThuChi!F$2:F$999};',
    '((IMP_ThuChi!I$2:I$999="Chi phí xe")+(IMP_ThuChi!C$2:C$999="Trang thiết bị"))>0;',
    'REGEXMATCH(IMP_ThuChi!E$2:E$999&" "&IMP_ThuChi!F$2:F$999;"[0-9]{2}[A-Za-z][0-9]{4,5}"));',
    'months;INDEX(costRows;0;1);',
    'plates;MAP(INDEX(costRows;0;2);LAMBDA(txt;REGEXEXTRACT(UPPER(txt);"[0-9]{2}[A-Z][0-9]{4,5}")));',
    'companies;MAP(months;plates;LAMBDA(t;xe;IFNA(INDEX(FILTER(XL_VanChuyen!O$2:O;',
    'XL_VanChuyen!B$2:B=t;XL_VanChuyen!C$2:C=xe);1);',
    'XLOOKUP(xe;DM_Xe!B$2:B;DM_Xe!H$2:H;""))));',
    'zeroes;MAP(plates;LAMBDA(xe;0));',
    'QUERY({XL_VanChuyen!B2:B\\XL_VanChuyen!O2:O\\XL_VanChuyen!C2:C\\XL_VanChuyen!E2:E\\XL_VanChuyen!F2:F\\XL_VanChuyen!M2:M;',
    'months\\companies\\plates\\zeroes\\zeroes\\zeroes};',
    '"select Col1, Col2, Col3, sum(Col4), sum(Col5), sum(Col6) where Col1 is not null and Col3 is not null group by Col1, Col2, Col3 label sum(Col4) \'\', sum(Col5) \'\', sum(Col6) \'\'";0))'
  ].join('');

  var LEGACY_COST_FORMULA = '=MAP(A3:A1001;C3:C1001;LAMBDA(t;xe;IF(t="";"";IF(xe="";0;IFERROR(SUM(FILTER(IMP_ThuChi!D$2:D$999;IMP_ThuChi!G$2:G$999=t;IMP_ThuChi!I$2:I$999="Chi phí xe";REGEXMATCH(IMP_ThuChi!E$2:E$999&" "&IMP_ThuChi!F$2:F$999;xe)));0)))))';
  var TARGET_COST_FORMULA = [
    '=MAP(A3:A1001;C3:C1001;LAMBDA(t;xe;IF(t="";"";IF(xe="";0;',
    'IFERROR(SUM(FILTER(IMP_ThuChi!D$2:D$999;',
    'IMP_ThuChi!G$2:G$999=t;',
    '((IMP_ThuChi!I$2:I$999="Chi phí xe")+(IMP_ThuChi!C$2:C$999="Trang thiết bị"))>0;',
    'REGEXMATCH(IMP_ThuChi!E$2:E$999&" "&IMP_ThuChi!F$2:F$999;xe)));0)))))'
  ].join('');

  function getDryRun() {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var importSheet = spreadsheet.getSheetByName(IMPORT_SHEET_NAME);
    var reportSheet = spreadsheet.getSheetByName(REPORT_SHEET_NAME);
    if (!importSheet || !reportSheet) throw new Error('Missing IMP_ThuChi or BC_TongHopXe.');

    var state = readState_(importSheet, reportSheet);
    var checks = {
      exactImportSheetId: importSheet.getSheetId() === IMPORT_SHEET_ID,
      exactReportSheetId: reportSheet.getSheetId() === REPORT_SHEET_ID,
      importHeadersExact: JSON.stringify(importSheet.getRange('A1:J1').getValues()[0]) === JSON.stringify([
        'Số phiếu', 'Ngày', 'Mục', 'Số tiền', 'Đối tác', 'Nội dung', 'Tháng tính', 'Đối tượng', 'Loại tính', 'Công nợ'
      ]),
      reportWidthExact: reportSheet.getLastColumn() === 14,
      knownState: state.legacy || state.target
    };
    return {
      ok: Object.keys(checks).every(function (key) { return checks[key]; }),
      spreadsheetId: APP_CONFIG.spreadsheetId,
      state: state,
      checks: checks
    };
  }

  function run() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var dryRun = getDryRun();
      if (!dryRun.ok) throw new Error('Vehicle-cost migration dry-run failed: ' + JSON.stringify(dryRun.checks));
      if (dryRun.state.target) return { ok: true, alreadyMigrated: true, state: dryRun.state };
      if (!dryRun.state.legacy) throw new Error('BC_TongHopXe formulas changed; migration aborted.');

      var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
      var reportSheet = spreadsheet.getSheetByName(REPORT_SHEET_NAME);
      try {
        reportSheet.getRange('I2').setValue(TARGET_HEADER);
        reportSheet.getRange('A3').setFormula(TARGET_BASE_FORMULA);
        reportSheet.getRange('I3').setFormula(TARGET_COST_FORMULA);
        SpreadsheetApp.flush();
        var post = readState_(spreadsheet.getSheetByName(IMPORT_SHEET_NAME), reportSheet);
        if (!post.target) throw new Error('Vehicle-cost migration post-write verification failed.');
        return { ok: true, migrated: true, state: post };
      } catch (err) {
        reportSheet.getRange('I2').setValue(LEGACY_HEADER);
        reportSheet.getRange('A3').setFormula(LEGACY_BASE_FORMULA);
        reportSheet.getRange('I3').setFormula(LEGACY_COST_FORMULA);
        SpreadsheetApp.flush();
        throw err;
      }
    } finally {
      lock.releaseLock();
    }
  }

  function rollback() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
      var importSheet = spreadsheet.getSheetByName(IMPORT_SHEET_NAME);
      var reportSheet = spreadsheet.getSheetByName(REPORT_SHEET_NAME);
      if (!importSheet || !reportSheet) throw new Error('Missing IMP_ThuChi or BC_TongHopXe.');
      var state = readState_(importSheet, reportSheet);
      if (state.legacy) return { ok: true, alreadyRolledBack: true, state: state };
      if (!state.target) throw new Error('BC_TongHopXe formulas changed after migration; rollback aborted.');
      reportSheet.getRange('I2').setValue(LEGACY_HEADER);
      reportSheet.getRange('A3').setFormula(LEGACY_BASE_FORMULA);
      reportSheet.getRange('I3').setFormula(LEGACY_COST_FORMULA);
      SpreadsheetApp.flush();
      var post = readState_(importSheet, reportSheet);
      if (!post.legacy) throw new Error('Vehicle-cost migration rollback verification failed.');
      return { ok: true, rolledBack: true, state: post };
    } finally {
      lock.releaseLock();
    }
  }

  function readState_(importSheet, reportSheet) {
    var header = String(reportSheet.getRange('I2').getValue() || '').trim();
    var baseFormula = reportSheet.getRange('A3').getFormula();
    var costFormula = reportSheet.getRange('I3').getFormula();
    return {
      importSheetId: importSheet.getSheetId(),
      reportSheetId: reportSheet.getSheetId(),
      header: header,
      baseFormula: baseFormula,
      costFormula: costFormula,
      legacy: header === LEGACY_HEADER && baseFormula === LEGACY_BASE_FORMULA && costFormula === LEGACY_COST_FORMULA,
      target: header === TARGET_HEADER && baseFormula === TARGET_BASE_FORMULA && costFormula === TARGET_COST_FORMULA
    };
  }

  return {
    getDryRun: getDryRun,
    run: run,
    rollback: rollback
  };
})();

function getVehicleCostEquipmentMigrationDryRun() {
  var result = VehicleCostEquipmentMigration.getDryRun();
  console.log(JSON.stringify(result));
  return result;
}

function runVehicleCostEquipmentMigration() {
  var result = VehicleCostEquipmentMigration.run();
  console.log(JSON.stringify(result));
  return result;
}

function rollbackVehicleCostEquipmentMigration() {
  var result = VehicleCostEquipmentMigration.rollback();
  console.log(JSON.stringify(result));
  return result;
}
