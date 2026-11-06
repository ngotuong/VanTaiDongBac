/**
 * D2 producer shadow. It mirrors accepted legacy queue metadata into the
 * server-only generation outbox. It never publishes cache or reads e.value.
 */
var SyncGenerationShadowService = (function () {
  var ENABLED_PROPERTY = 'SYNC_GENERATION_SHADOW_ENABLED';

  function record(input, context) {
    var options = input || {};
    var ctx = context || defaultContext_();
    if (!ctx.isEnabled()) return { ok: true, enabled: false, recorded: false };

    var generationId = clean_(options.generationId || options.legacyQueueGenerationId).slice(0, 180);
    if (!generationId) return { ok: true, enabled: true, recorded: false, reason: 'missing_generation_id' };

    var year = clean_(options.workbookYear);
    if (!/^20\d{2}$/.test(year)) throw new Error('Generation shadow workbook year không hợp lệ.');
    var moduleName = /^(transport|fund)$/.test(String(options.module || '')) ? String(options.module) : '';
    if (!moduleName) throw new Error('Generation shadow module không hợp lệ.');

    var signalAt = normalizeDate_(options.lastSignalAt || options.sourceCommittedAt, ctx.nowISOString());
    var notBefore = normalizeDate_(options.notBefore, signalAt);
    var sourceType = clean_(options.sourceType || 'unknown').slice(0, 180) || 'unknown';
    var queueName = clean_(options.queueName || moduleName).slice(0, 80) || moduleName;
    var sheets = uniqueStrings_(options.sheetNames, 100, 180);
    var gridIds = uniqueNumbers_(options.gridIds, 100);
    var rowRanges = uniqueStrings_(options.rowRanges, 100, 80).filter(function (range) {
      return /^\d+:\d+:\d+$/.test(range);
    });
    var months = uniqueStrings_(options.months, 24, 7).filter(function (month) { return /^20\d{2}-\d{2}$/.test(month); });
    var startRow = positiveInteger_(options.startRow);
    var numRows = positiveInteger_(options.numRows);
    if (!startRow || !numRows) { startRow = null; numRows = null; }

    var canonical = {
      generationId: generationId,
      workbookYear: year,
      module: moduleName,
      queueName: queueName,
      sourceType: sourceType,
      sheetNames: sheets,
      gridIds: gridIds,
      rowRanges: rowRanges,
      months: months,
      startRow: startRow,
      numRows: numRows,
      structural: options.structural === true,
      fullRefresh: options.fullRefresh === true
    };
    var row = {
      event_key: 'sg_' + ctx.sha256(JSON.stringify(canonical)).slice(0, 64),
      generation_id: generationId,
      workbook_year: year,
      module: moduleName,
      queue_name: queueName,
      source_type: sourceType,
      scope_sheet_names: sheets,
      scope_grid_ids: gridIds,
      scope_row_ranges: rowRanges,
      scope_months: months,
      scope_start_row: startRow,
      scope_num_rows: numRows,
      structural: canonical.structural,
      full_refresh: canonical.fullRefresh,
      source_committed_at: options.sourceCommittedAt ? normalizeDate_(options.sourceCommittedAt, signalAt) : signalAt,
      last_signal_at: signalAt,
      not_before: notBefore,
      source_data_version: clean_(options.sourceDataVersion).slice(0, 180),
      legacy_queue_generation_id: clean_(options.legacyQueueGenerationId || generationId).slice(0, 180),
      semantic_build_stamp: clean_(options.semanticBuildStamp || 'unversioned-local').slice(0, 120) || 'unversioned-local'
    };
    ctx.repository.enqueue(row);
    return { ok: true, enabled: true, recorded: true, eventKey: row.event_key, row: row };
  }

  function defaultContext_() {
    return {
      isEnabled: function () {
        var value = PropertiesService.getScriptProperties().getProperty(ENABLED_PROPERTY);
        return ['1', 'true', 'yes', 'on'].indexOf(String(value || '').trim().toLowerCase()) !== -1;
      },
      repository: SupabaseSyncGenerationRepository,
      nowISOString: function () { return new Date().toISOString(); },
      sha256: sha256Hex_
    };
  }

  function sha256Hex_(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8).map(function (byte) {
      var unsigned = byte < 0 ? byte + 256 : byte;
      return ('0' + unsigned.toString(16)).slice(-2);
    }).join('');
  }

  function normalizeDate_(value, fallback) {
    var date = new Date(value || fallback);
    if (!isFinite(date.getTime())) date = new Date(fallback);
    return date.toISOString();
  }

  function uniqueStrings_(values, maxItems, maxLength) {
    var seen = {};
    return (Array.isArray(values) ? values : []).map(function (value) {
      return clean_(value).slice(0, maxLength);
    }).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    }).sort().slice(0, maxItems);
  }

  function uniqueNumbers_(values, maxItems) {
    var seen = {};
    return (Array.isArray(values) ? values : []).map(function (value) { return Number(value); }).filter(function (value) {
      if (!isFinite(value) || value < 0 || Math.floor(value) !== value || seen[String(value)]) return false;
      seen[String(value)] = true;
      return true;
    }).sort(function (left, right) { return left - right; }).slice(0, maxItems);
  }

  function positiveInteger_(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 && Math.floor(number) === number ? number : null;
  }

  function clean_(value) { return String(value === null || value === undefined ? '' : value).trim(); }

  return { record: record };
})();
