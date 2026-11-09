/** Server-only RPC adapter for D3 shadow and D4 atomic Preview publication. */
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

  function requestDispatch(eventKey, semanticBuildStamp) {
    return first_(SupabaseHttpClient.callRpc('request_sync_generation_dispatch', {
      p_event_key: eventKey,
      p_semantic_build_stamp: semanticBuildStamp || 'unversioned'
    }));
  }

  function claimOne(eventKey, workerId, staleSeconds, leaseSeconds) {
    return first_(SupabaseHttpClient.callRpc('claim_sync_generation', {
      p_event_key: eventKey,
      p_worker_id: workerId,
      p_stale_seconds: staleSeconds || 120,
      p_lease_seconds: leaseSeconds || 120
    }));
  }

  function claimBatch(limit, workerId, staleSeconds, leaseSeconds) {
    var rows = SupabaseHttpClient.callRpc('claim_sync_generations', {
      p_limit: limit || 1,
      p_worker_id: workerId,
      p_stale_seconds: staleSeconds || 120,
      p_lease_seconds: leaseSeconds || 120
    });
    return Array.isArray(rows) ? rows : (rows ? [rows] : []);
  }

  function completeShadow(input) {
    return first_(SupabaseHttpClient.callRpc('complete_sync_generation_shadow', metadataPayload_(input, {
      p_event_key: input.eventKey,
      p_lease_token: input.leaseToken,
      p_shadow_match: input.shadowMatch === true,
      p_source_ready_at: input.sourceReadyAt || null
    })));
  }

  function retryShadow(input) {
    return first_(SupabaseHttpClient.callRpc('retry_sync_generation_shadow', metadataPayload_(input, {
      p_event_key: input.eventKey,
      p_lease_token: input.leaseToken,
      p_error_class: input.errorClass || 'retryable',
      p_next_attempt_at: input.nextAttemptAt || new Date().toISOString(),
      p_terminal: input.terminal === true
    })));
  }

  function publishPair(input) {
    return first_(SupabaseHttpClient.callRpc('publish_sync_generation_pair', {
      p_event_key: input.eventKey,
      p_lease_token: input.leaseToken,
      p_workbook_year: input.workbookYear,
      p_spreadsheet_id: input.spreadsheetId,
      p_report_month: input.reportMonth,
      p_generation_id: input.generationId,
      p_source_data_version: input.sourceDataVersion,
      p_cache_version: input.cacheVersion,
      p_published_at: input.publishedAt,
      p_report_source_sheet_names: input.reportRow.source_sheet_names || [],
      p_report_payload: input.reportRow.payload,
      p_report_details_hash: input.reportRow.details_hash,
      p_dashboard_source_sheet_names: input.dashboardRow.source_sheet_names || [],
      p_dashboard_payload: input.dashboardRow.payload,
      p_dashboard_details_hash: input.dashboardRow.details_hash,
      p_semantic_build_stamp: input.semanticBuildStamp || 'unversioned',
      p_audience: 'preview'
    }));
  }

  function findByEventKey(eventKey) {
    return first_(SupabaseBundleRepository.readRows('sync_generations', {
      event_key: 'eq.' + eventKey,
      select: 'event_key,status,generation_id,source_data_version,dashboard_cache_key,dashboard_published_at,report_cache_key,report_published_at',
      limit: '1'
    }));
  }

  function metadataPayload_(input, base) {
    var payload = base || {};
    payload.p_shadow_result = input.shadowResult || '';
    payload.p_shadow_month = input.shadowMonth || '';
    payload.p_shadow_source_data_version = input.shadowSourceDataVersion || '';
    payload.p_shadow_legacy_source_data_version = input.shadowLegacySourceDataVersion || '';
    payload.p_shadow_source_hash = input.shadowSourceHash || '';
    payload.p_shadow_dashboard_hash = input.shadowDashboardHash || '';
    payload.p_shadow_report_hash = input.shadowReportHash || '';
    payload.p_shadow_legacy_dashboard_hash = input.shadowLegacyDashboardHash || '';
    payload.p_shadow_legacy_report_hash = input.shadowLegacyReportHash || '';
    return payload;
  }

  function first_(value) {
    if (Array.isArray(value)) return value.length ? value[0] : null;
    return value || null;
  }

  return {
    enqueue: enqueue,
    requestDispatch: requestDispatch,
    claimOne: claimOne,
    claimBatch: claimBatch,
    completeShadow: completeShadow,
    retryShadow: retryShadow,
    publishPair: publishPair,
    findByEventKey: findByEventKey
  };
})();
