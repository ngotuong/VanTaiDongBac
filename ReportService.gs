var ReportService = (function () {
  function getDashboard(month, forceRefresh, options) {
    return SheetService.getDashboard(month, forceRefresh, options);
  }

  function getReports(forceRefresh) {
    return SheetService.getReports(forceRefresh);
  }

  function getReport(type, month, forceRefresh) {
    return SheetService.getReport(type, month, forceRefresh);
  }

  function getReportBundle(month, forceRefresh, options) {
    return SheetService.getReportBundle(month, forceRefresh, options);
  }

  function beginReportRefreshBatch() {
    return SheetService.beginReportRefreshBatch();
  }

  function getReportDataVersion() {
    return SheetService.getReportDataVersion();
  }

  function getReportCacheVersion() {
    return SheetService.getReportCacheVersion();
  }

  return {
    getDashboard: getDashboard,
    getReports: getReports,
    getReport: getReport,
    getReportBundle: getReportBundle,
    beginReportRefreshBatch: beginReportRefreshBatch,
    getReportDataVersion: getReportDataVersion,
    getReportCacheVersion: getReportCacheVersion
  };
})();
