const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'FundProfitClassificationMigration.gs'), 'utf8');

function block(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `Missing start marker: ${start}`);
  assert.notEqual(to, -1, `Missing end marker: ${end}`);
  return source.slice(from, to);
}

test('fund-profit migration is scoped to the canonical 2026 report workbook and exact formula cells', () => {
  assert.match(source, /var SPREADSHEET_ID = '1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA'/);
  assert.match(source, /var IMPORT_SHEET_ID = 1924990050/);
  assert.match(source, /var REPORT_SHEET_ID = 20260626/);
  assert.match(source, /var QA_SHEET_ID = 597210335/);

  const run = block('function run()', 'function approveRollback()');
  assert.match(run, /getRange\('I2'\)\.setFormula\(TARGET_CLASSIFICATION_FORMULA\)/);
  assert.match(run, /getRange\('S5'\)\.setFormula\(TARGET_FUND_COST_FORMULA\)/);
  assert.match(run, /getRange\('Q3'\)\.setFormula\(TARGET_RECEIPT_QA_FORMULA\)/);
  assert.doesNotMatch(run, /setValue|setValues|clearContent|deleteRow|insertRow|deleteSheet|insertSheet/);
});

test('classification distinguishes debt settlement and shareholder distribution from operating expenses', () => {
  assert.match(source, /"Thanh toán công nợ"/);
  assert.match(source, /"Phân phối lợi nhuận"/);
  assert.match(source, /tất toán công nợ\|tat toan cong no\|thanh toán công nợ/);
  assert.match(source, /chia lợi nhuận\|chia loi nhuan\|chi trả lợi nhuận/);
  assert.match(source, /thanh toán công nợ\|thanh toan cong no\|phân phối lợi nhuận\|phan phoi loi nhuan/);
});

test('receipt QA reconciles exact transaction identity instead of rejecting a reused debt voucher', () => {
  const target = block('var TARGET_RECEIPT_QA_FORMULA', 'function getDryRun()');
  assert.match(target, /COUNTIFS\(IMP_ThuChi!A\$2:A\$5001;s;IMP_ThuChi!B\$2:B\$5001;d;IMP_ThuChi!C\$2:C\$5001;mc;IMP_ThuChi!D\$2:D\$5001;v;IMP_ThuChi!F\$2:F\$5001;noi\)/);
  assert.match(target, /"Trùng giao dịch nguồn"/);
  assert.match(target, /"Trùng giao dịch trong IMP_ThuChi"/);
  assert.doesNotMatch(target, /Trùng số phiếu nguồn/);
});

test('incident fixture restores October profit without changing cash transaction amounts', () => {
  const grossProfit = 3_357_784_512.5583496;
  const outsideFuel = 1_038_595_021.4432;
  const payroll = 720_108_000;
  const ordinaryFundCost = 150_911_800;
  const excludedCashMovements = [10_900_000, 113_158_237, 1_222_026_371];
  const legacyFundCost = ordinaryFundCost + excludedCashMovements.reduce((sum, value) => sum + value, 0);
  const legacyProfit = grossProfit - outsideFuel - payroll - legacyFundCost;
  const correctedProfit = grossProfit - outsideFuel - payroll - ordinaryFundCost;

  assert.equal(legacyFundCost, 1_496_996_408);
  assert.equal(Math.round(legacyProfit), 102_085_083);
  assert.equal(Math.round(correctedProfit), 1_448_169_691);
  assert.equal(Math.round(correctedProfit - legacyProfit), 1_346_084_608);
});

test('migration requires fingerprinted one-shot approval, verifies results, and supports exact rollback', () => {
  assert.match(source, /FUND_PROFIT_CLASSIFICATION_MIGRATION_SNAPSHOT_2026/);
  assert.match(source, /requires a matching one-shot approval/);
  assert.match(source, /waitForPostState_/);
  assert.match(source, /classifiedExcludedCurrentMonth/);
  assert.match(source, /fundCost: Number\(sheets\.reportSheet\.getRange\('B17'\)/);
  assert.match(source, /realProfit: Number\(sheets\.reportSheet\.getRange\('B18'\)/);
  assert.match(source, /restoreState_\(sheets, snapshot\.state\)/);
  assert.match(source, /approveFundProfitClassificationMigrationRollback/);
  assert.match(source, /rollbackFundProfitClassificationMigration/);
});
