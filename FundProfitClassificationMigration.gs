/**
 * Controlled migration for monthly profit classification in VanTaiDongBac_2026.
 *
 * Keeps debt settlements and shareholder profit distributions in the Fund cash
 * flow while excluding them from the monthly operating-profit deduction. It
 * also reconciles imported expenses by an exact transaction identity instead
 * of assuming that voucher numbers are unique for debt-payment rows.
 */
var FundProfitClassificationMigration = (function () {
  var SPREADSHEET_ID = '1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA';
  var IMPORT_SHEET_NAME = 'IMP_ThuChi';
  var REPORT_SHEET_NAME = 'BC_TongQuan';
  var QA_SHEET_NAME = 'SYS_QA';
  var IMPORT_SHEET_ID = 1924990050;
  var REPORT_SHEET_ID = 20260626;
  var QA_SHEET_ID = 597210335;
  var SNAPSHOT_PROPERTY = 'FUND_PROFIT_CLASSIFICATION_MIGRATION_SNAPSHOT_2026';
  var APPROVAL_PROPERTY = 'FUND_PROFIT_CLASSIFICATION_MIGRATION_APPROVAL_2026';
  var ROLLBACK_APPROVAL_PROPERTY = 'FUND_PROFIT_CLASSIFICATION_MIGRATION_ROLLBACK_APPROVAL_2026';

  var LEGACY_CLASSIFICATION_FORMULA = '=ARRAYFORMULA(IF(C2:C5001="";"";IFS(C2:C5001="Ứng lương";"Ứng lương";C2:C5001="Vi phạm GT";"Phạt";C2:C5001="Thưởng tuyển lái";"Thưởng";C2:C5001="Thưởng khác";"Thưởng";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"thuế|thue");"Thuế";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"trả lương|tra luong");"Trả lương";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"phí đi đường|phi di duong");"Phí đi đường";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"phí phường|phi phuong");"Phí Phường";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"góp quỹ|gop quy");"Góp quỹ";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"dầu|dau|xăng|xang|diesel|diezen");"Xăng dầu xe";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"sửa|sua|bảo dưỡng|bao duong|vật tư|phụ tùng|phu tung|đăng kiểm|dang kiem|bảo hiểm|bao hiem|cầu đường|cau duong");"Chi phí xe";TRUE;"Khác")))';
  var TARGET_CLASSIFICATION_FORMULA = '=ARRAYFORMULA(IF(C2:C5001="";"";IFS(REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"tất toán công nợ|tat toan cong no|thanh toán công nợ|thanh toan cong no|trả công nợ|tra cong no");"Thanh toán công nợ";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"chia lợi nhuận|chia loi nhuan|chi trả lợi nhuận|chi tra loi nhuan|trả lợi nhuận|tra loi nhuan|phân phối lợi nhuận|phan phoi loi nhuan");"Phân phối lợi nhuận";C2:C5001="Ứng lương";"Ứng lương";C2:C5001="Vi phạm GT";"Phạt";C2:C5001="Thưởng tuyển lái";"Thưởng";C2:C5001="Thưởng khác";"Thưởng";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"thuế|thue");"Thuế";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"trả lương|tra luong");"Trả lương";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"phí đi đường|phi di duong");"Phí đi đường";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"phí phường|phi phuong");"Phí Phường";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"góp quỹ|gop quy");"Góp quỹ";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"dầu|dau|xăng|xang|diesel|diezen");"Xăng dầu xe";REGEXMATCH(LOWER(C2:C5001&" "&E2:E5001&" "&F2:F5001);"sửa|sua|bảo dưỡng|bao duong|vật tư|phụ tùng|phu tung|đăng kiểm|dang kiem|bảo hiểm|bao hiem|cầu đường|cau duong");"Chi phí xe";TRUE;"Khác")))';

  var LEGACY_FUND_COST_FORMULA = `=MAP(G5:G20;LAMBDA(t;IF(t="";"";IFERROR(SUM(FILTER(
IMP_ThuChi!D$2:D$5001;
IMP_ThuChi!G$2:G$5001=t;
LOWER(TRIM(IMP_ThuChi!J$2:J$5001))<>"có";
IMP_ThuChi!K$2:K$5001<>TRUE;
NOT((LOWER(TRIM(IMP_ThuChi!C$2:C$5001))="vi phạm gt")*(LOWER(TRIM(IMP_ThuChi!E$2:E$5001))<>"công ty"));
NOT(REGEXMATCH(LOWER(IMP_ThuChi!C$2:C$5001);"xăng dầu|xang dau|dầu|dau"));
NOT(REGEXMATCH(LOWER(IMP_ThuChi!C$2:C$5001&" "&IMP_ThuChi!I$2:I$5001);"góp quỹ|gop quy|thuế doanh nghiệp|thue doanh nghiep|thuế tndn|thue tndn|thuế vat|thue vat|vat|phí đi đường|phi di duong|phí phường|phi phuong|trả lương|tra luong|ứng lương|ung luong"))
));0)
+IFERROR(SUM(FILTER(
IMP_ThuChi!D$2:D$5001;
IMP_ThuChi!G$2:G$5001=t;
LOWER(TRIM(IMP_ThuChi!J$2:J$5001))<>"có";
IMP_ThuChi!K$2:K$5001=TRUE;
((LOWER(TRIM(IMP_ThuChi!C$2:C$5001))="sửa chữa")+(LOWER(TRIM(IMP_ThuChi!C$2:C$5001))="trang thiết bị"))>0
));0)
+IFERROR(SUM(FILTER(
NL_Dau!G$3:G$2810;
NL_Dau!B$3:B$2810=t;
(NL_Dau!D$3:D$2810="Đổ ngoài");
(NL_Dau!H$3:H$2810="Quỹ")
));0)
)))`;
  var TARGET_FUND_COST_FORMULA = `=MAP(G5:G20;LAMBDA(t;IF(t="";"";IFERROR(SUM(FILTER(
IMP_ThuChi!D$2:D$5001;
IMP_ThuChi!G$2:G$5001=t;
LOWER(TRIM(IMP_ThuChi!J$2:J$5001))<>"có";
IMP_ThuChi!K$2:K$5001<>TRUE;
NOT((LOWER(TRIM(IMP_ThuChi!C$2:C$5001))="vi phạm gt")*(LOWER(TRIM(IMP_ThuChi!E$2:E$5001))<>"công ty"));
NOT(REGEXMATCH(LOWER(IMP_ThuChi!C$2:C$5001);"xăng dầu|xang dau|dầu|dau"));
NOT(REGEXMATCH(LOWER(IMP_ThuChi!C$2:C$5001&" "&IMP_ThuChi!I$2:I$5001);"góp quỹ|gop quy|thuế doanh nghiệp|thue doanh nghiep|thuế tndn|thue tndn|thuế vat|thue vat|vat|phí đi đường|phi di duong|phí phường|phi phuong|trả lương|tra luong|ứng lương|ung luong|thanh toán công nợ|thanh toan cong no|phân phối lợi nhuận|phan phoi loi nhuan"))
));0)
+IFERROR(SUM(FILTER(
IMP_ThuChi!D$2:D$5001;
IMP_ThuChi!G$2:G$5001=t;
LOWER(TRIM(IMP_ThuChi!J$2:J$5001))<>"có";
IMP_ThuChi!K$2:K$5001=TRUE;
((LOWER(TRIM(IMP_ThuChi!C$2:C$5001))="sửa chữa")+(LOWER(TRIM(IMP_ThuChi!C$2:C$5001))="trang thiết bị"))>0
));0)
+IFERROR(SUM(FILTER(
NL_Dau!G$3:G$2810;
NL_Dau!B$3:B$2810=t;
(NL_Dau!D$3:D$2810="Đổ ngoài");
(NL_Dau!H$3:H$2810="Quỹ")
));0)
)))`;

  var LEGACY_RECEIPT_QA_FORMULA = `=LET(
last;MAX(FILTER(ROW(SYS_ThuChiRaw!O$1:O$10000);SYS_ThuChiRaw!O$1:O$10000<>""));
sp;SYS_ThuChiRaw!N$1:INDEX(SYS_ThuChiRaw!N$1:N$10000;last);
ngay;SYS_ThuChiRaw!O$1:INDEX(SYS_ThuChiRaw!O$1:O$10000;last);
muc;SYS_ThuChiRaw!Q$1:INDEX(SYS_ThuChiRaw!Q$1:Q$10000;last);
tien;SYS_ThuChiRaw!S$1:INDEX(SYS_ThuChiRaw!S$1:S$10000;last);
ncc;SYS_ThuChiRaw!U$1:INDEX(SYS_ThuChiRaw!U$1:U$10000;last);
nd;SYS_ThuChiRaw!V$1:INDEX(SYS_ThuChiRaw!V$1:V$10000;last);
kq;SYS_ThuChiRaw!Y$1:INDEX(SYS_ThuChiRaw!Y$1:Y$10000;last);
thang;MAP(ngay;muc;ncc;nd;LAMBDA(d;mc;dt;noi;IF(d="";"";LET(txt;UPPER(mc&" "&dt&" "&noi);m;IFERROR(VALUE(REGEXEXTRACT(txt;"(?:^|[^A-Z0-9])T(0?[1-9]|1[0-2])(?:$|[^0-9])"));"");IF(m="";DATE(YEAR(d);MONTH(d);1);DATE(YEAR(d)-IF(m>MONTH(d);1;0);m;1))))));
impMuc;MAP(sp;LAMBDA(s;IF(s="";"";XLOOKUP(s;IMP_ThuChi!A$2:A$5001;IMP_ThuChi!C$2:C$5001;"__MISS__"))));
impTien;MAP(sp;LAMBDA(s;IF(s="";"";XLOOKUP(s;IMP_ThuChi!A$2:A$5001;IMP_ThuChi!D$2:D$5001;"__MISS__"))));
impThang;MAP(sp;LAMBDA(s;IF(s="";"";XLOOKUP(s;IMP_ThuChi!A$2:A$5001;IMP_ThuChi!G$2:G$5001;"__MISS__"))));
impKq;MAP(sp;LAMBDA(s;IF(s="";"";XLOOKUP(s;IMP_ThuChi!A$2:A$5001;IMP_ThuChi!K$2:K$5001;"__MISS__"))));
lydo;MAP(sp;muc;tien;thang;kq;impMuc;impTien;impThang;impKq;LAMBDA(s;mc;v;t;k;im;iv;it;ik;
IF(OR(mc="";s="");"";TEXTJOIN("; ";TRUE;
IF(COUNTIF(sp;s)>1;"Trùng số phiếu nguồn";"");
IF(iv="__MISS__";"Thiếu trong IMP_ThuChi";"");
IF(AND(iv<>"__MISS__";ABS(v-iv)>0,01);"Lệch số tiền";"");
IF(AND(im<>"__MISS__";mc<>im);"Lệch hạng mục";"");
IF(AND(it<>"__MISS__";t<>it);"Lệch tháng tính";"");
IF(AND(ik<>"__MISS__";N(k=TRUE)<>N(ik=TRUE));"Lệch Không qua quỹ";"")
))));
IFERROR(FILTER(HSTACK(sp;ngay;muc;tien;thang;impTien;impThang;lydo);(muc<>"")*(lydo<>""));"")
)`;
  var TARGET_RECEIPT_QA_FORMULA = `=LET(
last;MAX(FILTER(ROW(SYS_ThuChiRaw!O$1:O$10000);SYS_ThuChiRaw!O$1:O$10000<>""));
sp;SYS_ThuChiRaw!N$1:INDEX(SYS_ThuChiRaw!N$1:N$10000;last);
ngay;SYS_ThuChiRaw!O$1:INDEX(SYS_ThuChiRaw!O$1:O$10000;last);
muc;SYS_ThuChiRaw!Q$1:INDEX(SYS_ThuChiRaw!Q$1:Q$10000;last);
tien;SYS_ThuChiRaw!S$1:INDEX(SYS_ThuChiRaw!S$1:S$10000;last);
ncc;SYS_ThuChiRaw!U$1:INDEX(SYS_ThuChiRaw!U$1:U$10000;last);
nd;SYS_ThuChiRaw!V$1:INDEX(SYS_ThuChiRaw!V$1:V$10000;last);
kq;SYS_ThuChiRaw!Y$1:INDEX(SYS_ThuChiRaw!Y$1:Y$10000;last);
thang;MAP(ngay;muc;ncc;nd;LAMBDA(d;mc;dt;noi;IF(d="";"";LET(txt;UPPER(mc&" "&dt&" "&noi);m;IFERROR(VALUE(REGEXEXTRACT(txt;"(?:^|[^A-Z0-9])T(0?[1-9]|1[0-2])(?:$|[^0-9])"));"");IF(m="";DATE(YEAR(d);MONTH(d);1);DATE(YEAR(d)-IF(m>MONTH(d);1;0);m;1))))));
srcCount;MAP(sp;ngay;muc;tien;nd;LAMBDA(s;d;mc;v;noi;IF(OR(mc="";s="");0;COUNTIFS(sp;s;ngay;d;muc;mc;tien;v;nd;noi))));
impCount;MAP(sp;ngay;muc;tien;nd;LAMBDA(s;d;mc;v;noi;IF(OR(mc="";s="");0;COUNTIFS(IMP_ThuChi!A$2:A$5001;s;IMP_ThuChi!B$2:B$5001;d;IMP_ThuChi!C$2:C$5001;mc;IMP_ThuChi!D$2:D$5001;v;IMP_ThuChi!F$2:F$5001;noi))));
impMuc;MAP(sp;ngay;muc;tien;nd;LAMBDA(s;d;mc;v;noi;IF(s="";"";XLOOKUP(1;(IMP_ThuChi!A$2:A$5001=s)*(IMP_ThuChi!B$2:B$5001=d)*(IMP_ThuChi!C$2:C$5001=mc)*(IMP_ThuChi!D$2:D$5001=v)*(IMP_ThuChi!F$2:F$5001=noi);IMP_ThuChi!C$2:C$5001;"__MISS__"))));
impTien;MAP(sp;ngay;muc;tien;nd;LAMBDA(s;d;mc;v;noi;IF(s="";"";XLOOKUP(1;(IMP_ThuChi!A$2:A$5001=s)*(IMP_ThuChi!B$2:B$5001=d)*(IMP_ThuChi!C$2:C$5001=mc)*(IMP_ThuChi!D$2:D$5001=v)*(IMP_ThuChi!F$2:F$5001=noi);IMP_ThuChi!D$2:D$5001;"__MISS__"))));
impThang;MAP(sp;ngay;muc;tien;nd;LAMBDA(s;d;mc;v;noi;IF(s="";"";XLOOKUP(1;(IMP_ThuChi!A$2:A$5001=s)*(IMP_ThuChi!B$2:B$5001=d)*(IMP_ThuChi!C$2:C$5001=mc)*(IMP_ThuChi!D$2:D$5001=v)*(IMP_ThuChi!F$2:F$5001=noi);IMP_ThuChi!G$2:G$5001;"__MISS__"))));
impKq;MAP(sp;ngay;muc;tien;nd;LAMBDA(s;d;mc;v;noi;IF(s="";"";XLOOKUP(1;(IMP_ThuChi!A$2:A$5001=s)*(IMP_ThuChi!B$2:B$5001=d)*(IMP_ThuChi!C$2:C$5001=mc)*(IMP_ThuChi!D$2:D$5001=v)*(IMP_ThuChi!F$2:F$5001=noi);IMP_ThuChi!K$2:K$5001;"__MISS__"))));
lydo;MAP(sp;muc;tien;thang;kq;srcCount;impCount;impMuc;impTien;impThang;impKq;LAMBDA(s;mc;v;t;k;sc;ic;im;iv;it;ik;
IF(OR(mc="";s="");"";TEXTJOIN("; ";TRUE;
IF(sc>1;"Trùng giao dịch nguồn";"");
IF(ic=0;"Thiếu trong IMP_ThuChi";"");
IF(ic>1;"Trùng giao dịch trong IMP_ThuChi";"");
IF(AND(iv<>"__MISS__";ABS(v-iv)>0,01);"Lệch số tiền";"");
IF(AND(im<>"__MISS__";mc<>im);"Lệch hạng mục";"");
IF(AND(it<>"__MISS__";t<>it);"Lệch tháng tính";"");
IF(AND(ik<>"__MISS__";N(k=TRUE)<>N(ik=TRUE));"Lệch Không qua quỹ";"")
))));
IFERROR(FILTER(HSTACK(sp;ngay;muc;tien;thang;impTien;impThang;lydo);(muc<>"")*(lydo<>""));"")
)`;

  function getDryRun() {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheets = getSheets_(spreadsheet);
    var state = readState_(sheets);
    var checks = {
      exactSpreadsheet: spreadsheet.getId() === SPREADSHEET_ID,
      exactImportSheetId: sheets.importSheet.getSheetId() === IMPORT_SHEET_ID,
      exactReportSheetId: sheets.reportSheet.getSheetId() === REPORT_SHEET_ID,
      exactQaSheetId: sheets.qaSheet.getSheetId() === QA_SHEET_ID,
      importHeadersExact: JSON.stringify(sheets.importSheet.getRange('A1:K1').getDisplayValues()[0]) === JSON.stringify([
        'Số phiếu', 'Ngày', 'Mục', 'Số tiền', 'Đối tác', 'Nội dung', 'Tháng tính', 'Đối tượng', 'Loại tính', 'Công nợ', 'Cấn trừ'
      ]),
      reportHeadersExact: JSON.stringify(sheets.reportSheet.getRange('G4:T4').getDisplayValues()[0]) === JSON.stringify([
        'Tháng', 'Khối Lượng', 'Doanh Thu', 'Thuế TNDN', 'Thuế VAT', 'Dầu Quang Minh', 'Phí Đi Đường', 'Phí Phường', 'Lợi Nhuận Gộp', 'Dầu ngoài', 'Chi phí lương', 'BHXH', 'Chi Quỹ', 'Lợi Nhuận Thực'
      ]),
      qaReceiptCheckPresent: String(sheets.qaSheet.getRange('A44').getDisplayValue() || '') === 'THUCHI_RECEIPT_RECON',
      knownState: state.legacy || state.target
    };
    return {
      ok: Object.keys(checks).every(function (key) { return checks[key]; }),
      spreadsheetId: SPREADSHEET_ID,
      state: state,
      metrics: readMetrics_(sheets),
      checks: checks
    };
  }

  function prepare() {
    var dryRun = getDryRun();
    if (!dryRun.ok) throw new Error('Fund-profit classification dry-run failed: ' + JSON.stringify(dryRun.checks));
    var snapshot = {
      spreadsheetId: SPREADSHEET_ID,
      state: dryRun.state,
      metrics: dryRun.metrics,
      fingerprint: hash_({ spreadsheetId: SPREADSHEET_ID, state: dryRun.state, metrics: dryRun.metrics }),
      preparedAt: new Date().toISOString()
    };
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty(SNAPSHOT_PROPERTY, JSON.stringify(snapshot));
    properties.deleteProperty(APPROVAL_PROPERTY);
    properties.deleteProperty(ROLLBACK_APPROVAL_PROPERTY);
    return {
      ok: true,
      prepared: true,
      alreadyMigrated: dryRun.state.target,
      fingerprint: snapshot.fingerprint,
      metrics: snapshot.metrics
    };
  }

  function approve() {
    var snapshot = readSnapshot_();
    assertCurrent_(snapshot);
    PropertiesService.getScriptProperties().setProperty(APPROVAL_PROPERTY, approvalToken_(snapshot, 'run'));
    return { ok: true, approved: true, fingerprint: snapshot.fingerprint };
  }

  function run() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var snapshot = readSnapshot_();
      assertCurrent_(snapshot);
      var properties = PropertiesService.getScriptProperties();
      if (String(properties.getProperty(APPROVAL_PROPERTY) || '') !== approvalToken_(snapshot, 'run')) {
        throw new Error('Fund-profit classification migration requires a matching one-shot approval.');
      }
      properties.deleteProperty(APPROVAL_PROPERTY);
      if (snapshot.state.target) return { ok: true, alreadyMigrated: true, metrics: snapshot.metrics };
      if (!snapshot.state.legacy) throw new Error('Fund-profit classification formulas changed after preparation.');

      var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheets = getSheets_(spreadsheet);
      try {
        sheets.importSheet.getRange('I2').setFormula(TARGET_CLASSIFICATION_FORMULA);
        sheets.reportSheet.getRange('S5').setFormula(TARGET_FUND_COST_FORMULA);
        sheets.qaSheet.getRange('Q3').setFormula(TARGET_RECEIPT_QA_FORMULA);
        SpreadsheetApp.flush();
        var post = waitForPostState_(sheets, snapshot.metrics);
        if (!post.ok) throw new Error('Fund-profit classification post-write verification failed: ' + JSON.stringify(post));
        SheetService.invalidateCaches();
        return {
          ok: true,
          migrated: true,
          fingerprint: snapshot.fingerprint,
          before: snapshot.metrics,
          after: post.metrics,
          excludedFromProfit: post.metrics.excludedCurrentMonth
        };
      } catch (err) {
        restoreState_(sheets, snapshot.state);
        SpreadsheetApp.flush();
        throw err;
      }
    } finally {
      lock.releaseLock();
    }
  }

  function approveRollback() {
    var snapshot = readSnapshot_();
    var dryRun = getDryRun();
    if (!dryRun.ok || !dryRun.state.target) throw new Error('Fund-profit classification target state is not active.');
    PropertiesService.getScriptProperties().setProperty(ROLLBACK_APPROVAL_PROPERTY, approvalToken_(snapshot, 'rollback'));
    return { ok: true, approved: true, fingerprint: snapshot.fingerprint };
  }

  function rollback() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var snapshot = readSnapshot_();
      var properties = PropertiesService.getScriptProperties();
      if (String(properties.getProperty(ROLLBACK_APPROVAL_PROPERTY) || '') !== approvalToken_(snapshot, 'rollback')) {
        throw new Error('Fund-profit classification rollback requires a matching one-shot approval.');
      }
      properties.deleteProperty(ROLLBACK_APPROVAL_PROPERTY);
      var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheets = getSheets_(spreadsheet);
      var current = readState_(sheets);
      if (current.legacy) return { ok: true, alreadyRolledBack: true };
      if (!current.target) throw new Error('Fund-profit classification formulas changed after migration; rollback aborted.');
      restoreState_(sheets, snapshot.state);
      SpreadsheetApp.flush();
      var post = readState_(sheets);
      if (!sameFormulaState_(post, snapshot.state)) throw new Error('Fund-profit classification rollback verification failed.');
      SheetService.invalidateCaches();
      return { ok: true, rolledBack: true, fingerprint: snapshot.fingerprint };
    } finally {
      lock.releaseLock();
    }
  }

  function getSheets_(spreadsheet) {
    var importSheet = spreadsheet.getSheetByName(IMPORT_SHEET_NAME);
    var reportSheet = spreadsheet.getSheetByName(REPORT_SHEET_NAME);
    var qaSheet = spreadsheet.getSheetByName(QA_SHEET_NAME);
    if (!importSheet || !reportSheet || !qaSheet) throw new Error('Missing IMP_ThuChi, BC_TongQuan or SYS_QA.');
    return { importSheet: importSheet, reportSheet: reportSheet, qaSheet: qaSheet };
  }

  function readState_(sheets) {
    var classificationFormula = sheets.importSheet.getRange('I2').getFormula();
    var fundCostFormula = sheets.reportSheet.getRange('S5').getFormula();
    var receiptQaFormula = sheets.qaSheet.getRange('Q3').getFormula();
    return {
      classificationFormula: classificationFormula,
      fundCostFormula: fundCostFormula,
      receiptQaFormula: receiptQaFormula,
      legacy: classificationFormula === LEGACY_CLASSIFICATION_FORMULA &&
        fundCostFormula === LEGACY_FUND_COST_FORMULA && receiptQaFormula === LEGACY_RECEIPT_QA_FORMULA,
      target: classificationFormula === TARGET_CLASSIFICATION_FORMULA &&
        fundCostFormula === TARGET_FUND_COST_FORMULA && receiptQaFormula === TARGET_RECEIPT_QA_FORMULA
    };
  }

  function readMetrics_(sheets) {
    var reportMonth = sheets.reportSheet.getRange('B1').getValue();
    var lastImportRow = Math.max(2, sheets.importSheet.getLastRow());
    var rows = sheets.importSheet.getRange(2, 1, lastImportRow - 1, 9).getValues();
    var excluded = 0;
    var classifiedExcluded = 0;
    rows.forEach(function (row) {
      if (!sameMonth_(row[6], reportMonth)) return;
      var amount = Number(row[3] || 0);
      if (isExcludedProfitTransaction_(row[2], row[4], row[5])) excluded += amount;
      if (row[8] === 'Thanh toán công nợ' || row[8] === 'Phân phối lợi nhuận') classifiedExcluded += amount;
    });
    var qaErrors = sheets.qaSheet.getRange('X3:X341').getDisplayValues().filter(function (row) {
      return String(row[0] || '').trim() !== '';
    }).length;
    return {
      reportMonth: reportMonth instanceof Date ? reportMonth.toISOString() : String(reportMonth || ''),
      fundCost: Number(sheets.reportSheet.getRange('B17').getValue() || 0),
      realProfit: Number(sheets.reportSheet.getRange('B18').getValue() || 0),
      excludedCurrentMonth: excluded,
      classifiedExcludedCurrentMonth: classifiedExcluded,
      qaReceiptErrors: qaErrors
    };
  }

  function waitForPostState_(sheets, beforeMetrics) {
    var last = null;
    for (var attempt = 0; attempt < 10; attempt++) {
      SpreadsheetApp.flush();
      last = { state: readState_(sheets), metrics: readMetrics_(sheets) };
      var expectedFundCost = beforeMetrics.fundCost - last.metrics.excludedCurrentMonth;
      var expectedRealProfit = beforeMetrics.realProfit + last.metrics.excludedCurrentMonth;
      var formulasOk = last.state.target;
      var classificationOk = closeEnough_(last.metrics.classifiedExcludedCurrentMonth, last.metrics.excludedCurrentMonth);
      var fundOk = closeEnough_(last.metrics.fundCost, expectedFundCost);
      var profitOk = closeEnough_(last.metrics.realProfit, expectedRealProfit);
      var qaOk = last.metrics.qaReceiptErrors <= beforeMetrics.qaReceiptErrors;
      if (formulasOk && classificationOk && fundOk && profitOk && qaOk) {
        return { ok: true, metrics: last.metrics };
      }
      Utilities.sleep(500);
    }
    return { ok: false, state: last && last.state, metrics: last && last.metrics };
  }

  function restoreState_(sheets, state) {
    sheets.importSheet.getRange('I2').setFormula(state.classificationFormula);
    sheets.reportSheet.getRange('S5').setFormula(state.fundCostFormula);
    sheets.qaSheet.getRange('Q3').setFormula(state.receiptQaFormula);
  }

  function sameFormulaState_(left, right) {
    return left.classificationFormula === right.classificationFormula &&
      left.fundCostFormula === right.fundCostFormula &&
      left.receiptQaFormula === right.receiptQaFormula;
  }

  function isExcludedProfitTransaction_(category, partner, content) {
    var text = normalizeProfitText_([category, partner, content].join(' '));
    return /\b(tat toan|thanh toan|tra) cong no\b/.test(text) ||
      /\b(chia|chi tra|tra|phan phoi) loi nhuan\b/.test(text);
  }

  function normalizeProfitText_(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  }

  function sameMonth_(left, right) {
    return left instanceof Date && right instanceof Date &&
      left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
  }

  function closeEnough_(left, right) {
    return Math.abs(Number(left || 0) - Number(right || 0)) <= 1;
  }

  function readSnapshot_() {
    var raw = PropertiesService.getScriptProperties().getProperty(SNAPSHOT_PROPERTY);
    if (!raw) throw new Error('Fund-profit classification migration has not been prepared.');
    return JSON.parse(raw);
  }

  function assertCurrent_(snapshot) {
    var dryRun = getDryRun();
    var fingerprint = hash_({ spreadsheetId: SPREADSHEET_ID, state: dryRun.state, metrics: dryRun.metrics });
    if (!dryRun.ok || fingerprint !== snapshot.fingerprint) {
      throw new Error('Fund-profit classification sources changed after preparation; prepare again.');
    }
  }

  function approvalToken_(snapshot, action) {
    return hash_({ action: action, fingerprint: snapshot.fingerprint });
  }

  function hash_(value) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value));
    return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  return {
    getDryRun: getDryRun,
    prepare: prepare,
    approve: approve,
    run: run,
    approveRollback: approveRollback,
    rollback: rollback
  };
})();

function getFundProfitClassificationMigrationDryRun() {
  var result = FundProfitClassificationMigration.getDryRun();
  console.log(JSON.stringify(result));
  return result;
}

function prepareFundProfitClassificationMigration() {
  var result = FundProfitClassificationMigration.prepare();
  console.log(JSON.stringify(result));
  return result;
}

function approveFundProfitClassificationMigration() {
  var result = FundProfitClassificationMigration.approve();
  console.log(JSON.stringify(result));
  return result;
}

function runFundProfitClassificationMigration() {
  var result = FundProfitClassificationMigration.run();
  console.log(JSON.stringify(result));
  return result;
}

function approveFundProfitClassificationMigrationRollback() {
  var result = FundProfitClassificationMigration.approveRollback();
  console.log(JSON.stringify(result));
  return result;
}

function rollbackFundProfitClassificationMigration() {
  var result = FundProfitClassificationMigration.rollback();
  console.log(JSON.stringify(result));
  return result;
}
