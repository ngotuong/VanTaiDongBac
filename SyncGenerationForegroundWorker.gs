/**
 * D3-D5 narrow Transport foreground worker. D3 compares freshly built read
 * models with the legacy publisher. D4/D5 may atomically publish the same pair,
 * but only when the explicit flag and Spreadsheet allowlist agree.
 */
var SyncGenerationForegroundWorker = (function () {
  var TRANSPORT_INPUT_SHEETS = {
    NL_VanChuyen: true,
    NL_TaiXe: true,
    NL_Dau: true,
    NL_ChamCong: true,
    NL_Phat: true,
    NL_NghiVanHanh: true,
    NL_PhanCongLai: true,
    NL_SoDuLuong: true
  };
  var DASHBOARD_KEY = '__dashboard_latest__';
  var MAX_SCOPE_RANGES = 8;
  var MAX_SCOPE_ROWS = 100;
  var MAX_SCOPE_COLUMNS = 64;

  function run(generation, context) {
    var row = generation || {};
    var ctx = context || defaultContext_();
    var unsupported = validateGeneration_(row);
    if (unsupported) return terminal_(unsupported);

    var workbook = ctx.openWorkbook(String(row.workbook_year || ''));
    if (!workbook || !workbook.spreadsheet || !workbook.spreadsheetId) {
      return retry_('workbook_unavailable', 30);
    }
    var source = readCanonicalScope_(workbook.spreadsheet, row, ctx);
    if (source.terminal) return terminal_(source.reason);
    if (source.retry) return retry_(source.reason, 30);

    var reportMonth = toDisplayMonth_(source.monthKey);
    var versionBefore = String(ctx.getReportDataVersion() || '');
    var freshOptions = {
      skipInvalidation: true,
      suppressRuntimeCacheWrite: true,
      suppressSupabaseWrite: true,
      forceLiveDetails: true,
      dataVersion: versionBefore
    };
    var dashboard;
    var report;
    try {
      dashboard = ctx.getDashboard('', true, freshOptions);
      report = ctx.getReportBundle(reportMonth, true, freshOptions);
    } catch (error) {
      if (/D3 shadow đang chờ/.test(String(error && error.message || error))) {
        return retryWithMetadata_('report_month_not_active', 30, source, reportMonth, versionBefore);
      }
      throw error;
    }
    var versionAfterRead = String(ctx.getReportDataVersion() || '');
    if (versionAfterRead !== versionBefore) {
      return retryWithMetadata_('source_version_changed', 30, source, reportMonth, versionAfterRead);
    }
    if (String(ctx.getReportDataVersion() || '') !== versionAfterRead) {
      return retryWithMetadata_('source_version_changed', 30, source, reportMonth, versionAfterRead);
    }

    if (typeof ctx.isPublishEnabled === 'function' && ctx.isPublishEnabled(workbook.spreadsheetId)) {
      var audience = typeof ctx.getPublicationAudience === 'function'
        ? String(ctx.getPublicationAudience() || '').trim().toLowerCase() : 'preview';
      if (['preview', 'production'].indexOf(audience) === -1) {
        return retryWithMetadata_('publication_audience_invalid', 30, source, reportMonth, versionAfterRead);
      }
      var publishedAt = ctx.nowISOString();
      var cacheVersion = String(ctx.getReportCacheVersion() || '');
      if (!cacheVersion || !versionAfterRead) {
        return retryWithMetadata_('publication_version_missing', 30, source, reportMonth, versionAfterRead);
      }
      var reportRow = ctx.buildReportBundleRow({
        spreadsheetId: workbook.spreadsheetId,
        reportMonth: reportMonth,
        sourceSheetNames: ['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe', 'BC_TongHopDuAn'],
        bundle: report,
        cacheVersion: cacheVersion,
        dataVersion: versionAfterRead,
        syncedAt: publishedAt
      });
      var dashboardRow = ctx.buildReportBundleRow({
        spreadsheetId: workbook.spreadsheetId,
        reportMonth: DASHBOARD_KEY,
        sourceSheetNames: ['BC_TongQuan', 'NL_VanChuyen'],
        bundle: dashboard,
        cacheVersion: cacheVersion,
        dataVersion: versionAfterRead,
        syncedAt: publishedAt
      });
      if (String(ctx.getReportDataVersion() || '') !== versionAfterRead) {
        return retryWithMetadata_('source_version_changed', 30, source, reportMonth, versionAfterRead);
      }
      var publication = ctx.publishPair({
        eventKey: row.event_key,
        leaseToken: row.lease_token,
        workbookYear: String(row.workbook_year || ''),
        spreadsheetId: workbook.spreadsheetId,
        reportMonth: reportMonth,
        generationId: String(row.generation_id || ''),
        sourceDataVersion: versionAfterRead,
        cacheVersion: cacheVersion,
        publishedAt: publishedAt,
        reportRow: reportRow,
        dashboardRow: dashboardRow,
        audience: audience,
        semanticBuildStamp: String(row.semantic_build_stamp || ctx.buildStamp || 'unversioned')
      });
      return {
        action: 'published',
        publication: publication,
        shadowResult: 'published_' + audience,
        shadowMonth: reportMonth,
        sourceReadyAt: publishedAt,
        shadowSourceDataVersion: versionAfterRead,
        shadowSourceHash: source.hash
      };
    }

    var legacyRows = ctx.readLegacyRows(workbook.spreadsheetId, [reportMonth, DASHBOARD_KEY]);
    var legacy = indexLegacyRows_(legacyRows);
    if (!legacy[reportMonth] || !legacy[DASHBOARD_KEY]) {
      return retryWithMetadata_('legacy_bundle_missing', 30, source, reportMonth, versionAfterRead);
    }
    if (!legacyReadyForGeneration_(legacy[reportMonth], legacy[DASHBOARD_KEY], row)) {
      return retryWithMetadata_('legacy_bundle_not_ready', 30, source, reportMonth, versionAfterRead);
    }
    var reportVersion = String(legacy[reportMonth].source_data_version || '');
    var dashboardVersion = String(legacy[DASHBOARD_KEY].source_data_version || '');
    if (!reportVersion || reportVersion !== dashboardVersion || reportVersion !== versionAfterRead) {
      return retryWithMetadata_('legacy_version_not_ready', 30, source, reportMonth, versionAfterRead, reportVersion || dashboardVersion);
    }
    var dashboardHash = ctx.hashPayload(sanitizeDashboard_(dashboard));
    var reportHash = ctx.hashPayload(sanitizeReport_(report));
    var legacyDashboardHash = ctx.hashPayload(sanitizeDashboard_(legacy[DASHBOARD_KEY].payload));
    var legacyReportHash = ctx.hashPayload(sanitizeReport_(legacy[reportMonth].payload));
    var matches = dashboardHash === legacyDashboardHash && reportHash === legacyReportHash;
    return {
      action: 'complete',
      shadowResult: matches ? 'matched' : 'mismatch',
      shadowMatch: matches,
      shadowMonth: reportMonth,
      sourceReadyAt: ctx.nowISOString(),
      shadowSourceDataVersion: versionAfterRead,
      shadowLegacySourceDataVersion: reportVersion,
      shadowSourceHash: source.hash,
      shadowDashboardHash: dashboardHash,
      shadowReportHash: reportHash,
      shadowLegacyDashboardHash: legacyDashboardHash,
      shadowLegacyReportHash: legacyReportHash
    };
  }

  function validateGeneration_(row) {
    if (String(row.module || '') !== 'transport') return 'unsupported_module';
    if (row.structural === true || row.full_refresh === true) return 'unsupported_full_or_structural';
    if (!/^20\d{2}$/.test(String(row.workbook_year || ''))) return 'invalid_workbook_year';
    return '';
  }

  function readCanonicalScope_(spreadsheet, generation, context) {
    var ranges = normalizeRanges_(generation);
    if (!ranges.length || ranges.length > MAX_SCOPE_RANGES) {
      return { terminal: true, reason: 'unsupported_scope' };
    }
    var sheetsByGrid = {};
    (spreadsheet.getSheets() || []).forEach(function (sheet) {
      sheetsByGrid[String(sheet.getSheetId())] = sheet;
    });
    var routedMonths = {};
    (generation.scope_months || []).forEach(function (value) {
      var month = normalizeMonth_(value);
      if (month) routedMonths[month] = true;
    });
    var observedMonths = {};
    var canonical = [];
    for (var index = 0; index < ranges.length; index++) {
      var scope = ranges[index];
      var sheet = sheetsByGrid[String(scope.gridId)];
      if (!sheet || !TRANSPORT_INPUT_SHEETS[String(sheet.getName() || '')]) {
        return { terminal: true, reason: 'unsupported_sheet_scope' };
      }
      if (scope.numRows < 1 || scope.numRows > MAX_SCOPE_ROWS || scope.startRow < 1 ||
          scope.startRow + scope.numRows - 1 > Number(sheet.getMaxRows())) {
        return { terminal: true, reason: 'unsupported_row_scope' };
      }
      var width = Math.min(Math.max(Number(sheet.getLastColumn()) || 1, 1), MAX_SCOPE_COLUMNS);
      var range = sheet.getRange(scope.startRow, 1, scope.numRows, width);
      var raw = range.getValues();
      var display = range.getDisplayValues();
      collectMonths_(raw, display, observedMonths, context);
      canonical.push({
        gridId: scope.gridId,
        sheetName: String(sheet.getName()),
        startRow: scope.startRow,
        numRows: scope.numRows,
        width: width,
        values: display
      });
    }
    var routed = Object.keys(routedMonths);
    var observed = Object.keys(observedMonths);
    if (routed.length > 1 || observed.length > 1) return { terminal: true, reason: 'multi_month_scope' };
    if (routed.length && observed.length && routed[0] !== observed[0]) {
      return { retry: true, reason: 'scope_month_changed' };
    }
    var monthKey = observed[0] || routed[0] || '';
    if (!monthKey) return { retry: true, reason: 'scope_month_unresolved' };
    return {
      hash: context.sha256Hex(context.stableStringify(canonical)),
      monthKey: monthKey
    };
  }

  function normalizeRanges_(generation) {
    var values = Array.isArray(generation.scope_row_ranges) ? generation.scope_row_ranges : [];
    var ranges = values.map(function (value) {
      var match = String(value || '').match(/^(\d+):(\d+):(\d+)$/);
      return match ? { gridId: Number(match[1]), startRow: Number(match[2]), numRows: Number(match[3]) } : null;
    }).filter(function (value) { return value; });
    if (!ranges.length && Array.isArray(generation.scope_grid_ids) && generation.scope_grid_ids.length === 1 &&
        Number(generation.scope_start_row) > 0 && Number(generation.scope_num_rows) > 0) {
      ranges.push({
        gridId: Number(generation.scope_grid_ids[0]),
        startRow: Number(generation.scope_start_row),
        numRows: Number(generation.scope_num_rows)
      });
    }
    return ranges;
  }

  function collectMonths_(rawRows, displayRows, result, context) {
    for (var rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
      for (var columnIndex = 0; columnIndex < Math.min(2, rawRows[rowIndex].length); columnIndex++) {
        var raw = rawRows[rowIndex][columnIndex];
        var month = Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())
          ? context.formatMonth(raw) : normalizeMonth_(displayRows[rowIndex][columnIndex]);
        if (month) result[month] = true;
      }
    }
  }

  function normalizeMonth_(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    var iso = text.match(/^(20\d{2})-(0?[1-9]|1[0-2])(?:-|$)/);
    if (iso) return iso[1] + '-' + ('0' + Number(iso[2])).slice(-2);
    var vnMonth = text.match(/^(0?[1-9]|1[0-2])\/(20\d{2})$/);
    if (vnMonth) return vnMonth[2] + '-' + ('0' + Number(vnMonth[1])).slice(-2);
    var vnDate = text.match(/^\d{1,2}\/(0?[1-9]|1[0-2])\/(20\d{2})$/);
    if (vnDate) return vnDate[2] + '-' + ('0' + Number(vnDate[1])).slice(-2);
    return '';
  }

  function toDisplayMonth_(monthKey) {
    var match = String(monthKey || '').match(/^(20\d{2})-(\d{2})$/);
    return match ? match[2] + '/' + match[1] : '';
  }

  function indexLegacyRows_(rows) {
    var result = {};
    (rows || []).forEach(function (row) {
      if (row && row.report_month) result[String(row.report_month)] = row;
    });
    return result;
  }

  function legacyReadyForGeneration_(reportRow, dashboardRow, generation) {
    var committedAt = new Date(generation.source_committed_at || generation.last_signal_at || 0).getTime();
    if (!isFinite(committedAt) || committedAt <= 0) return false;
    return [reportRow, dashboardRow].every(function (row) {
      var syncedAt = new Date(row && row.synced_at || 0).getTime();
      return isFinite(syncedAt) && syncedAt >= committedAt;
    });
  }

  function sanitizeDashboard_(payload) {
    var value = payload || {};
    return {
      overview: value.overview || {},
      inputs: value.inputs || [],
      latestTrips: value.latestTrips || { date: '', trips: [] },
      links: value.links || {},
      partial: value.partial === true
    };
  }

  function sanitizeReport_(payload) {
    var value = payload || {};
    return {
      overview: value.overview || {},
      payroll: value.payroll || [],
      vehicles: value.vehicles || [],
      projectGroups: value.projectGroups || [],
      projects: value.projects || [],
      links: value.links || {}
    };
  }

  function retry_(reason, seconds) {
    return { action: 'retry', errorClass: reason, retryAfterSeconds: seconds || 30, shadowResult: 'not_ready' };
  }

  function retryWithMetadata_(reason, seconds, source, month, sourceVersion, legacyVersion) {
    var result = retry_(reason, seconds);
    result.shadowMonth = month || '';
    result.shadowSourceDataVersion = sourceVersion || '';
    result.shadowLegacySourceDataVersion = legacyVersion || '';
    result.shadowSourceHash = source && source.hash || '';
    return result;
  }

  function terminal_(reason) {
    return { action: 'retry', terminal: true, errorClass: reason, shadowResult: 'unsupported' };
  }

  function defaultContext_() {
    var properties = PropertiesService.getScriptProperties();
    return {
      openWorkbook: function (year) {
        AppConfig.activate({ year: year });
        var spreadsheetId = String(APP_CONFIG.spreadsheetId || '');
        var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        if (!spreadsheetId || (spreadsheet.getId && String(spreadsheet.getId()) !== spreadsheetId)) {
          throw new Error('D3 shadow workbook identity mismatch.');
        }
        return { spreadsheet: spreadsheet, spreadsheetId: spreadsheetId };
      },
      getReportDataVersion: function () { return ReportService.getReportDataVersion(); },
      getReportCacheVersion: function () { return ReportService.getReportCacheVersion(); },
      getDashboard: function (month, forceRefresh, options) {
        return ReportService.getDashboard(month, forceRefresh, options);
      },
      getReportBundle: function (month, forceRefresh, options) {
        return ReportService.getReportBundle(month, forceRefresh, options);
      },
      readLegacyRows: function (spreadsheetId, months) {
        return SupabaseBundleRepository.readRows('report_bundles', {
          spreadsheet_id: 'eq.' + spreadsheetId,
          report_month: 'in.(' + months.map(CacheAuditService.encodeSupabaseInValue).join(',') + ')',
          select: 'report_month,payload,source_data_version,synced_at,cache_version',
          limit: String(months.length)
        });
      },
      isPublishEnabled: function (spreadsheetId) {
        var enabled = ['1', 'true', 'yes', 'on'].indexOf(String(
          properties.getProperty('SYNC_FOREGROUND_PUBLISH_ENABLED') || ''
        ).trim().toLowerCase()) !== -1;
        if (!enabled) return false;
        var expiresAt = new Date(String(properties.getProperty('SYNC_FOREGROUND_PUBLISH_EXPIRES_AT') || '')).getTime();
        if (!isFinite(expiresAt) || expiresAt <= new Date().getTime()) return false;
        var allowed = String(properties.getProperty('SYNC_FOREGROUND_PUBLISH_SPREADSHEET_IDS') || '')
          .split(',').map(function (value) { return value.trim(); }).filter(function (value) { return value; });
        return allowed.indexOf(String(spreadsheetId || '')) !== -1;
      },
      getPublicationAudience: function () {
        return String(properties.getProperty('SYNC_FOREGROUND_PUBLICATION_AUDIENCE') || 'preview')
          .trim().toLowerCase();
      },
      buildReportBundleRow: function (options) {
        return SupabaseReportCacheRepository.buildBundleRow(options);
      },
      publishPair: function (input) { return SupabaseSyncGenerationRepository.publishPair(input); },
      buildStamp: String(typeof RUNTIME_BUILD_STAMP !== 'undefined' ? RUNTIME_BUILD_STAMP : 'unversioned-local'),
      hashPayload: CacheAuditService.hashPayload,
      stableStringify: CacheAuditService.stableStringify,
      sha256Hex: sha256Hex_,
      formatMonth: function (date) { return Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM'); },
      nowISOString: function () { return new Date().toISOString(); }
    };
  }

  function sha256Hex_(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
      .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  return {
    run: run,
    normalizeMonth: normalizeMonth_,
    sanitizeDashboard: sanitizeDashboard_,
    sanitizeReport: sanitizeReport_
  };
})();
