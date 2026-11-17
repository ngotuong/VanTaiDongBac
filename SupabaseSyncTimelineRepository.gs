/** Durable, server-only generation timeline. Business work never depends on it. */
var SupabaseSyncTimelineRepository = (function () {
  var TABLE_NAME = 'sync_timeline_events';
  var batchRows = null;

  function upsert(row) {
    if (batchRows) {
      batchRows[row.event_key] = row;
      return;
    }
    return SupabaseHttpClient.upsertRows(TABLE_NAME, [row], 'event_key');
  }

  function withBatch(work) {
    if (batchRows) return work();
    batchRows = Object.create(null);
    try {
      return work();
    } finally {
      var rows = Object.keys(batchRows).map(function (key) { return batchRows[key]; });
      batchRows = null;
      if (rows.length) {
        try {
          SupabaseHttpClient.upsertRows(TABLE_NAME, rows, 'event_key');
        } catch (error) {
          console.log('sync_timeline_batch_failed: telemetry publication deferred.');
        }
      }
    }
  }

  return { upsert: upsert, withBatch: withBatch };
})();
