/**
 * Controlled migration for NHAP_THUCHI!N (Lọc).
 *
 * The workbook now owns this helper column through the ARRAYFORMULA in N2.
 * Legacy row formulas below N2 block that spill range and must be removed once,
 * after a read-only dry-run, a captured rollback snapshot and one-shot approval.
 */
var FundTransactionFilterMigration = (function () {
  var SPREADSHEET_ID = '1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw';
  var SHEET_NAME = 'NHAP_THUCHI';
  var FILTER_COLUMN = 14;
  var SNAPSHOT_PROPERTY = 'FUND_FILTER_MIGRATION_SNAPSHOT';
  var APPROVAL_PROPERTY = 'FUND_FILTER_MIGRATION_APPROVAL';
  var ROLLBACK_APPROVAL_PROPERTY = 'FUND_FILTER_MIGRATION_ROLLBACK_APPROVAL';

  function getDryRun() {
    var sheet = getSheet_();
    var lastRow = Math.max(2, sheet.getLastRow());
    var header = String(sheet.getRange(1, FILTER_COLUMN).getDisplayValue() || '').trim();
    var rootFormula = String(sheet.getRange(2, FILTER_COLUMN).getFormula() || '');
    var collisions = readCollisions_(sheet, lastRow);
    var checks = {
      exactSpreadsheet: sheet.getParent().getId() === SPREADSHEET_ID,
      exactSheet: sheet.getName() === SHEET_NAME,
      filterHeader: header === 'Lọc' || header === 'LỌC',
      arrayFormulaAtN2: /^\s*=\s*ARRAYFORMULA\s*\(/i.test(rootFormula)
    };
    var fingerprint = hash_({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: sheet.getSheetId(),
      lastRow: lastRow,
      rootFormula: rootFormula,
      collisions: collisions
    });
    return {
      ok: Object.keys(checks).every(function (key) { return checks[key]; }),
      spreadsheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
      sheetId: sheet.getSheetId(),
      lastRow: lastRow,
      collisionCount: collisions.length,
      collisionRows: collisions.map(function (item) { return item.row; }),
      fingerprint: fingerprint,
      checks: checks
    };
  }

  function prepare() {
    var dryRun = getDryRun();
    if (!dryRun.ok) throw new Error('Fund filter migration dry-run failed: ' + JSON.stringify(dryRun.checks));
    var sheet = getSheet_();
    var snapshot = {
      spreadsheetId: SPREADSHEET_ID,
      sheetId: dryRun.sheetId,
      lastRow: dryRun.lastRow,
      fingerprint: dryRun.fingerprint,
      collisions: readCollisions_(sheet, dryRun.lastRow),
      preparedAt: new Date().toISOString()
    };
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty(SNAPSHOT_PROPERTY, JSON.stringify(snapshot));
    properties.deleteProperty(APPROVAL_PROPERTY);
    properties.deleteProperty(ROLLBACK_APPROVAL_PROPERTY);
    return { ok: true, prepared: true, collisionCount: snapshot.collisions.length, fingerprint: snapshot.fingerprint };
  }

  function approve() {
    var snapshot = readSnapshot_();
    assertCurrent_(snapshot);
    var token = approvalToken_(snapshot);
    PropertiesService.getScriptProperties().setProperty(APPROVAL_PROPERTY, token);
    return { ok: true, approved: true, fingerprint: snapshot.fingerprint };
  }

  function run() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var properties = PropertiesService.getScriptProperties();
      var snapshot = readSnapshot_();
      assertCurrent_(snapshot);
      if (String(properties.getProperty(APPROVAL_PROPERTY) || '') !== approvalToken_(snapshot)) {
        throw new Error('Fund filter migration requires a matching one-shot approval.');
      }
      properties.deleteProperty(APPROVAL_PROPERTY);
      var sheet = getSheet_();
      snapshot.collisions.forEach(function (item) { sheet.getRange(item.row, FILTER_COLUMN).clearContent(); });
      SpreadsheetApp.flush();
      var post = getDryRun();
      if (!post.ok || post.collisionCount !== 0 || String(sheet.getRange(2, FILTER_COLUMN).getDisplayValue()).indexOf('#REF!') === 0) throw new Error('NHAP_THUCHI!N spill range is still blocked after migration.');
      return { ok: true, migrated: true, clearedCells: snapshot.collisions.length, fingerprint: snapshot.fingerprint };
    } finally {
      lock.releaseLock();
    }
  }

  function approveRollback() {
    var snapshot = readSnapshot_();
    var token = hash_({ action: 'rollback', fingerprint: snapshot.fingerprint });
    PropertiesService.getScriptProperties().setProperty(ROLLBACK_APPROVAL_PROPERTY, token);
    return { ok: true, approved: true, fingerprint: snapshot.fingerprint };
  }

  function rollback() {
    var snapshot = readSnapshot_();
    var properties = PropertiesService.getScriptProperties();
    var token = hash_({ action: 'rollback', fingerprint: snapshot.fingerprint });
    if (String(properties.getProperty(ROLLBACK_APPROVAL_PROPERTY) || '') !== token) {
      throw new Error('Fund filter migration rollback requires a matching one-shot approval.');
    }
    properties.deleteProperty(ROLLBACK_APPROVAL_PROPERTY);
    var sheet = getSheet_();
    snapshot.collisions.forEach(function (item) {
      var range = sheet.getRange(item.row, FILTER_COLUMN);
      if (item.formula) range.setFormula(item.formula);
      else range.setValue(item.value);
    });
    SpreadsheetApp.flush();
    return { ok: true, rolledBack: true, restoredCells: snapshot.collisions.length };
  }

  function readCollisions_(sheet, lastRow) {
    if (lastRow < 3) return [];
    var range = sheet.getRange(3, FILTER_COLUMN, lastRow - 2, 1);
    var values = range.getValues();
    var formulas = range.getFormulas();
    var collisions = [];
    var spillBlocked = String(sheet.getRange(2, FILTER_COLUMN).getDisplayValue()).indexOf('#REF!') === 0;
    for (var index = 0; index < values.length; index++) {
      if (formulas[index][0] || (spillBlocked && values[index][0] !== '')) {
        collisions.push({ row: index + 3, formula: formulas[index][0] || '', value: formulas[index][0] ? '' : values[index][0] });
      }
    }
    return collisions;
  }

  function getSheet_() {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet ' + SHEET_NAME + '.');
    return sheet;
  }

  function readSnapshot_() {
    var raw = PropertiesService.getScriptProperties().getProperty(SNAPSHOT_PROPERTY);
    if (!raw) throw new Error('Fund filter migration has not been prepared.');
    return JSON.parse(raw);
  }

  function assertCurrent_(snapshot) {
    var dryRun = getDryRun();
    if (!dryRun.ok || dryRun.sheetId !== snapshot.sheetId || dryRun.fingerprint !== snapshot.fingerprint) {
      throw new Error('NHAP_THUCHI changed after migration preparation; prepare again.');
    }
  }

  function approvalToken_(snapshot) {
    return hash_({ action: 'clear-filter-collisions', fingerprint: snapshot.fingerprint });
  }

  function hash_(value) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value));
    return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  return { getDryRun: getDryRun, prepare: prepare, approve: approve, run: run, approveRollback: approveRollback, rollback: rollback };
})();

function getFundTransactionFilterMigrationDryRun() {
  var result = FundTransactionFilterMigration.getDryRun();
  console.log(JSON.stringify(result));
  return result;
}

function prepareFundTransactionFilterMigration() {
  var result = FundTransactionFilterMigration.prepare();
  console.log(JSON.stringify(result));
  return result;
}

function approveFundTransactionFilterMigration() {
  var result = FundTransactionFilterMigration.approve();
  console.log(JSON.stringify(result));
  return result;
}

function runFundTransactionFilterMigration() {
  var result = FundTransactionFilterMigration.run();
  console.log(JSON.stringify(result));
  return result;
}

function approveFundTransactionFilterMigrationRollback() {
  var result = FundTransactionFilterMigration.approveRollback();
  console.log(JSON.stringify(result));
  return result;
}

function rollbackFundTransactionFilterMigration() {
  var result = FundTransactionFilterMigration.rollback();
  console.log(JSON.stringify(result));
  return result;
}
