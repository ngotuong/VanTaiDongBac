const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ReportCacheCompactionMigration.gs'), 'utf8');

function block(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('E1.5 dry-run is read-only, bounded to A:J, and validates one complete 39-row rollback batch', () => {
  const dryRun = block('function getDryRun()', 'function setBackupFileId');
  assert.match(dryRun, /SpreadsheetApp\.openById\(APP_CONFIG\.spreadsheetId\)/);
  assert.match(source, /var SHEET_NAME = 'SYS_ReportCache'/);
  assert.match(source, /var WIDTH = 10/);
  assert.match(source, /var RETAINED_ROWS = 39/);
  assert.match(dryRun, /sheet\.getLastColumn\(\)/);
  assert.match(dryRun, /getFormulas\(\)/);
  assert.match(dryRun, /monthKeys\.length === 3/);
  assert.match(dryRun, /for \(var order = 1; order <= 13; order\+\+\)/);
  assert.match(dryRun, /SheetService\.getReportCacheVersion\(\)/);
  assert.doesNotMatch(dryRun, /setValues|copyTo|deleteRows|deleteSheet|clear\(|setProperty/);
});

test('E1.5 preserves the exact cache header and never renames, reorders, or deletes the sheet', () => {
  assert.match(source, /'cacheVersion', 'dataVersion', 'monthKey', 'monthLabel', 'rowOrder'/);
  assert.match(source, /'colA', 'colB', 'colC', 'colD', 'colE'/);
  assert.doesNotMatch(source, /setName\(|moveActiveSheet|deleteSheet\(|insertSheet\(/);
});

test('E1.5 preparation requires a separate backup and invalidates any previous destructive approval', () => {
  const prepare = block('function prepare()', 'function approveDestructivePass');
  assert.match(source, /REPORT_CACHE_E15_BACKUP_FILE_ID/);
  assert.match(source, /REPORT_CACHE_E15_PREPARED_SNAPSHOT/);
  assert.match(prepare, /separate full-workbook backup/);
  assert.match(prepare, /properties\.setProperty\(PREPARED_SNAPSHOT_PROPERTY/);
  assert.match(prepare, /properties\.deleteProperty\(DESTRUCTIVE_APPROVAL_PROPERTY\)/);
  assert.doesNotMatch(prepare, /copyTo|deleteRows|deleteSheet|clear\(/);
});

test('E1.5 destructive pass requires Supabase mode, unchanged fingerprint, and one-shot approval', () => {
  const run = block('function run()', 'function readPreparedSnapshot_');
  assert.match(source, /modeSupabase: ReportCacheMode\.get\(\) === ReportCacheMode\.SUPABASE/);
  assert.match(run, /one-shot approval/);
  assert.match(run, /assertSnapshotMatches_\(snapshot, dryRun\)/);
  assert.match(run, /approval !== dryRun\.fingerprint/);
  assert.match(run, /runReportCacheGuardedBatch_/);
  assert.match(run, /LockService\.getScriptLock\(\)/);
  assert.match(run, /source\.copyTo\(target\)/);
  assert.match(run, /sheet\.deleteRows\(FINAL_ROW_COUNT \+ 1/);
  assert.match(run, /post\.lastRow !== FINAL_ROW_COUNT/);
  assert.match(run, /properties\.deleteProperty\(DESTRUCTIVE_APPROVAL_PROPERTY\)/);
});

test('E1.5 exposes separate dry-run, backup, preparation, approval, and destructive wrappers', () => {
  assert.match(source, /function getReportCacheCompactionDryRunForMigration\(\)/);
  assert.match(source, /function setReportCacheCompactionBackupForMigration\(backupFileId\)/);
  assert.match(source, /function prepareReportCacheCompactionForMigration\(\)/);
  assert.match(source, /function approveReportCacheCompactionForMigration\(\)/);
  assert.match(source, /function runReportCacheCompactionForMigration\(\)/);
});
