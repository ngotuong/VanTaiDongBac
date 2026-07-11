var SheetService = (function () {
  var CACHE_VERSION = 'v13';
  var CATALOG_TTL_SECONDS = 21600;
  var REPORT_TTL_SECONDS = 600;
  var REPORT_CACHE_SHEET_NAME = 'SYS_ReportCache';
  var REPORT_DATA_VERSION_PROP = 'REPORT_DATA_VERSION_V1';

  function getBootstrap() {
    return {
      today: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'yyyy-MM-dd'),
      formTypes: Object.keys(APP_CONFIG.sheets),
      reports: emptyReports_(),
      links: reportLinks_(),
      cacheVersion: CACHE_VERSION
    };
  }

  function health() {
    return {
      ok: true,
      spreadsheetId: APP_CONFIG.spreadsheetId,
      cacheVersion: CACHE_VERSION,
      checkedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm:ss')
    };
  }

  function getStartupData(formType) {
    var data = getBootstrap();
    var selectedFormType = formType || data.formTypes[0] || '';
    var ss = getSpreadsheet_();
    data.catalogs = getCatalogs(selectedFormType);
    data.catalogFormType = selectedFormType;
    data.dashboard = getStartupDashboard_(ss);
    data.reports = Object.assign({}, data.reports, data.dashboard, { loading: false });
    return data;
  }

  function getStartupDashboard_(ss) {
    return {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewDashboard_(ss),
      inputs: [],
      latestTrips: { date: '', trips: [] },
      links: reportLinks_(ss),
      cached: false,
      partial: true
    };
  }

  function getInitialData() {
    var data = getBootstrap();
    data.catalogs = getCatalogs();
    return data;
  }

  function getCatalogs(formType) {
    var key = cacheKey_('catalogs', formType || 'all');
    var cached = getChunkedCache_(key);
    if (cached) return cached;
    var catalogs = CatalogService.readCatalogs(getSpreadsheet_(), formType);
    putChunkedCache_(key, catalogs, CATALOG_TTL_SECONDS);
    return catalogs;
  }

  function getDashboard(month, forceRefresh) {
    var monthKey = normalizeMonthKey_(month) || 'latest';
    var key = cacheKey_('dashboard', monthKey);
    if (forceRefresh) invalidateRuntimeCaches_();
    if (!forceRefresh) {
      var cached = getChunkedCache_(key);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var dashboard = {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewDashboard_(ss),
      inputs: [],
      latestTrips: readLatestTrips_(ss),
      links: reportLinks_(ss),
      cached: false
    };
    putChunkedCache_(key, dashboard, REPORT_TTL_SECONDS);
    return dashboard;
  }

  function getReports(forceRefresh) {
    var cacheKey = cacheKey_('reports', 'all');
    if (forceRefresh) invalidateRuntimeCaches_();
    if (!forceRefresh) {
      var cached = getChunkedCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var reportTables = readReportTables_(ss, forceRefresh);
    var reports = {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewReport_(ss),
      payroll: reportTables.payroll,
      vehicles: reportTables.vehicles,
      inputs: readInputStats_(ss),
      latestTrips: readLatestTrips_(ss),
      links: reportLinks_(ss),
      cached: false
    };
    putChunkedCache_(cacheKey, reports, REPORT_TTL_SECONDS);
    return reports;
  }

  function getReport(type, month, forceRefresh) {
    var reportType = type || 'overview';
    var monthKey = normalizeMonthKey_(month) || 'all';
    var cacheKey = cacheKey_('report', reportType, monthKey);
    if (forceRefresh) invalidateRuntimeCaches_();
    if (!forceRefresh) {
      var cached = getChunkedCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var report;
    if (reportType === 'overview') {
      report = {
        type: reportType,
        updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
        data: readOverviewReport_(ss),
        links: reportLinks_(ss)
      };
    } else if (reportType === 'payroll') {
      var payrollTables = readReportTables_(ss, forceRefresh);
      report = {
        type: reportType,
        updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
        data: filterDisplayTableByMonth_(payrollTables.payroll, month),
        links: reportLinks_(ss)
      };
    } else if (reportType === 'vehicles') {
      var vehicleTables = readReportTables_(ss, forceRefresh);
      report = {
        type: reportType,
        updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
        data: filterDisplayTableByMonth_(vehicleTables.vehicles, month),
        links: reportLinks_(ss)
      };
    } else {
      throw new Error('Loai bao cao khong hop le: ' + reportType);
    }
    putChunkedCache_(cacheKey, report, REPORT_TTL_SECONDS);
    return report;
  }

  function getReportBundle(month, forceRefresh) {
    var monthKey = normalizeMonthKey_(month) || 'all';
    var cacheKey = cacheKey_('report_bundle', monthKey);
    if (forceRefresh) invalidateRuntimeCaches_();
    if (!forceRefresh) {
      var cached = getChunkedCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var reportTables = readReportTables_(ss, forceRefresh);
    var bundle = {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewReport_(ss, month),
      payroll: filterDisplayTableByMonth_(reportTables.payroll, month),
      vehicles: filterDisplayTableByMonth_(reportTables.vehicles, month),
      links: reportLinks_(ss)
    };
    putChunkedCache_(cacheKey, bundle, REPORT_TTL_SECONDS);
    return bundle;
  }

  function emptyReports_() {
    return {
      updatedAt: '',
      overview: { months: [], details: [] },
      payroll: [],
      vehicles: [],
      inputs: [],
      latestTrips: { date: '', trips: [] },
      links: reportLinks_(),
      loading: true,
      reportsLoaded: false
    };
  }

  function reportLinks_(ss) {
    var base = 'https://docs.google.com/spreadsheets/d/' + APP_CONFIG.spreadsheetId + '/edit';
    return {
      spreadsheet: base,
      overview: sheetLink_(base, ss, 'BC_TongQuan'),
      payroll: sheetLink_(base, ss, 'BC_BangLuong'),
      vehicles: sheetLink_(base, ss, 'BC_TongHopXe')
    };
  }

  function sheetLink_(base, ss, sheetName) {
    if (!ss) return base;
    var sheet = ss.getSheetByName(sheetName);
    return sheet ? base + '#gid=' + sheet.getSheetId() : base;
  }

  function submitRows(formType, rows, writeContext) {
    return EntryService.submitRowsWithContext(formType, rows, writeContext, {
      sheets: APP_CONFIG.sheets,
      getSpreadsheet: getSpreadsheet_,
      getCatalogs: getCatalogs,
      getAppendRow: getAppendRow_,
      ensureRows: ensureRows_,
      writeRows: writeRowsPreservingSheetState_,
      clearAfterSubmitCache: clearAfterSubmitCache_
    });
  }

  function checkTripReconciliation(rows) {
    return TransportReconciliationService.checkTripReconciliation(rows);
  }

  function getSpreadsheet_() {
    return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  }

  function readOverviewReport_(ss, month) {
    var sheet = ss.getSheetByName('BC_TongQuan');
    if (!sheet) return { months: [], details: [] };

    var months = readOverviewMonths_(sheet);
    var details = readOverviewDetailsWithCache_(ss, sheet, months, month);
    return { months: months, details: details, kpis: readOverviewKpis_(ss, sheet, months) };
  }

  function readOverviewDashboard_(ss) {
    var sheet = ss.getSheetByName('BC_TongQuan');
    if (!sheet) return { months: [], details: [] };
    var months = readOverviewMonths_(sheet);
    return { months: months, details: [], kpis: readOverviewKpis_(ss, sheet, months) };
  }

  function readOverviewMonths_(sheet) {
    var rowCount = Math.min(sheet.getLastRow(), 24);
    if (rowCount < 1) return [];
    var lastColumn = sheet.getLastColumn();
    var numColumns = Math.max(11, lastColumn - 7 + 1);
    return sheet.getRange(1, 7, rowCount, numColumns).getDisplayValues()
      .filter(function (row, index) {
        return index === 0 || row.some(function (cell) { return clean_(cell); });
      });
  }

  function getActiveReportMonths_(months) {
    var activeMonths = [];
    if (months && months.length > 1) {
      for (var i = 1; i < months.length; i++) {
        var mName = clean_(months[i][0]);
        if (mName && mName !== 'Tháng') activeMonths.push(mName);
      }
    }
    return activeMonths;
  }

  function resolveReportMonth_(months, month) {
    var targetMonth = clean_(month);
    if (!targetMonth || targetMonth === 'latest' || targetMonth === 'all') {
      var activeMonths = getActiveReportMonths_(months);
      targetMonth = activeMonths.length ? activeMonths[activeMonths.length - 1] : '';
    }
    return targetMonth;
  }

  function readOverviewDetailsWithCache_(ss, sheet, months, month) {
    var activeMonths = getActiveReportMonths_(months);
    if (month === 'Tất cả') {
      if (!activeMonths.length) return readCurrentOverviewDetails_(sheet);
      return readAggregatedOverviewDetails_(ss, sheet, activeMonths);
    }

    var targetMonth = resolveReportMonth_(months, month);
    if (!targetMonth || targetMonth === 'Tháng') return readCurrentOverviewDetails_(sheet);

    var dataVersion = getReportDataVersion_();
    var cached = readReportDetailsCacheMap_(ss, dataVersion);
    var monthKey = normalizeDisplayMonth_(targetMonth) || normalizeMonthKey_(targetMonth);
    if (cached[monthKey]) return cached[monthKey];

    var computed = computeAndCacheOverviewDetails_(ss, sheet, [targetMonth], dataVersion);
    return computed[monthKey] || readCurrentOverviewDetails_(sheet);
  }

  function readOverviewKpis_(ss, sheet, months) {
    var activeMonths = getActiveReportMonths_(months);
    if (!activeMonths.length) return [];
    return readOverviewKpisFromMonthTable_(months);
  }

  function readOverviewKpisFromMonthTable_(months) {
    if (!months || !months.length) return [];
    var headerIndex = -1;
    for (var i = 0; i < months.length; i++) {
      if (normalizeText_(months[i] && months[i][0]) === 'thang') {
        headerIndex = i;
        break;
      }
    }
    var headers = (months[headerIndex >= 0 ? headerIndex : 0] || []).map(function (header) {
      return normalizeText_(header);
    });
    var dataRows = headerIndex >= 0 ? months.slice(headerIndex + 1) : months.slice(1);

    function colIndex(names, fallback) {
      for (var col = 0; col < headers.length; col++) {
        var header = headers[col];
        for (var idx = 0; idx < names.length; idx++) {
          if (header.indexOf(normalizeText_(names[idx])) !== -1) return col;
        }
      }
      return fallback;
    }

    var monthCol = colIndex(['tháng'], 0);
    var revenueCol = colIndex(['doanh thu'], 2);
    var taxTndnCol = colIndex(['thuế tndn', 'tndn'], 3);
    var taxVatCol = colIndex(['thuế vat', 'vat'], 4);
    var fuelQmCol = colIndex(['dầu qm', 'quang minh'], 5);
    var fuelOutCol = colIndex(['dầu ngoài', 'đổ ngoài'], 6);
    var tollCol = colIndex(['cầu đường', 'phí cầu đường'], 7);
    var grossCol = colIndex(['lợi nhuận gộp'], 8);
    var payrollCol = colIndex(['chi phí lương', 'tổng lương'], -1);
    var fundCol = colIndex(['chi quỹ thực tế', 'chi quỹ', 'quỹ'], 9);
    var finalCol = colIndex(['lợi nhuận thực tế', 'lợi nhuận thực nhận', 'lợi nhuận thực'], 10);

    return dataRows.map(function (row) {
      var month = clean_(row && row[monthCol]);
      if (!month || month === 'Tháng') return null;
      var revenue = parseNumberLoose_(row[revenueCol]);
      var taxTndn = parseNumberLoose_(row[taxTndnCol]);
      var taxVat = parseNumberLoose_(row[taxVatCol]);
      var fuelQm = parseNumberLoose_(row[fuelQmCol]);
      var fuelOut = parseNumberLoose_(row[fuelOutCol]);
      var toll = parseNumberLoose_(row[tollCol]);
      var fund = parseNumberLoose_(row[fundCol]);
      var finalProfit = parseNumberLoose_(row[finalCol]);
      var calculatedGross = revenue - taxTndn - taxVat - fuelQm - toll;
      var gross = grossCol >= 0 ? parseNumberLoose_(row[grossCol]) : calculatedGross;
      var operatingCost = revenue - gross;
      var cashCost = gross - finalProfit;
      var payroll = payrollCol >= 0 ? parseNumberLoose_(row[payrollCol]) : cashCost - fuelOut - fund;
      return {
        month: month,
        monthKey: normalizeDisplayMonth_(month) || normalizeMonthKey_(month),
        revenue: revenue,
        taxTndn: taxTndn,
        taxVat: taxVat,
        fuelQm: fuelQm,
        toll: toll,
        gross: gross,
        operatingCost: operatingCost,
        final: finalProfit,
        cashCost: cashCost,
        fuelOut: fuelOut,
        payroll: payroll,
        fund: fund,
        totalCost: operatingCost + cashCost
      };
    }).filter(function (item) { return item; });
  }

  function parseOverviewKpiDetails_(details) {
    var rows = details || [];
    var gross = readDetailNumber_(rows, 'Lợi nhuận gộp');
    var outsideFuel = readDetailNumber_(rows, 'Chi phí dầu', 'đổ ngoài');
    var payroll = readDetailNumber_(rows, 'Chi phí lương');
    var fund = readDetailNumber_(rows, 'Chi quỹ thực tế');
    var finalProfit = readDetailNumber_(rows, 'Lợi nhuận thực');
    if (!finalProfit && hasDetailFormulaError_(rows, 'Lợi nhuận thực')) {
      finalProfit = gross - outsideFuel - payroll - fund;
    }
    var cashCost = gross - finalProfit;
    return {
      gross: gross,
      final: finalProfit,
      cashCost: cashCost,
      fuelOut: outsideFuel,
      payroll: payroll,
      fund: fund,
      totalCost: cashCost
    };
  }

  function readDetailNumber_(rows, label, explanationContains) {
    var normalizedLabel = normalizeText_(label);
    var normalizedExplanation = normalizeText_(explanationContains || '');
    var fallback = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      if (normalizeText_(row[0]) !== normalizedLabel) continue;
      if (!normalizedExplanation || normalizeText_(row[4]).indexOf(normalizedExplanation) !== -1) {
        return parseNumberLoose_(row[1]);
      }
      if (fallback === null) fallback = parseNumberLoose_(row[1]);
    }
    return fallback === null ? 0 : fallback;
  }

  function hasDetailFormulaError_(rows, label) {
    var normalizedLabel = normalizeText_(label);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      if (normalizeText_(row[0]) !== normalizedLabel) continue;
      return /^#/.test(clean_(row[1]));
    }
    return false;
  }

  function readAggregatedOverviewDetails_(ss, sheet, activeMonths) {
    var dataVersion = getReportDataVersion_();
    var cached = readReportDetailsCacheMap_(ss, dataVersion);
    var missing = activeMonths.filter(function (month) {
      var key = normalizeDisplayMonth_(month) || normalizeMonthKey_(month);
      return !cached[key];
    });
    if (missing.length) {
      var computed = computeAndCacheOverviewDetails_(ss, sheet, missing, dataVersion);
      Object.keys(computed).forEach(function (key) {
        cached[key] = computed[key];
      });
    }

    var matrices = activeMonths.map(function (month) {
      var key = normalizeDisplayMonth_(month) || normalizeMonthKey_(month);
      return cached[key];
    }).filter(function (matrix) {
      return matrix && matrix.length;
    });
    if (!matrices.length) return readCurrentOverviewDetails_(sheet);
    return aggregateOverviewDetailMatrices_(matrices);
  }

  function readCurrentOverviewDetails_(sheet) {
    var rowCount = Math.min(Math.max(sheet.getLastRow() - 3, 1), 14);
    return sheet.getRange(4, 1, rowCount, 5).getDisplayValues()
      .filter(function (row) {
        return row.some(function (cell) { return clean_(cell); });
      });
  }

  function aggregateOverviewDetailMatrices_(matrices) {
    var base = matrices[0] || [];
    var result = [];
    if (base.length) result.push(base[0]);

    var totals = [];
    matrices.forEach(function (matrix) {
      for (var r = 1; r < matrix.length; r++) {
        var row = matrix[r];
        var category = clean_(row[0]);
        if (!category) continue;
        if (!totals[r]) {
          totals[r] = {
            category: category,
            colB: 0,
            colC: 0,
            colD: 0,
            colE: clean_(row[4]),
            template: row
          };
        }
        if (totals[r].category === category) {
          totals[r].colB += parseNumberLoose_(row[1]) || 0;
          totals[r].colC += parseNumberLoose_(row[2]) || 0;
          totals[r].colD += parseNumberLoose_(row[3]) || 0;
        }
      }
    });

    for (var i = 1; i < totals.length; i++) {
      var item = totals[i];
      if (!item) continue;
      result.push([
        item.category,
        formatAggregateDetailCell_(item.colB, item.template[1]),
        formatAggregateDetailCell_(item.colC, item.template[2]),
        formatAggregateDetailCell_(item.colD, item.template[3]),
        item.colE
      ]);
    }
    return result;
  }

  function formatAggregateDetailCell_(value, template) {
    var text = clean_(template);
    if (text.indexOf('₫') !== -1 || text.indexOf('đ') !== -1) {
      return Math.round(value).toLocaleString('vi-VN') + ' ₫';
    }
    return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  }

  function computeAndCacheOverviewDetails_(ss, sheet, months, dataVersion) {
    var detailsByMonth = {};
    var lock = LockService.getScriptLock();
    var locked = false;
    var tempSheet = null;
    try {
      lock.waitLock(15000);
      locked = true;
      cleanupOverviewTempSheets_(ss);
      tempSheet = sheet.copyTo(ss);
      tempSheet.setName('_TMP_BC_TongQuan_' + Utilities.getUuid().slice(0, 8));
      tempSheet.hideSheet();

      months.forEach(function (month) {
        var monthLabel = clean_(month);
        if (!monthLabel) return;
        var dateValue = parseMonthLabelToDate_(monthLabel);
        tempSheet.getRange('B1').setValue(dateValue);
        SpreadsheetApp.flush();
        var monthKey = normalizeDisplayMonth_(monthLabel) || normalizeMonthKey_(monthLabel);
        detailsByMonth[monthKey] = readCurrentOverviewDetails_(tempSheet);
      });
    } catch (e) {
      console.error('Lỗi tính toán/cache báo cáo chi tiết trên sheet tạm:', e);
    } finally {
      if (tempSheet) {
        try {
          ss.deleteSheet(tempSheet);
        } catch (deleteErr) {
          console.error('Không xóa được sheet tạm báo cáo:', deleteErr);
        }
      }
      if (locked) lock.releaseLock();
    }

    writeReportDetailsCache_(ss, dataVersion, detailsByMonth);
    return detailsByMonth;
  }

  function cleanupOverviewTempSheets_(ss) {
    ss.getSheets().forEach(function (candidate) {
      if (isOverviewTempSheet_(candidate.getName())) {
        ss.deleteSheet(candidate);
      }
    });
  }

  function isOverviewTempSheet_(sheetName) {
    var name = clean_(sheetName);
    return name.indexOf('_TMP_BC_TongQuan_') === 0
      || /^Bản sao của BC_TongQuan(?: \d+)?$/.test(name)
      || /^Copy of BC_TongQuan(?: \d+)?$/.test(name);
  }

  function cleanupOverviewTempSheets() {
    var ss = getSpreadsheet_();
    var deleted = [];
    ss.getSheets().forEach(function (candidate) {
      if (!isOverviewTempSheet_(candidate.getName())) return;
      deleted.push(candidate.getName());
      ss.deleteSheet(candidate);
    });
    return {
      ok: true,
      deleted: deleted,
      count: deleted.length
    };
  }

  function parseMonthLabelToDate_(monthLabel) {
    var cleanLabel = String(monthLabel).trim();
    if (!cleanLabel) return null;
    var match1 = cleanLabel.match(/^(\d{1,2})\/(\d{4})$/);
    if (match1) {
      return new Date(Number(match1[2]), Number(match1[1]) - 1, 1);
    }
    var match2 = cleanLabel.match(/^(\d{4})-(\d{1,2})$/);
    if (match2) {
      return new Date(Number(match2[1]), Number(match2[2]) - 1, 1);
    }
    var parsed = ValidationService.parseDate(cleanLabel);
    if (parsed) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
    return monthLabel;
  }

  function getReportDataVersion_() {
    var baseVersion = PropertiesService.getScriptProperties().getProperty(REPORT_DATA_VERSION_PROP) || '0';
    return baseVersion;
  }

  function bumpReportDataVersion_() {
    PropertiesService.getScriptProperties().setProperty(REPORT_DATA_VERSION_PROP, String(new Date().getTime()));
  }

  function getReportCacheSheet_(ss, createIfMissing) {
    var sheet = ss.getSheetByName(REPORT_CACHE_SHEET_NAME);
    if (!sheet && createIfMissing) {
      sheet = ss.insertSheet(REPORT_CACHE_SHEET_NAME);
      sheet.hideSheet();
      sheet.getRange(1, 1, 1, 10).setValues([[
        'cacheVersion', 'dataVersion', 'monthKey', 'monthLabel', 'rowOrder',
        'colA', 'colB', 'colC', 'colD', 'colE'
      ]]);
    }
    return sheet;
  }

  function readReportDetailsCacheMap_(ss, dataVersion) {
    var sheet = getReportCacheSheet_(ss, false);
    var map = {};
    if (!sheet || sheet.getLastRow() < 2) return map;

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    rows.forEach(function (row) {
      if (clean_(row[0]) !== CACHE_VERSION || clean_(row[1]) !== dataVersion) return;
      var monthKey = clean_(row[2]);
      var rowOrder = Number(row[4]);
      if (!monthKey || !rowOrder) return;
      if (!map[monthKey]) map[monthKey] = [];
      map[monthKey][rowOrder - 1] = [row[5], row[6], row[7], row[8], row[9]];
    });

    Object.keys(map).forEach(function (key) {
      map[key] = map[key].filter(function (row) { return row && row.length; });
    });
    return map;
  }

  function writeReportDetailsCache_(ss, dataVersion, detailsByMonth) {
    var rows = [];
    Object.keys(detailsByMonth).forEach(function (monthKey) {
      var matrix = detailsByMonth[monthKey] || [];
      matrix.forEach(function (row, index) {
        rows.push([
          CACHE_VERSION,
          dataVersion,
          monthKey,
          monthKey,
          index + 1,
          row[0] || '',
          row[1] || '',
          row[2] || '',
          row[3] || '',
          row[4] || ''
        ]);
      });
    });
    if (!rows.length) return;

    var sheet = getReportCacheSheet_(ss, true);
    var appendRow = sheet.getLastRow() + 1;
    sheet.getRange(appendRow, 1, rows.length, 10).setValues(rows);
  }

  function readInputStats_(ss) {
    var configs = [
      { type: 'vanChuyen', label: 'Vận chuyển', sheet: 'NL_VanChuyen', headerRow: 2 },
      { type: 'taiXe', label: 'Tài xế', sheet: 'NL_TaiXe', headerRow: 1 },
      { type: 'dau', label: 'Dầu', sheet: 'NL_Dau', headerRow: 2 },
      { type: 'chamCong', label: 'Chấm công', sheet: 'NL_ChamCong', headerRow: 1 },
      { type: 'phat', label: 'Phạt', sheet: 'NL_Phat', headerRow: 1 },
      { type: 'nghiVanHanh', label: 'Nghỉ vận hành', sheet: 'NL_NghiVanHanh', headerRow: 1 }
    ];
    return configs.map(function (cfg) {
      var sheet = ss.getSheetByName(cfg.sheet);
      if (!sheet) return { type: cfg.type, label: cfg.label, sheet: cfg.sheet, rows: 0, latestDate: '', latestText: '' };
      var lastDataRow = getLastNonEmptyRowInColumn_(sheet, 1, cfg.headerRow + 1, true);
      var maxRows = Math.max(lastDataRow - cfg.headerRow, 0);
      if (!maxRows) return { type: cfg.type, label: cfg.label, sheet: cfg.sheet, rows: 0, latestDate: '', latestText: 'Chưa có' };
      var sampleRows = Math.min(maxRows, 500);
      var startRow = lastDataRow - sampleRows + 1;
      var dates = sheet.getRange(startRow, 1, sampleRows, 1).getValues();
      var latest = null;
      dates.forEach(function (row) {
        var value = row[0];
        if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
          if (!latest || value.getTime() > latest.getTime()) latest = value;
        }
      });
      var latestText = latest ? Utilities.formatDate(latest, APP_CONFIG.timezone, 'dd/MM/yyyy') : '';
      return { type: cfg.type, label: cfg.label, sheet: cfg.sheet, rows: maxRows, latestDate: latestText, latestText: latestText || 'Chưa có' };
    });
  }

  function readTable_(ss, sheetName, startRow, startColumn, numRows, numColumns) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var safeRows = Math.min(numRows, Math.max(sheet.getLastRow() - startRow + 1, 1));
    return sheet.getRange(startRow, startColumn, safeRows, numColumns).getDisplayValues()
      .filter(function (row, index) {
        return index === 0 || row.some(function (cell) { return clean_(cell); });
      });
  }

  function readReportTables_(ss, forceRefresh) {
    var cacheKey = cacheKey_('report_tables', 'all');
    if (!forceRefresh) {
      var cached = getChunkedCache_(cacheKey);
      if (cached) return cached;
    }
    var tables = {
      payroll: readTable_(ss, 'BC_BangLuong', 2, 1, 200, 16),
      vehicles: readTable_(ss, 'BC_TongHopXe', 2, 1, 200, 12)
    };
    putChunkedCache_(cacheKey, tables, REPORT_TTL_SECONDS);
    return tables;
  }

  function getAppendRow_(sheet, headerRow) {
    return getLastNonEmptyRowInColumn_(sheet, 1, headerRow + 1, false) + 1;
  }

  function writeRowSkippingColumns_(sheet, rowNum, values, skippedColumns) {
    return SheetWritePreserver.writeRowSkippingColumns(sheet, rowNum, values, skippedColumns);
  }

  function writeRowsPreservingSheetState_(sheet, startRow, rows, skippedColumns) {
    return SheetWritePreserver.writeRowsPreservingSheetState(sheet, startRow, rows, skippedColumns);
  }

  function getAppendRowForRowData_(sheet, headerRow, headers, rowData) {
    if (rowData && rowData['Giá dầu áp dụng'] !== undefined) {
      return getAppendRowInHeaders_(sheet, headerRow, headers, [
        'Giá dầu áp dụng',
        'Ngày áp dụng giá dầu',
        'Ghi chú'
      ]);
    }
    if (rowData && rowData['Mã tham số'] !== undefined) {
      return getAppendRowInHeaders_(sheet, headerRow, headers, [
        'Mã tham số',
        'Tên tham số',
        'Giá trị',
        'Ngày áp dụng tham số'
      ]);
    }
    return getAppendRow_(sheet, headerRow);
  }

  function getAppendRowInHeaders_(sheet, headerRow, headers, targetHeaders) {
    var targetColumns = targetHeaders.map(function (header) {
      return headers.indexOf(header) + 1;
    }).filter(function (column) {
      return column > 0;
    });
    if (!targetColumns.length) return getAppendRow_(sheet, headerRow);

    var lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) return headerRow + 1;
    for (var rowNumber = lastRow; rowNumber > headerRow; rowNumber--) {
      for (var i = 0; i < targetColumns.length; i++) {
        var value = sheet.getRange(rowNumber, targetColumns[i]).getValue();
        if (value !== '' && value !== null && value !== undefined) {
          return rowNumber + 1;
        }
      }
    }
    return headerRow + 1;
  }

  function getLastNonEmptyRowInColumn_(sheet, column, minRow, useCache) {
    var cacheKey = useCache ? cacheKey_('lastrow', sheet.getName(), column, minRow, getReportDataVersion_()) : '';
    return SheetWritePreserver.getLastNonEmptyRowInColumn(sheet, column, minRow, cacheKey, 300);
  }

  function ensureRows_(sheet, requiredLastRow) {
    return SheetWritePreserver.ensureRows(sheet, requiredLastRow);
  }

  function applyFormatsSafely_(sheet, formType, startRow, rowCount) {
    var warnings = [];
    var apply = function (column, width, format) {
      try {
        sheet.getRange(startRow, column, rowCount, width).setNumberFormat(format);
      } catch (e) {
        warnings.push('Dữ liệu đã ghi thành công, nhưng Google Sheets không cho đổi định dạng cột ' + column + ': ' + e.message);
      }
    };

    if (formType === 'vanChuyen') {
      apply(1, 1, 'dd/MM/yyyy');
      apply(5, 1, '0');
    } else if (formType === 'taiXe') {
      apply(1, 1, 'dd/MM/yyyy');
      apply(5, 1, '0');
    } else if (formType === 'dau') {
      apply(1, 1, 'dd/MM/yyyy');
      apply(5, 1, '#,##0.##');
      apply(6, 2, '#,##0 ₫');
    } else if (formType === 'chamCong') {
      apply(1, 2, 'dd/MM/yyyy');
      apply(6, 1, '0.##');
    } else if (formType === 'phat') {
      apply(1, 1, 'dd/MM/yyyy');
      apply(6, 1, '#,##0 ₫');
    } else if (formType === 'nghiVanHanh') {
      apply(1, 1, 'dd/MM/yyyy');
      apply(6, 2, '0.##');
      apply(8, 1, '0.##');
    }
    return warnings;
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  function normalizeText_(value) {
    return clean_(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function serializeDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, APP_CONFIG.timezone, 'yyyy-MM-dd');
    }
    return clean_(value);
  }

  function parseSheetDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var text = clean_(value);
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vn) return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]));
    return null;
  }

  function parseNumberLoose_(value) {
    return ValidationService.parseNumber(value, false);
  }

  function normalizeMonthKey_(month) {
    var text = clean_(month);
    if (!text) return '';
    var iso = text.match(/^(\d{4})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2];
    var vn = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (vn) return vn[2] + '-' + ('0' + Number(vn[1])).slice(-2);
    return text.replace(/[^\w-]/g, '_');
  }

  function cacheKey_(type) {
    var dimensions = [];
    for (var i = 1; i < arguments.length; i++) {
      dimensions.push(normalizeMonthKey_(arguments[i]) || 'all');
    }
    return RuntimeCacheService.buildKey(
      ['ss', normalizeMonthKey_(APP_CONFIG.spreadsheetId), type, CACHE_VERSION],
      dimensions
    );
  }

  function filterDisplayTableByMonth_(matrix, month) {
    if (month === 'Tất cả') return matrix || [];
    var key = normalizeDisplayMonth_(month);
    if (!key || !matrix || matrix.length < 2) return matrix || [];
    var header = matrix[0];
    var rows = matrix.slice(1).filter(function (row) {
      return normalizeDisplayMonth_(row[0]) === key;
    });
    return [header].concat(rows);
  }

  function normalizeDisplayMonth_(value) {
    var text = clean_(value);
    if (!text) return '';
    var date = ValidationService.parseDate(text);
    if (date) return Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM');
    var monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYear) return monthYear[2] + '-' + ('0' + Number(monthYear[1])).slice(-2);
    var iso = text.match(/^(\d{4})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2];
    return text;
  }

  function putChunkedCache_(key, data, ttlSeconds) {
    return RuntimeCacheService.putChunked(key, data, ttlSeconds);
  }

  function getChunkedCache_(key) {
    return RuntimeCacheService.getChunked(key);
  }

  function removeChunkedCache_(key) {
    return RuntimeCacheService.removeChunked(key);
  }

  function clearAfterSubmitCache_() {
    bumpReportDataVersion_();
  }

  function invalidateCaches() {
    invalidateRuntimeCaches_();
    return {
      ok: true,
      cacheVersion: CACHE_VERSION,
      invalidatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm:ss')
    };
  }

  function invalidateRuntimeCaches_() {
    bumpReportDataVersion_();
    RuntimeCacheService.removeChunkedMany([
      cacheKey_('reports', 'all'),
      cacheKey_('dashboard', 'latest'),
      cacheKey_('report', 'overview', 'all'),
      cacheKey_('report', 'payroll', 'all'),
      cacheKey_('report', 'vehicles', 'all'),
      cacheKey_('report_bundle', 'all'),
      cacheKey_('report_tables', 'all')
    ]);
    
    // Clear catalog caches
    var formTypes = ['all', 'vanChuyen', 'taiXe', 'dau', 'chamCong', 'phat', 'nghiVanHanh'];
    formTypes.forEach(function (type) {
      removeChunkedCache_(cacheKey_('catalogs', type));
    });
  }

  function readLatestTrips_(ss) {
    var sheet = ss.getSheetByName('NL_VanChuyen');
    if (!sheet) return { date: '', trips: [] };
    var lastDataRow = getLastNonEmptyRowInColumn_(sheet, 1, 3, true);
    if (lastDataRow < 3) return { date: '', trips: [] };
    var sampleRows = Math.min(lastDataRow - 2, 500);
    var startRow = lastDataRow - sampleRows + 1;
    var values = sheet.getRange(startRow, 1, sampleRows, 6).getValues();
    
    var maxTime = 0;
    var maxDate = null;
    values.forEach(function (row) {
      var d = row[0];
      if (Object.prototype.toString.call(d) === '[object Date]') {
        var t = d.getTime();
        if (t > maxTime) {
          maxTime = t;
          maxDate = d;
        }
      }
    });
    
    if (!maxDate) return { date: '', trips: [] };
    
    var maxDateStr = Utilities.formatDate(maxDate, APP_CONFIG.timezone, 'yyyy-MM-dd');
    var dateLabel = Utilities.formatDate(maxDate, APP_CONFIG.timezone, 'dd/MM/yyyy');
    
    var tripsMap = {};
    var ticketMap = {};
    var projectMap = {};
    values.forEach(function (row) {
      var d = row[0];
      if (Object.prototype.toString.call(d) === '[object Date]') {
        var dStr = Utilities.formatDate(d, APP_CONFIG.timezone, 'yyyy-MM-dd');
        if (dStr === maxDateStr) {
          var plate = clean_(row[2]);
          var project = clean_(row[3]);
          var count = parseNumberLoose_(row[4]);
          var ticket = clean_(row[5]);
          if (plate && count > 0) {
            var key = project + '|' + plate;
            tripsMap[key] = (tripsMap[key] || 0) + count;
            projectMap[key] = project;
            if (ticket) {
              if (!ticketMap[key]) {
                ticketMap[key] = [];
              }
              if (ticketMap[key].indexOf(ticket) === -1) {
                ticketMap[key].push(ticket);
              }
            }
          }
        }
      }
    });
    
    var tripsList = Object.keys(tripsMap).map(function (key) {
      var parts = key.split('|');
      return { 
        project: projectMap[key] || parts[0] || '-',
        vehicle: parts[1] || '', 
        count: tripsMap[key],
        ticket: ticketMap[key] ? ticketMap[key].join(', ') : '-'
      };
    });
    
    tripsList.sort(function (a, b) {
      if (a.project !== b.project) return a.project.localeCompare(b.project);
      if (b.count !== a.count) return b.count - a.count;
      return a.vehicle.localeCompare(b.vehicle);
    });
    
    return {
      date: dateLabel,
      trips: tripsList
    };
  }

  function parseOverview_(monthsMatrix) {
    var months = [];
    if (monthsMatrix && monthsMatrix.length > 1) {
      for (var i = 1; i < monthsMatrix.length; i++) {
        if (monthsMatrix[i][0]) months.push(monthsMatrix[i][0]);
      }
    }
    return { months: months };
  }

  function readSheetData(sheetName, startDateStr, endDateStr, limit) {
    return SheetReadService.readSheetDataFromSpreadsheet(getSpreadsheet_(), sheetName, startDateStr, endDateStr, limit, {
      sheets: APP_CONFIG.sheets,
      timezone: APP_CONFIG.timezone,
      buildCacheKey: cacheKey_,
      getDataVersion: getReportDataVersion_,
      getCached: getChunkedCache_,
      putCached: putChunkedCache_,
      getLastNonEmptyRow: getLastNonEmptyRowInColumn_
    });
  }

  function saveSheetRow(sheetName, rowIndex, rowData, expectedRowData) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = getSpreadsheet_();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

      var headerRow = 1;
      for (var key in APP_CONFIG.sheets) {
        if (APP_CONFIG.sheets[key].name === sheetName) {
          headerRow = APP_CONFIG.sheets[key].headerRow;
          break;
        }
      }

      var lastCol = sheet.getLastColumn();
      var rawHeaders = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) {
        return String(h).trim();
      });
      var headers = rawHeaders.map(function(h, idx) {
        if (sheetName === 'DM_ThamSo') {
          if (idx === 3) return 'Ngày áp dụng tham số';
          if (idx === 5) return 'Ngày áp dụng giá dầu';
        }
        return h;
      });

      var rowNum = parseInt(rowIndex, 10);
      if (isNaN(rowNum) || rowNum <= 0) {
        rowNum = getAppendRowForRowData_(sheet, headerRow, headers, rowData);
        ensureRows_(sheet, rowNum);
      }

      var existingFormulas = null;
      var existingValues = null;
      if (rowNum <= sheet.getLastRow()) {
        existingFormulas = sheet.getRange(rowNum, 1, 1, headers.length).getFormulas()[0];
        existingValues = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
      }

      if (existingValues && rowObjectMatchesValues_(headers, existingValues, rowData)) {
        return { ok: true, rowIndex: rowNum, idempotentReplay: true };
      }
      if (existingValues && expectedRowData && !rowObjectMatchesValues_(headers, existingValues, expectedRowData)) {
        throw new Error('Dòng ' + rowNum + ' đã thay đổi sau khi tạo job; từ chối ghi để tránh sửa nhầm dữ liệu.');
      }

      var valuesToSet = [];
      var skippedColumns = [];
      for (var colIdx = 0; colIdx < headers.length; colIdx++) {
        var header = headers[colIdx];
        var headerLower = header.toLowerCase().trim();
        var val = rowData[header];

        if (existingFormulas && existingFormulas[colIdx]) {
          valuesToSet.push(existingFormulas[colIdx]);
        } else if (header === 'Tháng' && sheetName.indexOf('NL_') === 0) {
          valuesToSet.push('');
          skippedColumns.push(colIdx);
        } else if (sheetName === 'NL_Dau' && (header === 'Thành tiền' || header === 'Công ty sở hữu')) {
          valuesToSet.push(existingValues ? existingValues[colIdx] : '');
          skippedColumns.push(colIdx);
        } else if (sheetName === 'NL_ChamCong' && (headerLower.indexOf('số ngày') !== -1 || headerLower.indexOf('tính lương cứng') !== -1 || headerLower.indexOf('nhóm xử lý') !== -1)) {
          valuesToSet.push('');
          skippedColumns.push(colIdx);
        } else if (sheetName === 'NL_Phat' && (headerLower.indexOf('nội dung phạt') !== -1 || headerLower.indexOf('số tiền phạt') !== -1)) {
          valuesToSet.push('');
          skippedColumns.push(colIdx);
        } else if (sheetName === 'NL_NghiVanHanh' && (headerLower.indexOf('tính kpi') !== -1 || headerLower.indexOf('giảm kpi') !== -1)) {
          valuesToSet.push('');
          skippedColumns.push(colIdx);
        } else if (val === undefined && existingValues) {
          valuesToSet.push(existingValues[colIdx]);
        } else {
          if (val === undefined || val === null) {
            valuesToSet.push('');
          } else {
            var cleanVal = String(val).trim();
            var dateMatch = cleanVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateMatch) {
              valuesToSet.push(new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
            } else if (cleanVal === '') {
              valuesToSet.push('');
            } else if (/^-?\d+(\.\d+)?$/.test(cleanVal) && !(cleanVal.length > 1 && cleanVal.indexOf('0') === 0 && cleanVal.indexOf('0.') !== 0)) {
              valuesToSet.push(Number(cleanVal));
            } else {
              valuesToSet.push(cleanVal);
            }
          }
        }
      }

      writeRowSkippingColumns_(sheet, rowNum, valuesToSet, skippedColumns);

      clearAfterSubmitCache_();

      if (sheetName.indexOf('DM_') === 0) {
        removeChunkedCache_(cacheKey_('catalogs', 'all'));
        for (var key in APP_CONFIG.sheets) {
          removeChunkedCache_(cacheKey_('catalogs', key));
        }
      }

      return { ok: true, rowIndex: rowNum };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      lock.releaseLock();
    }
  }

  function deleteSheetRow(sheetName, rowIndex, columnsToClear, expectedRowData) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = getSpreadsheet_();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

      var rowNum = parseInt(rowIndex, 10);
      if (isNaN(rowNum) || rowNum <= 0) {
        throw new Error('Số dòng không hợp lệ: ' + rowIndex);
      }

      var headerRow = 1;
      for (var key in APP_CONFIG.sheets) {
        if (APP_CONFIG.sheets[key].name === sheetName) {
          headerRow = APP_CONFIG.sheets[key].headerRow;
          break;
        }
      }
      if (rowNum <= headerRow) {
        throw new Error('Không thể xóa dòng tiêu đề.');
      }

      if (columnsToClear && columnsToClear.length > 0) {
        var lastCol = sheet.getLastColumn();
        var rawHeaders = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) {
          return String(h).trim();
        });
        var headers = rawHeaders.map(function(h, idx) {
          if (sheetName === 'DM_ThamSo') {
            if (idx === 3) return 'Ngày áp dụng tham số';
            if (idx === 5) return 'Ngày áp dụng giá dầu';
          }
          return h;
        });

        var currentValues = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
        var alreadyCleared = columnsToClear.every(function (colHeader) {
          var clearedColIdx = headers.indexOf(colHeader);
          return clearedColIdx === -1 || normalizeComparableCell_(currentValues[clearedColIdx]) === '';
        });
        if (alreadyCleared) return { ok: true, rowIndex: rowNum, idempotentReplay: true };
        if (expectedRowData && !rowObjectMatchesValues_(headers, currentValues, expectedRowData)) {
          throw new Error('Dòng ' + rowNum + ' đã thay đổi sau khi tạo job; từ chối xóa để tránh xóa nhầm dữ liệu.');
        }

        columnsToClear.forEach(function(colHeader) {
          var colIdx = headers.indexOf(colHeader);
          if (colIdx !== -1) {
            sheet.getRange(rowNum, colIdx + 1).setValue('');
          }
        });
      } else {
        sheet.deleteRow(rowNum);
      }

      SpreadsheetApp.flush();
      clearAfterSubmitCache_();

      if (sheetName.indexOf('DM_') === 0) {
        removeChunkedCache_(cacheKey_('catalogs', 'all'));
        for (var key in APP_CONFIG.sheets) {
          removeChunkedCache_(cacheKey_('catalogs', key));
        }
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      lock.releaseLock();
    }
  }

  function rowObjectMatchesValues_(headers, values, rowData) {
    var compared = 0;
    var matches = true;
    Object.keys(rowData || {}).forEach(function (header) {
      var colIndex = headers.indexOf(header);
      if (colIndex < 0 || rowData[header] === undefined) return;
      compared++;
      if (normalizeComparableCell_(values[colIndex]) !== normalizeComparableCell_(rowData[header])) matches = false;
    });
    return compared > 0 && matches;
  }

  function normalizeComparableCell_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, APP_CONFIG.timezone, 'yyyy-MM-dd');
    }
    return String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ');
  }

  return {
    health: health,
    getBootstrap: getBootstrap,
    getStartupData: getStartupData,
    getInitialData: getInitialData,
    getCatalogs: getCatalogs,
    getDashboard: getDashboard,
    getReports: getReports,
    getReport: getReport,
    getReportBundle: getReportBundle,
    invalidateCaches: invalidateCaches,
    cleanupOverviewTempSheets: cleanupOverviewTempSheets,
    submitRows: submitRows,
    checkTripReconciliation: checkTripReconciliation,
    readSheetData: readSheetData,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
