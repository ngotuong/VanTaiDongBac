/** Persistence boundary for Supabase write_jobs and write_job_logs. */
var WriteJobRepository = (function () {
  var TABLE_WRITE_JOBS = 'write_jobs';
  var TABLE_WRITE_JOB_LOGS = 'write_job_logs';
  var JOB_SELECT = 'id,module,action,status,result,attempts,max_attempts,last_error,idempotency_key,worker_id,claimed_at,created_at,updated_at,synced_at';
  var RECENT_SELECT = 'id,module,action,status,payload,result,attempts,max_attempts,last_error,idempotency_key,worker_id,claimed_at,created_at,updated_at,synced_at';

  function normalizeRow(row) {
    return {
      ok: true,
      jobId: row.id,
      module: row.module,
      action: row.action,
      idempotencyKey: row.idempotency_key || '',
      workerId: row.worker_id || '',
      claimedAt: row.claimed_at || '',
      status: row.status,
      result: row.result || null,
      payload: row.payload || null,
      attempts: row.attempts || 0,
      maxAttempts: row.max_attempts || 0,
      lastError: row.last_error || '',
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
      syncedAt: row.synced_at || ''
    };
  }

  function findByIdempotency(moduleName, idempotencyKey) {
    var rows = SupabaseHttpClient.readRows(TABLE_WRITE_JOBS, {
      module: 'eq.' + moduleName,
      idempotency_key: 'eq.' + idempotencyKey,
      select: JOB_SELECT,
      limit: '1'
    });
    return rows.length ? normalizeRow(rows[0]) : null;
  }

  function create(row) {
    SupabaseHttpClient.upsertRows(TABLE_WRITE_JOBS, [row], 'id');
    appendLog({
      job_id: row.id,
      status: 'pending',
      message: 'Write job queued.',
      details: { action: row.action, module: row.module, idempotencyKey: row.idempotency_key }
    });
  }

  function appendLog(row) {
    return SupabaseHttpClient.insertRows(TABLE_WRITE_JOB_LOGS, [row]);
  }

  function get(jobId) {
    var rows = SupabaseHttpClient.readRows(TABLE_WRITE_JOBS, {
      id: 'eq.' + jobId,
      select: JOB_SELECT,
      limit: '1'
    });
    return rows.length ? normalizeRow(rows[0]) : null;
  }

  function listRecent(moduleName, actionName, limit) {
    var query = { select: RECENT_SELECT, order: 'created_at.desc', limit: String(limit) };
    if (moduleName) query.module = 'eq.' + moduleName;
    if (actionName) query.action = 'eq.' + actionName;
    return (SupabaseHttpClient.readRows(TABLE_WRITE_JOBS, query) || []).map(normalizeRow);
  }

  function retry(jobId, nextRunAt) {
    SupabaseHttpClient.updateRows(TABLE_WRITE_JOBS, {
      status: 'pending', attempts: 0, last_error: '', next_run_at: nextRunAt,
      locked_at: null, claimed_at: null, worker_id: null
    }, { id: 'eq.' + jobId });
    appendLog({ job_id: jobId, status: 'pending', message: 'Write job manually retried.' });
  }

  function markProcessing(jobId, details) {
    appendLog({ job_id: jobId, status: 'processing', message: 'Write job processing started.', details: details });
  }

  function markSynced(jobId, result, syncedAt) {
    SupabaseHttpClient.updateRows(TABLE_WRITE_JOBS, {
      status: 'synced', result: result, synced_at: syncedAt, locked_at: null, last_error: ''
    }, { id: 'eq.' + jobId });
    appendLog({ job_id: jobId, status: 'synced', message: 'Write job synced to Google Sheet.', details: result });
  }

  function markFailure(jobId, status, errorMessage, nextRunAt, details) {
    SupabaseHttpClient.updateRows(TABLE_WRITE_JOBS, {
      status: status, last_error: errorMessage, locked_at: null, next_run_at: nextRunAt
    }, { id: 'eq.' + jobId });
    appendLog({ job_id: jobId, status: status, message: errorMessage, details: details });
  }

  return {
    normalizeRow: normalizeRow,
    findByIdempotency: findByIdempotency,
    create: create,
    appendLog: appendLog,
    get: get,
    listRecent: listRecent,
    retry: retry,
    markProcessing: markProcessing,
    markSynced: markSynced,
    markFailure: markFailure
  };
})();
