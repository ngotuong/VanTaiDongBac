var ReportService = (function () {
  function getDashboard(month, forceRefresh) {
    return SheetService.getDashboard(month, forceRefresh);
  }

  function getReports(forceRefresh) {
    return SheetService.getReports(forceRefresh);
  }

  function getReport(type, month, forceRefresh) {
    return SheetService.getReport(type, month, forceRefresh);
  }

  function getReportBundle(month, forceRefresh) {
    return SheetService.getReportBundle(month, forceRefresh);
  }

  return {
    getDashboard: getDashboard,
    getReports: getReports,
    getReport: getReport,
    getReportBundle: getReportBundle
  };
})();
