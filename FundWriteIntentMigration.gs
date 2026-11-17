/** Controlled migration from visible voucher-cell notes to Fund intent V2.
 * Dry-run and prepare are read-only. run() creates one hidden system sheet,
 * attaches row Developer Metadata and clears only legacy notes whose business
 * rows still exactly match their stored intent. Drifted notes are left intact.
 */
var FundWriteIntentMigration = (function () {
  var SPREADSHEET_ID = '1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw';
  var TRANSACTION_SHEET_NAME = 'NHAP_THUCHI';
  var TRANSACTION_SHEET_ID = 2018768776;
  var SNAPSHOT_PROPERTY = 'FUND_WRITE_INTENT_MIGRATION_SNAPSHOT_2026';
  var APPROVAL_PROPERTY = 'FUND_WRITE_INTENT_MIGRATION_APPROVAL_2026';

  function getDryRun() {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet ' + TRANSACTION_SHEET_NAME + '.');
    var journalName = FundWriteIntentRepository.journalSheetName();
    var journalSheet = spreadsheet.getSheetByName(journalName);
    var items = FundWriteIntentRepository.auditLegacy(sheet);
    var publicItems = items.map(function (item) {
      return { row: item.row, id: item.id, state: item.state, status: item.status, reason: item.reason,
        expectedVoucher: item.expectedVoucher || '', actualVoucher: item.actualVoucher || '', fingerprint: item.fingerprint || '' };
    });
    var journalState = journalSheet ? readJournalState_(journalSheet) : { exists: false, headerExact: true, hidden: true, rows: 0 };
    var checks = {
      exactSpreadsheet: spreadsheet.getId() === SPREADSHEET_ID,
      exactTransactionSheet: sheet.getSheetId() === TRANSACTION_SHEET_ID,
      journalHeaderSafe: journalState.headerExact,
      journalHidden: journalState.hidden
    };
    var fingerprint = hash_({ spreadsheetId: SPREADSHEET_ID, transactionSheetId: sheet.getSheetId(), journalState: journalState, items: publicItems });
    return {
      ok: Object.keys(checks).every(function (key) { return checks[key]; }),
      spreadsheetId: SPREADSHEET_ID,
      transactionSheet: TRANSACTION_SHEET_NAME,
      journalSheet: journalName,
      journalState: journalState,
      legacyCount: items.length,
      migratableCount: items.filter(function (item) { return item.status === 'migratable'; }).length,
      blockerCount: items.filter(function (item) { return item.status !== 'migratable'; }).length,
      blockers: publicItems.filter(function (item) { return item.status !== 'migratable'; }),
      fingerprint: fingerprint,
      checks: checks
    };
  }

  function prepare() {
    var dryRun = getDryRun();
    if (!dryRun.ok) throw new Error('Fund write-intent migration dry-run failed: ' + JSON.stringify(dryRun.checks));
    var snapshot = {
      spreadsheetId: SPREADSHEET_ID,
      fingerprint: dryRun.fingerprint,
      legacyCount: dryRun.legacyCount,
      migratableCount: dryRun.migratableCount,
      blockerCount: dryRun.blockerCount,
      blockers: dryRun.blockers,
      preparedAt: new Date().toISOString()
    };
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty(SNAPSHOT_PROPERTY, JSON.stringify(snapshot));
    properties.deleteProperty(APPROVAL_PROPERTY);
    return { ok: true, prepared: true, fingerprint: snapshot.fingerprint, migratableCount: snapshot.migratableCount,
      blockerCount: snapshot.blockerCount, blockers: snapshot.blockers };
  }

  function approve() {
    var snapshot = readSnapshot_();
    assertCurrent_(snapshot);
    PropertiesService.getScriptProperties().setProperty(APPROVAL_PROPERTY, approvalToken_(snapshot));
    return { ok: true, approved: true, fingerprint: snapshot.fingerprint, blockerCount: snapshot.blockerCount };
  }

  function run() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var snapshot = readSnapshot_();
      assertCurrent_(snapshot);
      var properties = PropertiesService.getScriptProperties();
      if (String(properties.getProperty(APPROVAL_PROPERTY) || '') !== approvalToken_(snapshot)) {
        throw new Error('Fund write-intent migration requires a matching one-shot approval.');
      }
      properties.deleteProperty(APPROVAL_PROPERTY);
      var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      var transactionSheet = spreadsheet.getSheetByName(TRANSACTION_SHEET_NAME);
      var journalSheet = ensureJournalSheet_(spreadsheet);
      var audit = FundWriteIntentRepository.auditLegacy(transactionSheet);
      var migrated = [];
      audit.forEach(function (item) {
        if (item.status === 'migratable') migrated.push(FundWriteIntentRepository.migrateLegacyRecord(transactionSheet, item));
      });
      SpreadsheetApp.flush();
      var remaining = FundWriteIntentRepository.auditLegacy(transactionSheet);
      var postBlockers = remaining.filter(function (item) { return item.status !== 'migratable'; }).map(function (item) {
        return { row: item.row, id: item.id, state: item.state, reason: item.reason,
          expectedVoucher: item.expectedVoucher || '', actualVoucher: item.actualVoucher || '' };
      });
      if (remaining.some(function (item) { return item.status === 'migratable'; })) {
        throw new Error('Vẫn còn legacy intent đủ điều kiện migration sau khi chạy.');
      }
      if (!journalSheet.isSheetHidden()) journalSheet.hideSheet();
      return { ok: true, migrated: true, migratedCount: migrated.length, blockedCount: postBlockers.length,
        blockers: postBlockers, journalSheet: journalSheet.getName(), journalRows: Math.max(0, journalSheet.getLastRow() - 1) };
    } finally {
      lock.releaseLock();
    }
  }

  function ensureJournalSheet_(spreadsheet) {
    var name = FundWriteIntentRepository.journalSheetName();
    var sheet = spreadsheet.getSheetByName(name);
    var headers = FundWriteIntentRepository.journalHeaders();
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.hideSheet();
      SpreadsheetApp.flush();
      return sheet;
    }
    var state = readJournalState_(sheet);
    if (!state.headerExact) throw new Error('Sheet ' + name + ' đã tồn tại nhưng sai header.');
    if (!sheet.isSheetHidden()) sheet.hideSheet();
    return sheet;
  }

  function readJournalState_(sheet) {
    var headers = FundWriteIntentRepository.journalHeaders();
    var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].map(function (value) { return String(value || '').trim(); });
    return { exists: true, sheetId: sheet.getSheetId(), headerExact: JSON.stringify(actual) === JSON.stringify(headers),
      hidden: sheet.isSheetHidden(), rows: Math.max(0, sheet.getLastRow() - 1) };
  }

  function readSnapshot_() {
    var raw = PropertiesService.getScriptProperties().getProperty(SNAPSHOT_PROPERTY);
    if (!raw) throw new Error('Fund write-intent migration has not been prepared.');
    return JSON.parse(raw);
  }

  function assertCurrent_(snapshot) {
    var dryRun = getDryRun();
    if (!dryRun.ok || dryRun.fingerprint !== snapshot.fingerprint) {
      throw new Error('Fund write-intent state changed after migration preparation; prepare again.');
    }
  }

  function approvalToken_(snapshot) {
    return hash_({ action: 'migrate-fund-write-intents-v2', fingerprint: snapshot.fingerprint });
  }

  function hash_(value) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value));
    return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  return { getDryRun: getDryRun, prepare: prepare, approve: approve, run: run };
})();

function getFundWriteIntentMigrationDryRun() {
  var result = FundWriteIntentMigration.getDryRun();
  console.log(JSON.stringify(result));
  return result;
}

function prepareFundWriteIntentMigration() {
  var result = FundWriteIntentMigration.prepare();
  console.log(JSON.stringify(result));
  return result;
}

function approveFundWriteIntentMigration() {
  var result = FundWriteIntentMigration.approve();
  console.log(JSON.stringify(result));
  return result;
}

function runFundWriteIntentMigration() {
  var result = FundWriteIntentMigration.run();
  console.log(JSON.stringify(result));
  return result;
}
