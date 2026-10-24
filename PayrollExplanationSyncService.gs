/** Syncs server-only payroll explanation bundles to Supabase. */
var PayrollExplanationSyncService = (function () {
  var TABLE_NAME = 'payroll_explanation_bundles_v6';

  function syncMonth(month, context, options) {
    var normalizedMonth = PayrollExplanationService.normalizeMonth(month);
    if (!normalizedMonth) throw new Error('Tháng giải trình phải có dạng MM/YYYY.');
    var syncedAt = context.nowISOString();
    var sourceDataVersion = String(options && options.sourceDataVersion || '').trim() || context.getReportDataVersion();
    var spreadsheet = context.getSpreadsheet();
    var bundles = PayrollExplanationService.buildMonth(spreadsheet, normalizedMonth, {
      syncedAt: syncedAt,
      sourceDataVersion: sourceDataVersion
    });
    // Build the complete replacement first. A read/formula error must never
    // invalidate the last usable explanation month.
    var rows = bundles.map(function (bundle) {
      return {
        spreadsheet_id: context.spreadsheetId,
        report_month: normalizedMonth,
        employee_key: bundle.employeeKey,
        employee_name: bundle.employeeName,
        payload: bundle,
        reconciliation_status: bundle.status,
        source_data_version: sourceDataVersion,
        source_hash: context.hashPayload(bundle),
        is_current: true,
        synced_at: syncedAt
      };
    });
    context.replaceMonth(context.spreadsheetId, normalizedMonth, rows);
    var dailyLines = [];
    bundles.forEach(function (bundle) {
      (bundle.salaryLines || []).forEach(function (line) {
        if (line.dailyEvidenceStatus !== 'not_applicable') dailyLines.push(line);
      });
    });
    context.writeSyncStatus(
      'payroll_explanations:' + normalizedMonth,
      'transport',
      'ok',
      'Payroll explanations synced: ' + rows.length + '; daily mixed lines: ' + dailyLines.length + '.',
      syncedAt
    );
    return {
      ok: true,
      table: TABLE_NAME,
      spreadsheetId: context.spreadsheetId,
      reportMonth: normalizedMonth,
      synced: rows.length,
      matched: bundles.filter(function (bundle) { return bundle.status === 'matched'; }).length,
      needsReview: bundles.filter(function (bundle) { return bundle.status === 'needs_review'; }).length,
      dailyMixedLines: dailyLines.length,
      dailyMatchedLines: dailyLines.filter(function (line) { return line.dailyEvidenceStatus === 'matched'; }).length,
      dailyNeedsReviewLines: dailyLines.filter(function (line) { return line.dailyEvidenceStatus === 'needs_review'; }).length,
      sourceDataVersion: sourceDataVersion,
      syncedAt: syncedAt
    };
  }

  return { syncMonth: syncMonth };
})();
