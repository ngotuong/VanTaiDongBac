/**
 * Persistence boundary for Supabase cache bundle tables.
 * Table selection, row shape, conflict keys, and queries remain explicit at
 * SupabaseService call sites so this repository adds no business policy.
 */
var SupabaseBundleRepository = (function () {
  function upsertRows(tableName, rows, onConflict) {
    return SupabaseHttpClient.upsertRows(tableName, rows, onConflict);
  }

  function readRows(tableName, query) {
    return SupabaseHttpClient.readRows(tableName, query);
  }

  function updateRows(tableName, patch, filters) {
    return SupabaseHttpClient.updateRows(tableName, patch, filters);
  }

  return {
    upsertRows: upsertRows,
    readRows: readRows,
    updateRows: updateRows
  };
})();
