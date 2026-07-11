/** Executes queued Transport write actions and their cache sync side effects. */
var TransportJobHandler = (function () {
  function canHandle(actionName) {
    return ['submitRows', 'saveSheetRow', 'deleteSheetRow'].indexOf(actionName) !== -1;
  }

  function assertResult_(result, fallbackMessage) {
    if (result && result.ok !== false) return result;
    var errorMessage = result && (result.error || (result.errors && result.errors.join('; ')));
    throw new Error(errorMessage || fallbackMessage || 'Write job thất bại.');
  }

  function captureSync_(target, field, syncFn) {
    try {
      target[field] = syncFn();
    } catch (err) {
      target[field] = { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function execute(job, context) {
    var actionName = context.clean(job.action);
    var payload = job.payload || {};
    if (actionName === 'submitRows') {
      var result = context.submitRows(payload.formType, payload.rows || [], {
        jobId: job.id,
        idempotencyKey: job.idempotency_key
      });
      assertResult_(result, 'Không thể ghi dữ liệu Vận hành.');
      if (result && result.inserted) {
        captureSync_(result, 'supabaseSync', function () {
          return context.syncTransportAfterWrite(result.sheetName, payload.rows || [], { fast: true });
        });
        captureSync_(result, 'dashboardSync', context.syncDashboard);
        captureSync_(result, 'reportSync', function () {
          return context.syncTransportReportsAfterWrite(result.sheetName, payload.rows || [], { includeAll: true });
        });
      }
      return result;
    }
    if (actionName === 'saveSheetRow') {
      var saveResult = context.saveSheetRow(payload.sheetName, payload.rowIndex, payload.rowData || {}, payload.previousRowData || null);
      assertResult_(saveResult, 'Không thể sửa dòng Vận hành.');
      if (saveResult && saveResult.ok !== false) {
        captureSync_(saveResult, 'supabaseSync', function () {
          return context.syncTransportAfterWrite(payload.sheetName, [payload.rowData || {}], { fast: true });
        });
        if (payload.sheetName === 'NL_VanChuyen') {
          captureSync_(saveResult, 'dashboardSync', context.syncDashboard);
        }
        captureSync_(saveResult, 'reportSync', function () {
          return context.syncTransportReportsAfterWrite(
            payload.sheetName,
            [payload.previousRowData || {}, payload.rowData || {}],
            { includeAll: true }
          );
        });
      }
      return saveResult;
    }
    if (actionName === 'deleteSheetRow') {
      if (!Array.isArray(payload.columnsToClear) || !payload.columnsToClear.length) {
        throw new Error('Job deleteSheetRow không có columnsToClear; từ chối deleteRow() để tránh xóa nhầm khi retry.');
      }
      var deleteResult = context.deleteSheetRow(
        payload.sheetName,
        payload.rowIndex,
        payload.columnsToClear || null,
        payload.rowData || null
      );
      assertResult_(deleteResult, 'Không thể xóa nội dung dòng Vận hành.');
      if (deleteResult && deleteResult.ok !== false) {
        captureSync_(deleteResult, 'supabaseSync', function () {
          return context.syncTransportAfterWrite(payload.sheetName, [], { fast: true });
        });
        if (payload.sheetName === 'NL_VanChuyen') {
          captureSync_(deleteResult, 'dashboardSync', context.syncDashboard);
        }
        captureSync_(deleteResult, 'reportSync', function () {
          return context.syncTransportReportsAfterWrite(payload.sheetName, [payload.rowData || {}], { includeAll: true });
        });
      }
      return deleteResult;
    }
    throw new Error('Transport write job action chưa được hỗ trợ: ' + actionName);
  }

  return { canHandle: canHandle, execute: execute };
})();
