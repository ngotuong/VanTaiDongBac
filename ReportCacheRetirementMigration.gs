/** Controlled retirement migration for the non-business SYS_ReportCache sheet. */
var ReportCacheRetirementMigration = (function () {
  var SHEET_NAME = 'SYS_ReportCache';
  var WIDTH = 10;
  var BACKUP_ID_PROPERTY = 'REPORT_CACHE_RETIREMENT_BACKUP_ID';
  var BACKUP_FINGERPRINT_PROPERTY = 'REPORT_CACHE_RETIREMENT_BACKUP_FINGERPRINT';
  var PREPARED_PROPERTY = 'REPORT_CACHE_RETIREMENT_PREPARED';
  var APPROVAL_PROPERTY = 'REPORT_CACHE_RETIREMENT_APPROVAL';
  var RESTORE_APPROVAL_PROPERTY = 'REPORT_CACHE_RETIREMENT_RESTORE_APPROVAL';
  var RETIRED_AT_PROPERTY = 'REPORT_CACHE_RETIRED_AT';
  var HEADER = [
    'cacheVersion', 'dataVersion', 'monthKey', 'monthLabel', 'rowOrder',
    'colA', 'colB', 'colC', 'colD', 'colE'
  ];

  function getDryRun() {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);
    var supabase = getSupabaseGate_();
    if (!sheet) {
      return {
        ok: supabase.ok,
        alreadyRetired: true,
        spreadsheetId: APP_CONFIG.spreadsheetId,
        sheetName: SHEET_NAME,
        mode: ReportCacheMode.get(),
        supabase: supabase
      };
    }

    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    var rowCount = Math.max(lastRow, 1);
    var values = sheet.getRange(1, 1, rowCount, WIDTH).getValues();
    var formulas = sheet.getRange(1, 1, rowCount, WIDTH).getFormulas();
    var header = values[0] || [];
    var checks = {
      supabaseOnlyRuntime: ReportCacheMode.get() === ReportCacheMode.SUPABASE &&
        ReportCacheMode.describe().sheetCacheRetired === true,
      exactHeader: JSON.stringify(header) === JSON.stringify(HEADER),
      exactWidth: lastColumn === WIDTH,
      noFormulas: formulas.every(function (row) {
        return row.every(function (formula) { return !formula; });
      }),
      supabaseReady: supabase.ok
    };
    var fingerprint = hash_({
      spreadsheetId: APP_CONFIG.spreadsheetId,
      sheetId: sheet.getSheetId(),
      values: values,
      formulas: formulas
    });
    return {
      ok: Object.keys(checks).every(function (key) { return checks[key]; }),
      alreadyRetired: false,
      spreadsheetId: APP_CONFIG.spreadsheetId,
      sheetName: SHEET_NAME,
      sheetId: sheet.getSheetId(),
      rowCount: lastRow,
      maxRows: sheet.getMaxRows(),
      lastColumn: lastColumn,
      fingerprint: fingerprint,
      mode: ReportCacheMode.get(),
      checks: checks,
      supabase: supabase
    };
  }

  function refreshSupabase() {
    if (ReportCacheMode.get() !== ReportCacheMode.SUPABASE) {
      throw new Error('Report cache retirement requires the Supabase-only runtime.');
    }
    return runReportCacheGuardedBatch_(function (waitedMs) {
      var result = syncAllReportBundlesToSupabase();
      result.retirementGuard = { waitedMs: waitedMs };
      return result;
    });
  }

  function createBackup() {
    var dryRun = getDryRun();
    if (!dryRun.ok || dryRun.alreadyRetired) {
      throw new Error('Report cache retirement backup requires a valid live SYS_ReportCache dry-run.');
    }
    var sourceSpreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var sourceSheet = sourceSpreadsheet.getSheetByName(SHEET_NAME);
    if (!sourceSheet || sourceSheet.getSheetId() !== dryRun.sheetId) {
      throw new Error('SYS_ReportCache changed before backup creation.');
    }

    var timestamp = Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss');
    var backup = SpreadsheetApp.create('BACKUP - SYS_ReportCache retirement - ' + timestamp);
    var defaultSheet = backup.getSheets()[0];
    var copiedSheet = sourceSheet.copyTo(backup);
    copiedSheet.setName(SHEET_NAME);
    // SYS_ReportCache is hidden in the source workbook. Google Sheets refuses
    // to delete the last visible sheet, so make the verified backup copy visible.
    copiedSheet.showSheet();
    backup.deleteSheet(defaultSheet);
    SpreadsheetApp.flush();

    var backupFingerprint = fingerprintSheet_(copiedSheet, dryRun.spreadsheetId, dryRun.sheetId);
    if (backupFingerprint !== dryRun.fingerprint) {
      throw new Error('SYS_ReportCache backup fingerprint mismatch.');
    }
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty(BACKUP_ID_PROPERTY, backup.getId());
    properties.setProperty(BACKUP_FINGERPRINT_PROPERTY, backupFingerprint);
    properties.deleteProperty(PREPARED_PROPERTY);
    properties.deleteProperty(APPROVAL_PROPERTY);
    return {
      ok: true,
      backupId: backup.getId(),
      sheetName: SHEET_NAME,
      rowCount: dryRun.rowCount,
      fingerprint: backupFingerprint
    };
  }

  function prepare() {
    var dryRun = getDryRun();
    if (!dryRun.ok || dryRun.alreadyRetired) {
      throw new Error('Report cache retirement dry-run failed or the sheet is already retired.');
    }
    var properties = PropertiesService.getScriptProperties();
    var backupId = String(properties.getProperty(BACKUP_ID_PROPERTY) || '').trim();
    var backupFingerprint = String(properties.getProperty(BACKUP_FINGERPRINT_PROPERTY) || '').trim();
    if (!backupId || backupFingerprint !== dryRun.fingerprint) {
      throw new Error('A matching SYS_ReportCache backup is required before preparation.');
    }
    var backup = SpreadsheetApp.openById(backupId);
    var backupSheet = backup.getSheetByName(SHEET_NAME);
    if (!backupSheet || fingerprintSheet_(backupSheet, dryRun.spreadsheetId, dryRun.sheetId) !== dryRun.fingerprint) {
      throw new Error('The registered SYS_ReportCache backup is missing or changed.');
    }

    var snapshot = {
      spreadsheetId: dryRun.spreadsheetId,
      sheetId: dryRun.sheetId,
      rowCount: dryRun.rowCount,
      fingerprint: dryRun.fingerprint,
      backupId: backupId,
      preparedAt: new Date().toISOString()
    };
    properties.setProperty(PREPARED_PROPERTY, JSON.stringify(snapshot));
    properties.deleteProperty(APPROVAL_PROPERTY);
    return { ok: true, prepared: snapshot };
  }

  function approve() {
    var snapshot = readSnapshot_();
    var dryRun = getDryRun();
    assertSnapshot_(snapshot, dryRun);
    var token = approvalToken_(snapshot);
    PropertiesService.getScriptProperties().setProperty(APPROVAL_PROPERTY, token);
    return { ok: true, approved: true, fingerprint: snapshot.fingerprint };
  }

  function run() {
    return runReportCacheGuardedBatch_(function (waitedMs) {
      var properties = PropertiesService.getScriptProperties();
      var snapshot = readSnapshot_();
      var dryRun = getDryRun();
      assertSnapshot_(snapshot, dryRun);
      var approval = String(properties.getProperty(APPROVAL_PROPERTY) || '');
      if (!approval || approval !== approvalToken_(snapshot)) {
        throw new Error('Report cache retirement requires a matching one-shot approval.');
      }
      properties.deleteProperty(APPROVAL_PROPERTY);

      var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
      var sheet = spreadsheet.getSheetByName(SHEET_NAME);
      if (!sheet || sheet.getSheetId() !== snapshot.sheetId) {
        throw new Error('SYS_ReportCache target changed before deletion.');
      }
      spreadsheet.deleteSheet(sheet);
      SpreadsheetApp.flush();
      if (spreadsheet.getSheetByName(SHEET_NAME)) {
        throw new Error('SYS_ReportCache still exists after deletion.');
      }

      var retiredAt = new Date().toISOString();
      properties.setProperty(RETIRED_AT_PROPERTY, retiredAt);
      properties.deleteProperty(PREPARED_PROPERTY);
      return {
        ok: true,
        retired: true,
        spreadsheetId: APP_CONFIG.spreadsheetId,
        sheetName: SHEET_NAME,
        backupId: snapshot.backupId,
        retiredAt: retiredAt,
        waitedMs: waitedMs
      };
    });
  }

  function approveRestore() {
    var properties = PropertiesService.getScriptProperties();
    var backupId = String(properties.getProperty(BACKUP_ID_PROPERTY) || '').trim();
    var fingerprint = String(properties.getProperty(BACKUP_FINGERPRINT_PROPERTY) || '').trim();
    if (!backupId || !fingerprint) throw new Error('No registered SYS_ReportCache backup exists.');
    var token = hash_({ backupId: backupId, fingerprint: fingerprint, spreadsheetId: APP_CONFIG.spreadsheetId });
    properties.setProperty(RESTORE_APPROVAL_PROPERTY, token);
    return { ok: true, approved: true, backupId: backupId };
  }

  function restore() {
    var properties = PropertiesService.getScriptProperties();
    var backupId = String(properties.getProperty(BACKUP_ID_PROPERTY) || '').trim();
    var fingerprint = String(properties.getProperty(BACKUP_FINGERPRINT_PROPERTY) || '').trim();
    var token = hash_({ backupId: backupId, fingerprint: fingerprint, spreadsheetId: APP_CONFIG.spreadsheetId });
    if (String(properties.getProperty(RESTORE_APPROVAL_PROPERTY) || '') !== token) {
      throw new Error('SYS_ReportCache restore requires a matching one-shot approval.');
    }
    properties.deleteProperty(RESTORE_APPROVAL_PROPERTY);

    var target = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    if (target.getSheetByName(SHEET_NAME)) throw new Error('SYS_ReportCache already exists; restore aborted.');
    var backup = SpreadsheetApp.openById(backupId);
    var source = backup.getSheetByName(SHEET_NAME);
    if (!source) throw new Error('SYS_ReportCache is missing from the registered backup.');
    var copied = source.copyTo(target);
    copied.setName(SHEET_NAME);
    copied.hideSheet();
    SpreadsheetApp.flush();
    return { ok: true, restored: true, sheetName: SHEET_NAME, backupId: backupId };
  }

  function getSupabaseGate_() {
    var dataVersion = SheetService.getReportDataVersion();
    var rows = SupabaseBundleRepository.readRows('report_bundles', {
      spreadsheet_id: 'eq.' + APP_CONFIG.spreadsheetId,
      cache_version: 'eq.' + SheetService.getReportCacheVersion(),
      source_data_version: 'eq.' + dataVersion,
      select: 'report_month,cache_version,source_data_version,details_hash,synced_at',
      limit: '100'
    }) || [];
    var validRows = rows.filter(function (row) {
      return row.cache_version === SheetService.getReportCacheVersion() &&
        String(row.source_data_version || '') === String(dataVersion) &&
        /^[a-f0-9]{64}$/.test(String(row.details_hash || ''));
    });
    var months = validRows.map(function (row) { return String(row.report_month || ''); }).filter(Boolean);
    return {
      ok: validRows.length >= 2 && months.indexOf('Tất cả') !== -1,
      dataVersion: String(dataVersion),
      rowCount: validRows.length,
      months: months.sort()
    };
  }

  function fingerprintSheet_(sheet, sourceSpreadsheetId, sourceSheetId) {
    var rowCount = Math.max(sheet.getLastRow(), 1);
    return hash_({
      spreadsheetId: sourceSpreadsheetId,
      sheetId: sourceSheetId,
      values: sheet.getRange(1, 1, rowCount, WIDTH).getValues(),
      formulas: sheet.getRange(1, 1, rowCount, WIDTH).getFormulas()
    });
  }

  function hash_(value) {
    return CacheAuditService.hashPayload(value);
  }

  function readSnapshot_() {
    var raw = PropertiesService.getScriptProperties().getProperty(PREPARED_PROPERTY);
    if (!raw) throw new Error('Report cache retirement has not been prepared.');
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('Invalid report cache retirement snapshot.');
    }
  }

  function approvalToken_(snapshot) {
    return hash_({
      spreadsheetId: snapshot.spreadsheetId,
      sheetId: snapshot.sheetId,
      fingerprint: snapshot.fingerprint,
      backupId: snapshot.backupId
    });
  }

  function assertSnapshot_(snapshot, dryRun) {
    if (!dryRun.ok || dryRun.alreadyRetired ||
        snapshot.spreadsheetId !== dryRun.spreadsheetId ||
        Number(snapshot.sheetId) !== Number(dryRun.sheetId) ||
        Number(snapshot.rowCount) !== Number(dryRun.rowCount) ||
        snapshot.fingerprint !== dryRun.fingerprint) {
      throw new Error('SYS_ReportCache changed after preparation; run dry-run, backup and prepare again.');
    }
  }

  return {
    getDryRun: getDryRun,
    refreshSupabase: refreshSupabase,
    createBackup: createBackup,
    prepare: prepare,
    approve: approve,
    run: run,
    approveRestore: approveRestore,
    restore: restore
  };
})();

function getReportCacheRetirementDryRunForMigration() {
  var result = ReportCacheRetirementMigration.getDryRun();
  console.log(JSON.stringify(result));
  return result;
}

function refreshReportCacheForRetirementMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.refreshSupabase()
  );
}

function createReportCacheRetirementBackupForMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.createBackup()
  );
}

function prepareReportCacheRetirementForMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.prepare()
  );
}

function approveReportCacheRetirementForMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.approve()
  );
}

function runReportCacheRetirementForMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.run()
  );
}

function approveReportCacheRestoreForMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.approveRestore()
  );
}

function restoreReportCacheFromBackupForMigration() {
  return logReportCacheRetirementResult_(
    ReportCacheRetirementMigration.restore()
  );
}

function logReportCacheRetirementResult_(result) {
  console.log(JSON.stringify(result));
  return result;
}
