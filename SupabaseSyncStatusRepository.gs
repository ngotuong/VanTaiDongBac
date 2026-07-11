/** Persistence boundary for the operational Supabase sync_status table. */
var SupabaseSyncStatusRepository = (function () {
  var TABLE_NAME = 'sync_status';

  function upsert(row) {
    return SupabaseHttpClient.upsertRows(TABLE_NAME, [row], 'sync_key');
  }

  function readRows(query) {
    return SupabaseHttpClient.readRows(TABLE_NAME, query);
  }

  return {
    upsert: upsert,
    readRows: readRows
  };
})();
