/** Controlled E1.5 migration for compacting SYS_ReportCache after Supabase cutover. */
var ReportCacheCompactionMigration = (function () {
  var SHEET_NAME = 'SYS_ReportCache';
  var WIDTH = 10;
  var RETAINED_ROWS = 39;
  var FINAL_ROW_COUNT = RETAINED_ROWS + 1;
  var BACKUP_FILE_ID_PROPERTY = 'REPORT_CACHE_E15_BACKUP_FILE_ID';
  var PREPARED_SNAPSHOT_PROPERTY = 'REPORT_CACHE_E15_PREPARED_SNAPSHOT';
  var DESTRUCTIVE_APPROVAL_PROPERTY = 'REPORT_CACHE_E15_DESTRUCTIVE_APPROVAL';
  var HEADER = [
    'cacheVersion', 'dataVersion', 'monthKey', 'monthLabel', 'rowOrder',
    'colA', 'colB', 'colC', 'colD', 'colE'
  ];

  function getDryRun() {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Missing required sheet: ' + SHEET_NAME);

    var lastRow = sheet.getLastRow();
    var maxRows = sheet.getMaxRows();
    var lastColumn = sheet.getLastColumn();
    var retainedStartRow = lastRow - RETAINED_ROWS + 1;
    var header = sheet.getRange(1, 1, 1, WIDTH).getValues()[0];
    var rows = retainedStartRow >= 2
      ? sheet.getRange(retainedStartRow, 1, RETAINED_ROWS, WIDTH).getValues()
      : [];
    var formulas = retainedStartRow >= 2
      ? sheet.getRange(retainedStartRow, 1, RETAINED_ROWS, WIDTH).getFormulas()
      : [];
    var cacheVersions = uniqueStrings_(rows.map(function (row) { return row[0]; }));
    var dataVersions = uniqueStrings_(rows.map(function (row) { return row[1]; }));
    var monthKeys = uniqueStrings_(rows.map(function (row) { return reportCacheE1MonthKey_(row[2]); })).sort();
    var expectedOrders = [];
    for (var order = 1; order <= 13; order++) expectedOrders.push(order);
    var monthsValid = monthKeys.length === 3 && monthKeys.every(function (monthKey) {
      var orders = rows.filter(function (row) {
        return reportCacheE1MonthKey_(row[2]) === monthKey;
      }).map(function (row) { return Number(row[4]); }).sort(function (a, b) { return a - b; });
      return JSON.stringify(orders) === JSON.stringify(expectedOrders);
    });
    var formulasEmpty = formulas.every(function (row) {
      return row.every(function (formula) { return !formula; });
    });
    var expectedCacheVersion = SheetService.getReportCacheVersion();
    var checks = {
      modeSupabase: ReportCacheMode.get() === ReportCacheMode.SUPABASE,
      headerExact: JSON.stringify(header) === JSON.stringify(HEADER),
      lastColumnExact: lastColumn === WIDTH,
      enoughRows: lastRow >= FINAL_ROW_COUNT,
      retainedRowCountExact: rows.length === RETAINED_ROWS,
      noFormulasInRetainedBatch: formulasEmpty,
      oneCacheVersion: cacheVersions.length === 1 && cacheVersions[0] === expectedCacheVersion,
      oneDataVersion: dataVersions.length === 1 && !!dataVersions[0],
      threeMonthsWithThirteenRows: monthsValid
    };
    var ok = Object.keys(checks).every(function (key) { return checks[key]; });
    var result = {
      ok: ok,
      mode: ReportCacheMode.get(),
      spreadsheetId: APP_CONFIG.spreadsheetId,
      sheetName: SHEET_NAME,
      lastRow: lastRow,
      maxRows: maxRows,
      lastColumn: lastColumn,
      retainedStartRow: retainedStartRow,
      retainedRows: RETAINED_ROWS,
      rowsToArchive: Math.max(0, lastRow - FINAL_ROW_COUNT),
      physicalRowsToDelete: Math.max(0, maxRows - FINAL_ROW_COUNT),
      finalRowCount: FINAL_ROW_COUNT,
      cacheVersion: cacheVersions.length === 1 ? cacheVersions[0] : '',
      dataVersion: dataVersions.length === 1 ? dataVersions[0] : '',
      months: monthKeys,
      fingerprint: rows.length === RETAINED_ROWS ? hashRows_(rows) : '',
      checks: checks
    };
    console.log(JSON.stringify(result));
    return result;
  }

  function setBackupFileId(backupFileId) {
    if (ReportCacheMode.get() !== ReportCacheMode.SUPABASE) {
      throw new Error('E1.5 backup registration requires REPORT_CACHE_MODE=supabase.');
    }
    var fileId = String(backupFileId || '').trim();
    if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId) || fileId === APP_CONFIG.spreadsheetId) {
      throw new Error('Invalid E1.5 backup file ID. It must identify a separate workbook copy.');
    }
    PropertiesService.getScriptProperties().setProperty(BACKUP_FILE_ID_PROPERTY, fileId);
    var result = { ok: true, backupFileId: fileId };
    console.log(JSON.stringify(result));
    return result;
  }

  function prepare() {
    var dryRun = getDryRun();
    if (!dryRun.ok) throw new Error('E1.5 dry-run gate failed: ' + JSON.stringify(dryRun.checks));
    var properties = PropertiesService.getScriptProperties();
    var backupFileId = String(properties.getProperty(BACKUP_FILE_ID_PROPERTY) || '').trim();
    if (!backupFileId || backupFileId === APP_CONFIG.spreadsheetId) {
      throw new Error('E1.5 requires a separate full-workbook backup before preparation.');
    }
    var snapshot = {
      spreadsheetId: dryRun.spreadsheetId,
      lastRow: dryRun.lastRow,
      maxRows: dryRun.maxRows,
      retainedStartRow: dryRun.retainedStartRow,
      dataVersion: dryRun.dataVersion,
      fingerprint: dryRun.fingerprint,
      backupFileId: backupFileId,
      preparedAt: new Date().toISOString()
    };
    properties.setProperty(PREPARED_SNAPSHOT_PROPERTY, JSON.stringify(snapshot));
    properties.deleteProperty(DESTRUCTIVE_APPROVAL_PROPERTY);
    var result = { ok: true, dryRun: dryRun, snapshot: snapshot, destructiveApproved: false };
    console.log(JSON.stringify(result));
    return result;
  }

  function approveDestructivePass() {
    var properties = PropertiesService.getScriptProperties();
    var snapshot = readPreparedSnapshot_(properties);
    var dryRun = getDryRun();
    assertSnapshotMatches_(snapshot, dryRun);
    properties.setProperty(DESTRUCTIVE_APPROVAL_PROPERTY, dryRun.fingerprint);
    var result = {
      ok: true,
      fingerprint: dryRun.fingerprint,
      rowsToArchive: dryRun.rowsToArchive,
      physicalRowsToDelete: dryRun.physicalRowsToDelete,
      destructiveApproved: true
    };
    console.log(JSON.stringify(result));
    return result;
  }

  function run() {
    var properties = PropertiesService.getScriptProperties();
    var snapshot = readPreparedSnapshot_(properties);
    var approval = String(properties.getProperty(DESTRUCTIVE_APPROVAL_PROPERTY) || '');
    if (!approval || approval !== snapshot.fingerprint) {
      throw new Error('E1.5 destructive pass has not received its one-shot approval.');
    }

    try {
      return runReportCacheGuardedBatch_(function (waitedMs) {
        var lock = LockService.getScriptLock();
        lock.waitLock(30000);
        try {
          var dryRun = getDryRun();
          assertSnapshotMatches_(snapshot, dryRun);
          if (approval !== dryRun.fingerprint) {
            throw new Error('E1.5 approval fingerprint no longer matches live data.');
          }

          var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
          var sheet = spreadsheet.getSheetByName(SHEET_NAME);
          var source = sheet.getRange(dryRun.retainedStartRow, 1, RETAINED_ROWS, WIDTH);
          var target = sheet.getRange(2, 1, RETAINED_ROWS, WIDTH);
          source.copyTo(target);
          SpreadsheetApp.flush();
          if (hashRows_(target.getValues()) !== dryRun.fingerprint) {
            throw new Error('E1.5 retained batch verification failed before row deletion.');
          }

          if (sheet.getMaxRows() > FINAL_ROW_COUNT) {
            sheet.deleteRows(FINAL_ROW_COUNT + 1, sheet.getMaxRows() - FINAL_ROW_COUNT);
          }
          SpreadsheetApp.flush();
          var post = getDryRun();
          if (!post.ok || post.lastRow !== FINAL_ROW_COUNT || post.maxRows !== FINAL_ROW_COUNT ||
              post.fingerprint !== dryRun.fingerprint) {
            throw new Error('E1.5 post-compaction verification failed: ' + JSON.stringify(post));
          }
          var result = {
            ok: true,
            waitedMs: waitedMs,
            backupFileId: snapshot.backupFileId,
            archivedRows: dryRun.rowsToArchive,
            deletedPhysicalRows: dryRun.physicalRowsToDelete,
            retainedRows: RETAINED_ROWS,
            finalRowCount: post.lastRow,
            dataVersion: post.dataVersion,
            fingerprint: post.fingerprint
          };
          console.log(JSON.stringify(result));
          return result;
        } finally {
          lock.releaseLock();
        }
      });
    } finally {
      properties.deleteProperty(DESTRUCTIVE_APPROVAL_PROPERTY);
    }
  }

  function readPreparedSnapshot_(properties) {
    var raw = properties.getProperty(PREPARED_SNAPSHOT_PROPERTY);
    if (!raw) throw new Error('E1.5 has not been prepared. Run the dry-run/backup phase first.');
    var snapshot;
    try {
      snapshot = JSON.parse(raw);
    } catch (err) {
      throw new Error('Invalid E1.5 prepared snapshot. Prepare the checkpoint again.');
    }
    if (!snapshot.backupFileId || snapshot.spreadsheetId !== APP_CONFIG.spreadsheetId) {
      throw new Error('Invalid E1.5 prepared snapshot metadata.');
    }
    return snapshot;
  }

  function assertSnapshotMatches_(snapshot, dryRun) {
    if (!dryRun.ok || snapshot.lastRow !== dryRun.lastRow || snapshot.maxRows !== dryRun.maxRows ||
        snapshot.retainedStartRow !== dryRun.retainedStartRow || snapshot.dataVersion !== dryRun.dataVersion ||
        snapshot.fingerprint !== dryRun.fingerprint) {
      throw new Error('E1.5 live cache changed after preparation. Run dry-run/backup preparation again.');
    }
  }

  function uniqueStrings_(values) {
    return (values || []).map(function (value) {
      return String(value === null || value === undefined ? '' : value).trim();
    }).filter(function (value, index, list) {
      return value && list.indexOf(value) === index;
    });
  }

  function hashRows_(rows) {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(rows),
      Utilities.Charset.UTF_8
    );
    return bytes.map(function (value) {
      var normalized = value < 0 ? value + 256 : value;
      return ('0' + normalized.toString(16)).slice(-2);
    }).join('');
  }

  return {
    BACKUP_FILE_ID_PROPERTY: BACKUP_FILE_ID_PROPERTY,
    PREPARED_SNAPSHOT_PROPERTY: PREPARED_SNAPSHOT_PROPERTY,
    DESTRUCTIVE_APPROVAL_PROPERTY: DESTRUCTIVE_APPROVAL_PROPERTY,
    getDryRun: getDryRun,
    setBackupFileId: setBackupFileId,
    prepare: prepare,
    approveDestructivePass: approveDestructivePass,
    run: run
  };
})();

/** Read-only E1.5 editor/clasp wrapper. */
function getReportCacheCompactionDryRunForMigration() {
  return ReportCacheCompactionMigration.getDryRun();
}

/** Registers the ID of the externally created full-workbook backup. */
function setReportCacheCompactionBackupForMigration(backupFileId) {
  return ReportCacheCompactionMigration.setBackupFileId(backupFileId);
}

/** Stores an immutable live-data snapshot; never deletes Sheet rows. */
function prepareReportCacheCompactionForMigration() {
  return ReportCacheCompactionMigration.prepare();
}

/** Must only be invoked after a separate user approval of the destructive E1.5 pass. */
function approveReportCacheCompactionForMigration() {
  return ReportCacheCompactionMigration.approveDestructivePass();
}

/** Destructive E1.5 pass; guarded by backup, snapshot and one-shot approval. */
function runReportCacheCompactionForMigration() {
  return ReportCacheCompactionMigration.run();
}
