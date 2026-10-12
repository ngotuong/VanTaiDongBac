const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'VehicleCostEquipmentMigration.gs'), 'utf8');

function block(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('vehicle-cost migration is scoped to the canonical workbook and exact report/import sheets', () => {
  const dryRun = block('function getDryRun()', 'function run()');
  assert.match(dryRun, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(source, /var IMPORT_SHEET_ID = 1924990050/);
  assert.match(source, /var REPORT_SHEET_ID = 20260623/);
  assert.match(dryRun, /importHeadersExact/);
  assert.match(dryRun, /reportWidthExact/);
  assert.doesNotMatch(source, /insertSheet|deleteSheet|moveActiveSheet|setName\(/);
});

test('target cost formula includes repair-classified and equipment rows but still requires month and plate', () => {
  assert.match(source, /IMP_ThuChi!I\$2:I\$999=\"Chi phí xe\"/);
  assert.match(source, /IMP_ThuChi!C\$2:C\$999=\"Trang thiết bị\"/);
  assert.match(source, /IMP_ThuChi!G\$2:G\$999=t/);
  assert.match(source, /REGEXMATCH\(IMP_ThuChi!E\$2:E\$999&\" \"&IMP_ThuChi!F\$2:F\$999;xe\)/);
  assert.match(source, /var TARGET_HEADER = 'Chi phí xe'/);
});

test('target base formula adds expense-only vehicle/month rows with company lookup and zero operating metrics', () => {
  assert.match(source, /costRows;FILTER/);
  assert.match(source, /REGEXEXTRACT\(UPPER\(txt\);\"\[0-9\]\{2\}\[A-Z\]\[0-9\]\{4,5\}\"\)/);
  assert.match(source, /IFNA\(INDEX\(FILTER\(XL_VanChuyen!O\$2:O;[\s\S]*XL_VanChuyen!B\$2:B=t;XL_VanChuyen!C\$2:C=xe\);1\)/);
  assert.match(source, /XLOOKUP\(xe;DM_Xe!B\$2:B;DM_Xe!H\$2:H;\"\"\)/);
  assert.match(source, /zeroes;MAP\(plates;LAMBDA\(xe;0\)\)/);
  assert.match(source, /months.*companies.*plates.*zeroes.*zeroes.*zeroes/);
});

test('migration is idempotent, lock guarded, verifies post-state, and restores legacy formulas on failure', () => {
  const run = block('function run()', 'function rollback()');
  assert.match(run, /LockService\.getScriptLock\(\)/);
  assert.match(run, /alreadyMigrated/);
  assert.match(run, /if \(!post\.target\)/);
  assert.match(run, /catch \(err\)/);
  assert.match(run, /setFormula\(LEGACY_BASE_FORMULA\)/);
  assert.match(run, /setFormula\(LEGACY_COST_FORMULA\)/);
});

test('migration exposes explicit dry-run, run, and rollback editor functions', () => {
  assert.match(source, /function getVehicleCostEquipmentMigrationDryRun\(\)/);
  assert.match(source, /function runVehicleCostEquipmentMigration\(\)/);
  assert.match(source, /function rollbackVehicleCostEquipmentMigration\(\)/);
});
