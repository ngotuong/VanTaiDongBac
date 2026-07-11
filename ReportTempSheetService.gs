var ReportTempSheetService = (function () {
  function computeDetails(ss, sourceSheet, months, options) {
    var detailsByMonth = {};
    var lock = LockService.getScriptLock();
    var locked = false;
    var tempSheet = null;
    try {
      lock.waitLock(15000);
      locked = true;
      cleanup(ss);
      tempSheet = sourceSheet.copyTo(ss);
      tempSheet.setName('_TMP_BC_TongQuan_' + Utilities.getUuid().slice(0, 8));
      tempSheet.hideSheet();

      (months || []).forEach(function (month) {
        var monthLabel = options.clean(month);
        if (!monthLabel) return;
        tempSheet.getRange('B1').setValue(options.parseMonth(monthLabel));
        SpreadsheetApp.flush();
        var monthKey = options.normalizeMonth(monthLabel);
        detailsByMonth[monthKey] = options.readDetails(tempSheet);
      });
    } catch (e) {
      console.error('Lỗi tính toán/cache báo cáo chi tiết trên sheet tạm:', e);
    } finally {
      if (tempSheet) {
        try {
          ss.deleteSheet(tempSheet);
        } catch (deleteError) {
          console.error('Không xóa được sheet tạm báo cáo:', deleteError);
        }
      }
      if (locked) lock.releaseLock();
    }
    return detailsByMonth;
  }

  function cleanup(ss) {
    ss.getSheets().forEach(function (candidate) {
      if (isTempSheetName(candidate.getName())) ss.deleteSheet(candidate);
    });
  }

  function cleanupAndReport(ss) {
    var deleted = [];
    ss.getSheets().forEach(function (candidate) {
      if (!isTempSheetName(candidate.getName())) return;
      deleted.push(candidate.getName());
      ss.deleteSheet(candidate);
    });
    return { ok: true, deleted: deleted, count: deleted.length };
  }

  function isTempSheetName(sheetName) {
    var name = normalizeCleanValue_(sheetName);
    return name.indexOf('_TMP_BC_TongQuan_') === 0
      || /^Bản sao của BC_TongQuan(?: \d+)?$/.test(name)
      || /^Copy of BC_TongQuan(?: \d+)?$/.test(name);
  }

  return {
    computeDetails: computeDetails,
    cleanup: cleanup,
    cleanupAndReport: cleanupAndReport,
    isTempSheetName: isTempSheetName
  };
})();
