/** Server-only RPC adapter for the D2 generation shadow outbox. */
var SupabaseSyncGenerationRepository = (function () {
  function enqueue(row) {
    return SupabaseHttpClient.callRpc('enqueue_sync_generation', {
      p_event_key: row.event_key,
      p_generation_id: row.generation_id,
      p_workbook_year: row.workbook_year,
      p_module: row.module,
      p_queue_name: row.queue_name,
      p_source_type: row.source_type,
      p_scope_sheet_names: row.scope_sheet_names || [],
      p_scope_grid_ids: row.scope_grid_ids || [],
      p_scope_row_ranges: row.scope_row_ranges || [],
      p_scope_months: row.scope_months || [],
      p_scope_start_row: row.scope_start_row || null,
      p_scope_num_rows: row.scope_num_rows || null,
      p_structural: row.structural === true,
      p_full_refresh: row.full_refresh === true,
      p_source_committed_at: row.source_committed_at || null,
      p_last_signal_at: row.last_signal_at,
      p_not_before: row.not_before,
      p_source_data_version: row.source_data_version || '',
      p_legacy_queue_generation_id: row.legacy_queue_generation_id || '',
      p_semantic_build_stamp: row.semantic_build_stamp
    });
  }

  return { enqueue: enqueue };
})();
