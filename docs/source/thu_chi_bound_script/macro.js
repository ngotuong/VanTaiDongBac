/** @NotOnlyCurrentDoc */
function xoa(){
  resetXemCellButtons_();
}

function xoa2(){
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getActiveSheet().getRangeList(['C3:E3', 'G3:J3']).setValue(false);

}

function setThuChiTimeControl_(a1) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BC_THUCHI');
  if (!sheet) return;
  sheet.getRangeList(['C3:E3', 'G3:J3']).setValue(false);
  sheet.getRange(a1).setValue(true);
}

function setVayTimeControl_(a1) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BC_VAY');
  if (!sheet) return;
  sheet.getRange('P4:S4').setValue(false);
  sheet.getRange(a1).setValue(true);
}

function setThuChiViewControl_(a1) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BC_THUCHI');
  if (!sheet) return;
  sheet.getRange('P1:P2').setValue(false);
  sheet.getRange(a1).setValue(true);
}

function setChiSummaryHeader_(sheet, label) {
  sheet.getRange('K4').setValue(label);
  sheet.getRange('L4').clearContent();
}

function tongquanvay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_VAY'), true);
};


function khoanvay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('NHAP_VAY'), true);
};

function inhoadon() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('INPHIEU'), true);
};

function nhapthuchi() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('NHAP_THUCHI'), true);
};

function back() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_THUCHI'), true);
};

function caidat() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('CAIDAT'), true);
};

function xemthuchi() {
  var spreadsheet = SpreadsheetApp.getActive();
  var ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BC_THUCHI");
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_THUCHI'), true);
  ss.getRange('A18:B18').clearContent();
  ss.getRange('N17').clearContent();
  ss.getRange('D15').setValue("THU CHI");
  ss.getRange('A16').setValue("Thu chi");
  ss.getRange('G4').setValue("THU TRONG KỲ:");
  setChiSummaryHeader_(ss, "TỔNG CHI TRONG KỲ:");
  xoa();
  setThuChiViewControl_('P1');
  ss.getRange('B19').activate();
};

function xemcongno() {
  var spreadsheet = SpreadsheetApp.getActive();
  var ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BC_THUCHI");
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_THUCHI'), true);
  
  ss.getRange('A18:B18').clearContent();
  ss.getRange('D15').setValue("CÔNG NỢ");
  ss.getRange('N17').setValue('Công nợ');
  ss.getRange('A16').setValue("Công nợ");
  ss.getRange('G4').setValue("CN PHẢI THU:");
  setChiSummaryHeader_(ss, "CÔNG NỢ PHẢI TRẢ:");
  xoa();
  setThuChiViewControl_('P2');
  spreadsheet.getRange('E11').setValue(true);
  ss.getRange('B19').activate();
};


function congnophaithu() {
  xoa();
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').setFormula('=B1');
  spreadsheet.getRange('M2').setFormula('=C1');
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').clearContent();
  spreadsheet.getRange('E12').setValue(true);
  var ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BC_THUCHI");
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_THUCHI'), true);
  
  ss.getRange('D15').setValue("CÔNG NỢ");
  ss.getRange('N17').setValue('Công nợ');
  ss.getRange('A16').setValue("Công nợ");
  ss.getRange('G4').setValue("CN PHẢI THU:");
  setChiSummaryHeader_(ss, "CÔNG NỢ PHẢI TRẢ:");
  setThuChiViewControl_('P2');
  ss.getRange('B19').activate();
};

function congnophaitra() {
  xoa();
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').setFormula('=B1');
  spreadsheet.getRange('M2').setFormula('=C1');
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').clearContent();
  spreadsheet.getRange('E13').setValue(true);
  var ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BC_THUCHI");
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_THUCHI'), true);
  
  ss.getRange('D15').setValue("CÔNG NỢ");
  ss.getRange('N17').setValue('Công nợ');
  ss.getRange('A16').setValue("Công nợ");
  ss.getRange('G4').setValue("CN PHẢI THU:");
  setChiSummaryHeader_(ss, "CÔNG NỢ PHẢI TRẢ:");
  setThuChiViewControl_('P2');
  ss.getRange('B19').activate();
};


function tatcathoigian() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=B1');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1');
  xoa2();
  setThuChiTimeControl_('C3');
  spreadsheet.getRange('B19').activate();
};

function homnay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1');
  xoa2();
  setThuChiTimeControl_('D3');
  spreadsheet.getRange('B19').activate();
};

function homqua() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1-1');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1-1');
  xoa2();
  setThuChiTimeControl_('E3');
  spreadsheet.getRange('B19').activate();
};

function tuannay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1- WEEKDAY(C1;2)+1');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=TODAY()');
  xoa2();
  setThuChiTimeControl_('G3');
  spreadsheet.getRange('B19').activate();
};

function tuantruoc() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1- WEEKDAY(C1;2)-6');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=K2+6');
  xoa2();
  setThuChiTimeControl_('H3');
  spreadsheet.getRange('B19').activate();
};

function thangnay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1- DAY(C1)+1');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=TODAY()');
  xoa2();
  setThuChiTimeControl_('I3');
  spreadsheet.getRange('B19').activate();
};

function thangtruoc() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('K2').activate();
  spreadsheet.getCurrentCell().setFormula('=C1- DAY(C1)+1-DAY(DATE(YEAR(C1);MONTH(C1);0))');
  spreadsheet.getRange('M2').activate();
  spreadsheet.getCurrentCell().setFormula('=K2+DAY(DATE(YEAR(C1);MONTH(C1);0))-1');
  xoa2();
  setThuChiTimeControl_('J3');
  spreadsheet.getRange('B19').activate();
};

function tatcachitieu() {
  var spreadsheet = SpreadsheetApp.getActive();
  xoa();
  spreadsheet.getRange('N17').clearContent();
  spreadsheet.getRange('A18:B18').clearContent();
  spreadsheet.getRange('D15').setValue("THU CHI");
  spreadsheet.getRange('A16').setValue("Thu chi");
  spreadsheet.getRange('G4').setValue("THU TRONG KỲ:");
  setChiSummaryHeader_(spreadsheet.getActiveSheet(), "TỔNG CHI TRONG KỲ:");
  setThuChiViewControl_('P1');
  spreadsheet.getRange('B19').activate();
};

function tatcacongno() {
  var spreadsheet = SpreadsheetApp.getActive();
  xoa();
  spreadsheet.getRange('N17').setValue('Công nợ');
  spreadsheet.getRange('D15').setValue("CÔNG NỢ");
  spreadsheet.getRange('A18:B18').clearContent();
  spreadsheet.getRange('A16').setValue("Công nợ");
  spreadsheet.getRange('G4').setValue("CN PHẢI THU:");
  setChiSummaryHeader_(spreadsheet.getActiveSheet(), "CÔNG NỢ PHẢI TRẢ:");
  setThuChiViewControl_('P2');
  spreadsheet.getRange('B19').activate();
};

function xemthu() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').clearContent();
  xoa();
  spreadsheet.getRange('I4').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function xemchi() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').clearContent();
  xoa();
  spreadsheet.getRange('O4').setValue(true);
  spreadsheet.getRange('B19').activate();
};


function thu1() {
  var spreadsheet = SpreadsheetApp.getActive();
  xoa();
  spreadsheet.getRange('I5').setValue(true);
  locvay();
};

function thu2() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G6').getValue());
  xoa();
  spreadsheet.getRange('I6').setValue(true);
  spreadsheet.getRange('B19').activate();
};
function thu3() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G7').getValue());
  xoa();
  spreadsheet.getRange('I7').setValue(true);
  spreadsheet.getRange('B19').activate();
};
function thu4() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G8').getValue());
  xoa();
  spreadsheet.getRange('I8').setValue(true);
  spreadsheet.getRange('B19').activate();
};
function thu5() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G9').getValue());
  xoa();
  spreadsheet.getRange('I9').setValue(true);
  spreadsheet.getRange('B19').activate();
};
function thu6() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G10').getValue());
  xoa();
  spreadsheet.getRange('I10').setValue(true);
  spreadsheet.getRange('B19').activate();
};
function thu7() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G11').getValue());
  xoa();
  spreadsheet.getRange('I11').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function thu8() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G12').getValue());
  xoa();
  spreadsheet.getRange('I12').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function thu9() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('THU');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('G13').getValue());
  xoa();
  spreadsheet.getRange('I13').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi1() {
  var spreadsheet = SpreadsheetApp.getActive();
  xoa();
  spreadsheet.getRange('L5').setValue(true);
  loctrano();
};

function chi2() {
  var spreadsheet = SpreadsheetApp.getActive();
  xoa();
  spreadsheet.getRange('L6').setValue(true);
  loctralai();
};

function chi3() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J7').getValue());
  xoa();
  spreadsheet.getRange('L7').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi4() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J8').getValue());
  xoa();
  spreadsheet.getRange('L8').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi5() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J9').getValue());
  xoa();
  spreadsheet.getRange('L9').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi6() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J10').getValue());
  xoa();
  spreadsheet.getRange('L10').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi7() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J11').getValue());
  xoa();
  spreadsheet.getRange('L11').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi8() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J12').getValue());
  xoa();
  spreadsheet.getRange('L12').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi9() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('J13').getValue());
  xoa();
  spreadsheet.getRange('L13').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi10() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M5').getValue());
  xoa();
  spreadsheet.getRange('O5').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi11() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M6').getValue());
  xoa();
  spreadsheet.getRange('O6').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi12() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M7').getValue());
  xoa();
  spreadsheet.getRange('O7').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi13() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M8').getValue());
  xoa();
  spreadsheet.getRange('O8').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi14() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M9').getValue());
  xoa();
  spreadsheet.getRange('O9').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi15() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M10').getValue());
  xoa();
  spreadsheet.getRange('O10').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi16() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M1').getValue());
  xoa();
  spreadsheet.getRange('O11').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi17() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M12').getValue());
  xoa();
  spreadsheet.getRange('O12').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi18() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('M13').getValue());
  xoa();
  spreadsheet.getRange('O13').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi19() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R5').getValue());
  xoa();
  spreadsheet.getRange('T5').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi20() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R6').getValue());
  xoa();
  spreadsheet.getRange('T6').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi21() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R7').getValue());
  xoa();
  spreadsheet.getRange('T7').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi22() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R8').getValue());
  xoa();
  spreadsheet.getRange('T8').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi23() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R9').getValue());
  xoa();
  spreadsheet.getRange('T9').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi24() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R10').getValue());
  xoa();
  spreadsheet.getRange('T10').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi25() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R11').getValue());
  xoa();
  spreadsheet.getRange('T11').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi26() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R12').getValue());
  xoa();
  spreadsheet.getRange('T12').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi27() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('R13').getValue());
  xoa();
  spreadsheet.getRange('T13').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi28() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V5').getValue());
  xoa();
  spreadsheet.getRange('X5').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi29() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V6').getValue());
  xoa();
  spreadsheet.getRange('X6').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi30() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V7').getValue());
  xoa();
  spreadsheet.getRange('X7').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi31() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V8').getValue());
  xoa();
  spreadsheet.getRange('X8').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi32() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V9').getValue());
  xoa();
  spreadsheet.getRange('X9').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi33() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V10').getValue());
  xoa();
  spreadsheet.getRange('X10').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi34() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V11').getValue());
  xoa();
  spreadsheet.getRange('X11').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi35() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V12').getValue());
  xoa();
  spreadsheet.getRange('X12').setValue(true);
  spreadsheet.getRange('B19').activate();
};

function chi36() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A18').setValue('CHI');
  spreadsheet.getRange('B18').setValue(spreadsheet.getRange('V13').getValue());
  xoa();
  spreadsheet.getRange('X13').setValue(true);
  spreadsheet.getRange('B19').activate();
};


function ls_tatcathoigian() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('T3').activate();
  spreadsheet.getCurrentCell().setFormula('=IF(B1>0;B1;C1)');
  spreadsheet.getRange('V3').activate();
  spreadsheet.getCurrentCell().setFormula('=C1');
  setVayTimeControl_('P4');
  spreadsheet.getRange('P11').activate();
};

function ls_thangnay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('T3').activate();
  spreadsheet.getCurrentCell().setFormula('=C1- DAY(C1)+1');
  spreadsheet.getRange('V3').activate();
  spreadsheet.getCurrentCell().setFormula('=C1');
  setVayTimeControl_('Q4');
  spreadsheet.getRange('P11').activate();
};

function ls_thangtruoc() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('T3').activate();
  spreadsheet.getCurrentCell().setFormula('=C1- DAY(C1)+1-DAY(DATE(YEAR(C1);MONTH(C1);0))');
  spreadsheet.getRange('V3').activate();
  spreadsheet.getCurrentCell().setFormula('=T3+DAY(DATE(YEAR(C1);MONTH(C1);0))-1');
  setVayTimeControl_('R4');
  spreadsheet.getRange('P11').activate();
};

function ls_namnay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('T3').activate();
  spreadsheet.getCurrentCell().setFormula('=DATE(YEAR(C1);1;1)');
  spreadsheet.getRange('V3').activate();
  spreadsheet.getCurrentCell().setFormula('=C1');
  setVayTimeControl_('S4');
  spreadsheet.getRange('P11').activate();
};

function xemvay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A1').activate();
  spreadsheet.getCurrentCell().setValue('Vay');
  spreadsheet.getRange('H13').activate();
};

function xemtralai() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A1').activate();
  spreadsheet.getCurrentCell().setValue('Trả lãi');
  spreadsheet.getRange('P13').activate();
};

function xemtrano() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A1').activate();
  spreadsheet.getCurrentCell().setValue('Trả nợ');
  spreadsheet.getRange('P13').activate();
};

function xemtatcavay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A1').activate();
  spreadsheet.getActiveRangeList().clear({contentsOnly: true, skipFilteredRows: true});
  spreadsheet.getRange('P13').activate();
};


function xoaloc() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('C15').clearContent();
  spreadsheet.getRange('H15').clearContent();
  spreadsheet.getRange('J15:K15').clearContent();
  spreadsheet.getRange('L15').setValue(false);
  spreadsheet.getRange('B19').activate();
};


function locvay() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_VAY'), true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var thuchi = ss.getSheetByName("BC_THUCHI");
  var vay = ss.getSheetByName("BC_VAY");
  var khoanvay = ss.getSheetByName("NHAP_VAY");
  var batdau = thuchi.getRange('D1').getValue();
  var ketthuc = thuchi.getRange('M2').getValue();
  vay.getRange('X11').activate();
  vay.getRange('P9').clearContent();
  vay.getRange('S9').clearContent();
  vay.getRange('R9').setValue('Vay');
  vay.getRange('T3').setValue(batdau);
  vay.getRange('V3').setValue(ketthuc);
  
};

function loctrano() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_VAY'), true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var thuchi = ss.getSheetByName("BC_THUCHI");
  var vay = ss.getSheetByName("BC_VAY");
  var khoanvay = ss.getSheetByName("NHAP_VAY");
  var batdau = thuchi.getRange('D1').getValue();
  var ketthuc = thuchi.getRange('M2').getValue();
  vay.getRange('X11').activate();
  vay.getRange('P9').clearContent();
  vay.getRange('S9').clearContent();
  vay.getRange('R9').setValue('Trả nợ');
  vay.getRange('T3').setValue(batdau);
  vay.getRange('V3').setValue(ketthuc);
  
};


function loctralai() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('BC_VAY'), true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var thuchi = ss.getSheetByName("BC_THUCHI");
  var vay = ss.getSheetByName("BC_VAY");
  var khoanvay = ss.getSheetByName("NHAP_VAY");
  var batdau = thuchi.getRange('D1').getValue();
  var ketthuc = thuchi.getRange('M2').getValue();
  vay.getRange('X11').activate();
  vay.getRange('P9').clearContent();
  vay.getRange('S9').clearContent();
  vay.getRange('R9').setValue('Trả lãi');
  vay.getRange('T3').setValue(batdau);
  vay.getRange('V3').setValue(ketthuc);
  
};
