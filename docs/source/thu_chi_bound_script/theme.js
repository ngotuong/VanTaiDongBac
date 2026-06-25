/**
 * Pinterest-inspired theme for the dashboard/category area.
 *
 * Reference palette:
 *   #0D1D25  deep ink
 *   #104C64  teal
 *   #C6C6D0  mist
 *   #D59D80  soft clay
 *   #C0754D  rust
 *   #B6410F  ember
 *
 * These functions deliberately avoid clearFormat(), copyFormatToRange(), and
 * broad border updates. They only touch colors, font basics, and alignment so
 * existing borders, merges, formulas, validations, and number formats survive.
 *
 * Note about drawn buttons: Google Apps Script can move/remove drawings but
 * cannot recolor the fill of inserted Drawing/Image buttons. The theme styles
 * the cells underneath/around those buttons so the dashboard reads as one
 * consistent palette. Recoloring the drawing itself still has to be done once
 * inside the Google Sheets drawing editor.
 */
var PINTEREST_THEME = {
  ink: '#0D1D25',
  teal: '#104C64',
  mist: '#C6C6D0',
  clay: '#D59D80',
  rust: '#C0754D',
  ember: '#B6410F',

  canvas: '#2F3425',
  canvasAlt: '#3D422F',
  paper: '#F5EBDD',
  paperAlt: '#EFE2D0',
  tealSoft: '#D7E4DB',
  tealMid: '#6E8F7A',
  claySoft: '#F0CEB8',
  rustSoft: '#E3AE8C',
  buttonBlue: '#104C64',
  buttonGreen: '#6E8F7A',
  buttonOrange: '#C0754D',
  buttonRed: '#B6410F',
  buttonNeutral: '#C6C6D0',
  grid: '#BFAF9F',
  white: '#FFFFFF',
  black: '#111827'
};

function applyPinterestTheme() {
  applyPinterestThemeThuChi();
  applyPinterestThemeVay();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Đã áp theme Pinterest cho vùng danh mục. Đường viền cũ được giữ nguyên.',
    'Giao diện',
    4
  );
}

function applyPinterestThemeThuChi() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BC_THUCHI');
  if (!sheet) return;

  var t = PINTEREST_THEME;

  // Dashboard background only. This intentionally avoids amount columns.
  setThemeStyle_(sheet, [
    'A1:C3',
    'N1:Y16',
    'A4:B16',
    'F4:F16',
    'I1:I16',
    'L1:L3',
    'O1:O3',
    'T1:T4',
    'X1:Y16'
  ], {
    background: t.canvas,
    fontColor: t.white,
    fontFamily: 'Mulish',
    fontSize: 11,
    hAlign: 'center',
    vAlign: 'middle'
  });

  // Title and notice area.
  setThemeStyle_(sheet, ['G1:N1'], {
    background: t.ink,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['T1:X2'], {
    background: t.canvasAlt,
    fontColor: t.paper,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });

  // Time controls and date cells.
  setThemeStyle_(sheet, ['C2:C2', 'K2:M2'], {
    background: t.paper,
    fontColor: t.ember,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['C2:E2', 'G2:J2'], {
    background: t.buttonNeutral,
    fontColor: t.ink,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['C3:J3'], {
    background: t.canvas,
    fontColor: t.paper,
    hAlign: 'center',
    vAlign: 'middle'
  });

  // Summary block. E4:E10 used to show cash totals, but column E also hosts
  // the data-table income category below, so only style the active summary cells.
  setThemeStyle_(sheet, ['C4:D4'], {
    background: t.teal,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['C5:D10', 'C12:D14'], {
    background: t.paper,
    fontColor: t.ink,
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['C11:D11'], {
    background: t.ember,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });

  // Income/category group.
  setThemeStyle_(sheet, ['G4:I4'], {
    background: t.teal,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['G5:G13'], {
    background: t.tealSoft,
    fontColor: t.ink,
    vAlign: 'middle'
  });

  // Expense/category groups.
  setThemeStyle_(sheet, ['J4:X4'], {
    background: t.rust,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['J5:J13', 'M5:M13', 'R5:R13', 'V5:V13'], {
    background: t.claySoft,
    fontColor: t.ink,
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['P5:Q13'], {
    background: t.paperAlt,
    fontColor: t.ink,
    vAlign: 'middle'
  });

  // Cells underneath/next to drawn "Xem" buttons and arrow indicators.
  // Alignment pushes the arrow out from under the drawing button.
  setThemeStyle_(sheet, ['I4:I13', 'L5:L13', 'O4:O13', 'T5:T13', 'X5:X13', 'E11:E13'], {
    background: t.buttonNeutral,
    fontColor: t.ember,
    fontWeight: 'bold',
    hAlign: 'right',
    vAlign: 'middle'
  });

  // Top action-button anchor zones. These support the drawn buttons visually.
  setThemeStyle_(sheet, ['N2:O3'], {
    background: t.buttonBlue,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['P2:Q2'], {
    background: t.buttonOrange,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['P3:Q3'], {
    background: t.buttonRed,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });

  // Filter/control strip immediately above the data table.
  setThemeStyle_(sheet, ['C15:N15'], {
    background: t.paperAlt,
    fontColor: t.ink,
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['A16:N16'], {
    background: t.ink,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['O16:V16'], {
    background: t.canvasAlt,
    fontColor: t.paper,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });

  if (typeof styleThuChiCellButtons_ === 'function') {
    styleThuChiCellButtons_();
  }

  sheet.setHiddenGridlines(true);
}

function applyPinterestThemeVay() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BC_VAY');
  if (!sheet) return;

  var t = PINTEREST_THEME;

  // Only the top/category/control area. Data rows are intentionally left alone.
  setThemeStyle_(sheet, ['A1:AM5'], {
    background: t.canvas,
    fontColor: t.white,
    fontFamily: 'Mulish',
    fontSize: 11,
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['B4:N5', 'P4:AB5'], {
    background: t.teal,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['I4:N5', 'X4:AB5'], {
    background: t.rust,
    fontColor: t.white,
    fontWeight: 'bold',
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['B1:H3', 'P1:W3'], {
    background: t.paperAlt,
    fontColor: t.ink,
    hAlign: 'center',
    vAlign: 'middle'
  });
  setThemeStyle_(sheet, ['I1:N3', 'X1:AB3'], {
    background: t.buttonNeutral,
    fontColor: t.ink,
    hAlign: 'center',
    vAlign: 'middle'
  });

  if (typeof styleVayCellButtons_ === 'function') {
    styleVayCellButtons_();
  }

  sheet.setHiddenGridlines(true);
}

function refreshPinterestThemeBorders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var t = PINTEREST_THEME;
  var thuchi = ss.getSheetByName('BC_THUCHI');
  var vay = ss.getSheetByName('BC_VAY');

  // Optional repair only. The normal theme functions do not change borders.
  if (thuchi) {
    setThemeBorders_(thuchi, ['C4:X13', 'C15:N16'], t.grid);
  }

  if (vay) {
    setThemeBorders_(vay, ['B4:N5', 'P4:AB5'], t.grid);
  }

  ss.toast('Đã làm mới đường viền mỏng cho vùng danh mục.', 'Giao diện', 4);
}

function setThemeStyle_(sheet, ranges, style) {
  var list = sheet.getRangeList(ranges);

  if (style.background) list.setBackground(style.background);
  if (style.fontColor) list.setFontColor(style.fontColor);
  if (style.fontWeight) list.setFontWeight(style.fontWeight);
  if (style.fontFamily) list.setFontFamily(style.fontFamily);
  if (style.fontSize) list.setFontSize(style.fontSize);
  if (style.hAlign) list.setHorizontalAlignment(style.hAlign);
  if (style.vAlign) list.setVerticalAlignment(style.vAlign);
}

function setThemeBorders_(sheet, ranges, color) {
  ranges.forEach(function(a1) {
    sheet.getRange(a1).setBorder(true, true, true, true, true, true, color, SpreadsheetApp.BorderStyle.SOLID);
  });
}
