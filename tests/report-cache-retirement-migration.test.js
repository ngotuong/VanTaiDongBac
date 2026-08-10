const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ReportCacheRetirementMigration.gs'), 'utf8');

function block(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('retirement dry-run is read-only and gates exact sheet identity plus current Supabase bundles', () => {
  const dryRun = block('function getDryRun()', 'function refreshSupabase()');
  assert.match(dryRun, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(dryRun, /sheet\.getSheetId\(\)/);
  assert.match(dryRun, /exactHeader/);
  assert.match(dryRun, /exactWidth/);
  assert.match(dryRun, /noFormulas/);
  assert.match(dryRun, /supabaseReady/);
  assert.doesNotMatch(dryRun, /deleteSheet|copyTo|setProperty|setValues|clear\(/);

  const gate = block('function getSupabaseGate_()', 'function fingerprintSheet_');
  assert.match(gate, /source_data_version: 'eq\.' \+ dataVersion/);
  assert.match(gate, /details_hash/);
  assert.match(gate, /months\.indexOf\('Tất cả'\) !== -1/);
});

test('retirement backup copies only SYS_ReportCache to a separate spreadsheet and verifies its fingerprint', () => {
  const backup = block('function createBackup()', 'function prepare()');
  assert.match(backup, /SpreadsheetApp\.create\(/);
  assert.match(backup, /sourceSheet\.copyTo\(backup\)/);
  assert.match(backup, /copiedSheet\.setName\(SHEET_NAME\)/);
  assert.match(backup, /backup\.deleteSheet\(defaultSheet\)/);
  assert.match(backup, /backupFingerprint !== dryRun\.fingerprint/);
  assert.match(backup, /properties\.setProperty\(BACKUP_ID_PROPERTY/);
  assert.doesNotMatch(backup, /sourceSpreadsheet\.deleteSheet/);
});

test('retirement deletion requires unchanged snapshot, matching one-shot approval and guarded execution', () => {
  const run = block('function run()', 'function approveRestore()');
  assert.match(run, /runReportCacheGuardedBatch_/);
  assert.match(run, /assertSnapshot_\(snapshot, dryRun\)/);
  assert.match(run, /matching one-shot approval/);
  assert.match(run, /properties\.deleteProperty\(APPROVAL_PROPERTY\)/);
  assert.match(run, /sheet\.getSheetId\(\) !== snapshot\.sheetId/);
  assert.match(run, /spreadsheet\.deleteSheet\(sheet\)/);
  assert.match(run, /spreadsheet\.getSheetByName\(SHEET_NAME\)/);
});

test('retirement exposes explicit refresh, backup, prepare, approve, delete and restore wrappers', () => {
  assert.match(source, /function getReportCacheRetirementDryRunForMigration\(\)/);
  assert.match(source, /function refreshReportCacheForRetirementMigration\(\)/);
  assert.match(source, /function createReportCacheRetirementBackupForMigration\(\)/);
  assert.match(source, /function prepareReportCacheRetirementForMigration\(\)/);
  assert.match(source, /function approveReportCacheRetirementForMigration\(\)/);
  assert.match(source, /function runReportCacheRetirementForMigration\(\)/);
  assert.match(source, /function approveReportCacheRestoreForMigration\(\)/);
  assert.match(source, /function restoreReportCacheFromBackupForMigration\(\)/);
});

test('runtime cannot recreate or write SYS_ReportCache after retirement', () => {
  const service = fs.readFileSync(path.join(root, 'SheetService.gs'), 'utf8');
  const repository = fs.readFileSync(path.join(root, 'SheetReportCacheRepository.gs'), 'utf8');
  assert.doesNotMatch(service, /SYS_ReportCache|SheetReportCacheRepository\./);
  assert.match(repository, /SYS_ReportCache is retired and cannot be written or recreated/);
  assert.doesNotMatch(repository, /insertSheet\(|setValues\(/);
});
