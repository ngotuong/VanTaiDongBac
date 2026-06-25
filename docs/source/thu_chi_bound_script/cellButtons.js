/**
 * Edit-based dashboard controls for Google Sheets desktop and mobile.
 *
 * Checkboxes/dropdowns trigger onEdit, which is much more reliable on the
 * Google Sheets mobile app than onSelectionChange.
 */
var THUCHI_TIME_CONTROLS = {
  C3: 'tatcathoigian',
  D3: 'homnay',
  E3: 'homqua',
  G3: 'tuannay',
  H3: 'tuantruoc',
  I3: 'thangnay',
  J3: 'thangtruoc'
};

var THUCHI_ACTION_CONTROLS = {
  I4: 'xemthu',
  O4: 'xemchi',

  I5: 'thu1',
  I6: 'thu2',
  I7: 'thu3',
  I8: 'thu4',
  I9: 'thu5',
  I10: 'thu6',
  I11: 'thu7',
  I12: 'thu8',
  I13: 'thu9',

  L5: 'chi1',
  L6: 'chi2',
  L7: 'chi3',
  L8: 'chi4',
  L9: 'chi5',
  L10: 'chi6',
  L11: 'chi7',
  L12: 'chi8',
  L13: 'chi9',

  O5: 'chi10',
  O6: 'chi11',
  O7: 'chi12',
  O8: 'chi13',
  O9: 'chi14',
  O10: 'chi15',
  O11: 'chi16',
  O12: 'chi17',
  O13: 'chi18',

  T5: 'chi19',
  T6: 'chi20',
  T7: 'chi21',
  T8: 'chi22',
  T9: 'chi23',
  T10: 'chi24',
  T11: 'chi25',
  T12: 'chi26',
  T13: 'chi27',

  X5: 'chi28',
  X6: 'chi29',
  X7: 'chi30',
  X8: 'chi31',
  X9: 'chi32',
  X10: 'chi33',
  X11: 'chi34',
  X12: 'chi35',
  X13: 'chi36',

  E11: 'xemcongno',
  E12: 'congnophaithu',
  E13: 'congnophaitra',

  L15: 'xoaloc',
  P1: 'tatcachitieu',
  P2: 'tatcacongno'
};

var VAY_TIME_CONTROLS = {
  P4: 'ls_tatcathoigian',
  Q4: 'ls_thangnay',
  R4: 'ls_thangtruoc',
  S4: 'ls_namnay'
};

function onSelectionChange(e) {
  return;
}

function handleDashboardEdit_(e) {
  if (!e || !e.range) return false;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return false;

  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  var a1 = e.range.getA1Notation();
  var value = e.range.getValue();

  if (sheetName === 'BC_THUCHI' && THUCHI_TIME_CONTROLS[a1]) {
    if (value === true) runDashboardFunction_(THUCHI_TIME_CONTROLS[a1]);
    return true;
  }

  if (sheetName === 'BC_VAY' && VAY_TIME_CONTROLS[a1]) {
    if (value === true) runDashboardFunction_(VAY_TIME_CONTROLS[a1]);
    return true;
  }

  if (sheetName === 'BC_THUCHI' && THUCHI_ACTION_CONTROLS[a1]) {
    if (value === true) {
      runDashboardFunction_(THUCHI_ACTION_CONTROLS[a1]);
      resetOneShotAction_(sheet, a1);
    }
    return true;
  }

  return false;
}

function runDashboardFunction_(functionName) {
  var fn = globalThis[functionName];
  if (typeof fn !== 'function') return;

  fn();
}

function resetOneShotAction_(sheet, a1) {
  if (a1 === 'L15') sheet.getRange(a1).setValue(false);
}

function setupDashboardCellButtons() {
  setupThuChiCellButtons();
  setupVayCellButtons();
}

function setupThuChiCellButtons() {
  var sheet = getThuChiButtonSheet_();
  if (!sheet) return;

  resetXemCellButtons_();
  styleThuChiCellButtons_();

  sheet.getRange('C2').setValue('Tất cả');
  sheet.getRange('D2').setValue('Hôm nay');
  sheet.getRange('E2').setValue('Hôm qua');
  sheet.getRange('F2').clearContent();
  sheet.getRange('O1').setValue('Xem Thu Chi');
  sheet.getRange('O2').setValue('Xem Công Nợ');
  sheet.getRange('G2').setValue('Tuần này');
  sheet.getRange('H2').setValue('Tuần trước');
  sheet.getRange('I2').setValue('Tháng này');
  sheet.getRange('J2').setValue('Tháng trước');
  sheet.getRange('F3').clearContent();
  insertCheckboxes_(sheet, ['C3:E3', 'G3:J3']);
  sheet.getRangeList(['C3:E3', 'G3:J3']).setValue(false);
  insertCheckboxes_(sheet, [
    'I4:I13',
    'L5:L13',
    'O4:O13',
    'T5:T13',
    'X5:X13',
    'E11:E13',
    'L15:L15',
    'P1:P2'
  ]);
  resetXemCellButtons_();
  sheet.getRange('L15').setValue(false);
  sheet.getRange('P1:P2').setValue(false);
  sheet.getRange('M15:N15').clearContent().clearDataValidations();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Đã bật thử nghiệm nút bằng ô cho BC_THUCHI.',
    'Giao diện',
    4
  );
}

function setupVayCellButtons() {
  var sheet = getVayButtonSheet_();
  if (!sheet) return;

  sheet.getRange('P3').setValue('Tất cả');
  sheet.getRange('Q3').setValue('Tháng này');
  sheet.getRange('R3').setValue('Tháng trước');
  sheet.getRange('S3').setValue('Năm nay');
  insertCheckboxes_(sheet, ['P4:S4']);
  sheet.getRange('P4:S4').setValue(false);
  styleVayCellButtons_();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Đã bật thử nghiệm nút bằng ô cho BC_VAY.',
    'Giao diện',
    4
  );
}

function resetXemCellButtons_() {
  var sheet = getThuChiButtonSheet_();
  if (!sheet) return;

  [
    'I4:I13',
    'L5:L13',
    'O4:O13',
    'T5:T13',
    'X5:X13',
    'E11:E13'
  ].forEach(function(a1) {
    sheet.getRange(a1).setValue(false);
  });
}

function insertCheckboxes_(sheet, ranges) {
  ranges.forEach(function(a1) {
    sheet.getRange(a1).insertCheckboxes();
  });
}

function styleThuChiCellButtons_() {
  var sheet = getThuChiButtonSheet_();
  if (!sheet) return;

  var t = typeof PINTEREST_THEME !== 'undefined' ? PINTEREST_THEME : {
    ink: '#0D1D25',
    teal: '#104C64',
    mist: '#C6C6D0',
    clay: '#D59D80',
    rust: '#C0754D',
    ember: '#B6410F',
    white: '#FFFFFF'
  };

  setCellButtonStyle_(sheet, ['C2:E2', 'G2:J2'], t.mist, t.ink);
  setCellButtonStyle_(sheet, ['C3:E3', 'G3:J3'], t.canvas || '#2F3425', t.white);
  setCellButtonStyle_(sheet, ['O1:O2'], t.teal, t.white);
  setCellButtonStyle_(sheet, ['P1:P2'], t.teal, t.white);
  setCellButtonStyle_(sheet, ['I4:I13', 'L5:L13', 'O4:O13', 'T5:T13', 'X5:X13'], t.mist, t.ink);
  setCellButtonStyle_(sheet, ['E11:E13'], t.clay, t.ink);
  setCellButtonStyle_(sheet, ['L15:L15'], t.mist, t.ink);
}

function styleVayCellButtons_() {
  var sheet = getVayButtonSheet_();
  if (!sheet) return;

  var t = typeof PINTEREST_THEME !== 'undefined' ? PINTEREST_THEME : {
    ink: '#0D1D25',
    teal: '#104C64',
    mist: '#C6C6D0',
    white: '#FFFFFF'
  };

  setCellButtonStyle_(sheet, ['P3:P3'], t.mist, t.ink);
  setCellButtonStyle_(sheet, ['Q3:S3'], t.teal, t.white);
  setCellButtonStyle_(sheet, ['P4:S4'], t.teal, t.white);
}

function setCellButtonStyle_(sheet, ranges, background, fontColor) {
  var list = sheet.getRangeList(ranges);
  list.setBackground(background);
  list.setFontColor(fontColor);
  list.setFontWeight('bold');
  list.setFontFamily('Mulish');
  list.setFontSize(10);
  list.setHorizontalAlignment('center');
  list.setVerticalAlignment('middle');

  ranges.forEach(function(a1) {
    sheet
      .getRange(a1)
      .setBorder(true, true, true, true, false, false, '#0D1D25', SpreadsheetApp.BorderStyle.SOLID);
  });
}

function getThuChiButtonSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('BC_THUCHI');
}

function getVayButtonSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('BC_VAY');
}
