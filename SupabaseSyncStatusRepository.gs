/** Persistence boundary for the operational Supabase sync_status table. */
var SupabaseSyncStatusRepository = (function () {
  var TABLE_NAME = 'sync_status';
  // Invocation-local telemetry only; business queues remain durable elsewhere.
  var batchRows = null;

  function upsert(row) {
    // The watchdog heartbeat must reach Supabase before a potentially slow
    // source stage, including one terminated without running finally.
    if (batchRows && row.sync_key !== 'realtime_cache_worker') {
      batchRows[row.sync_key] = row;
      return;
    }
    return SupabaseHttpClient.upsertRows(TABLE_NAME, [row], 'sync_key');
  }

  function withBatch(work) {
    // Nested work shares the enclosing tick; only its owner publishes.
    if (batchRows) return work();
    batchRows = Object.create(null);
    try {
      return work();
    } finally {
      var rows = Object.keys(batchRows).map(function (key) { return batchRows[key]; });
      batchRows = null;
      if (rows.length) {
        try {
          SupabaseHttpClient.upsertRows(TABLE_NAME, rows, 'sync_key');
        } catch (error) {
          // Status writes were already best-effort. Never replay business work
          // or mask its error because telemetry publication failed.
          console.log('sync_status_batch_failed: status publication deferred.');
        }
      }
    }
  }

  function readRows(query) {
    return SupabaseHttpClient.readRows(TABLE_NAME, query);
  }

  return {
    upsert: upsert,
    withBatch: withBatch,
    readRows: readRows
  };
})();
