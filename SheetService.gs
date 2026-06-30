var SheetService = (function () {
  var CACHE_VERSION = 'v11';
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

  function getInitialData() {
    var data = getBootstrap();
    data.catalogs = getCatalogs();
    return data;
  }

  function getCatalogs(formType) {
    var key = cacheKey_('catalogs', formType || 'all');
    var cached = getChunkedCache_(key);
    if (cached) return cached;
    var catalogs = readCatalogs_(getSpreadsheet_(), formType);
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

  function submitRows(formType, rows) {
    if (!APP_CONFIG.sheets[formType]) {
      throw new Error('Loai form khong hop le: ' + formType);
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Chua co dong nao de ghi.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = getSpreadsheet_();
      var catalogs = getCatalogs(formType);
      var result = ValidationService.buildRows(formType, rows, catalogs);
      if (!result.values.length) {
        return {
          ok: false,
          inserted: 0,
          errors: result.errors,
          warnings: result.warnings
        };
      }

      var cfg = APP_CONFIG.sheets[formType];
      var sheet = ss.getSheetByName(cfg.name);
      if (!sheet) {
        throw new Error('Khong tim thay sheet ' + cfg.name);
      }

      var appendRow = getAppendRow_(sheet, cfg.headerRow);
      ensureRows_(sheet, appendRow + result.values.length - 1);
      
      var sheetHeaders = sheet.getRange(cfg.headerRow, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
        return String(h).trim();
      });
      var skippedColumns = getFormulaInputColumnIndexes_(cfg.name, sheetHeaders);
      if (skippedColumns.length) {
        for (var i = 0; i < result.values.length; i++) {
          writeRowSkippingColumns_(sheet, appendRow + i, result.values[i], skippedColumns);
        }
      } else {
        var range = sheet.getRange(appendRow, 1, result.values.length, cfg.columns);
        range.setValues(result.values);
      }
      var formatWarnings = applyFormatsSafely_(sheet, formType, appendRow, result.values.length);

      clearAfterSubmitCache_();
      return {
        ok: result.errors.length === 0,
        inserted: result.values.length,
        startRow: appendRow,
        sheetName: cfg.name,
        errors: result.errors,
        warnings: result.warnings.concat(formatWarnings)
      };
    } finally {
      lock.releaseLock();
    }
  }

  function checkTripReconciliation(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    var keys = {};
    rows.forEach(function (row) {
      var date = ValidationService.parseDate(row.date);
      var plate = clean_(row.vehicle);
      if (!date || !plate) return;
      var key = Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM-dd') + '|' + plate;
      keys[key] = { date: date, plate: plate };
    });
    var pairs = Object.keys(keys).map(function (key) { return keys[key]; });
    if (!pairs.length) return [];

    var ss = getSpreadsheet_();
    var vanChuyen = sumTripsByPairs_(ss.getSheetByName('NL_VanChuyen'), 2, pairs, 1, 3, 5);
    var taiXe = sumTripsByPairs_(ss.getSheetByName('NL_TaiXe'), 1, pairs, 1, 3, 5);
    return pairs.map(function (pair) {
      var key = pairKey_(pair.date, pair.plate);
      var planned = vanChuyen[key] || 0;
      var actual = taiXe[key] || 0;
      var diff = planned - actual;
      if (diff === 0) return null;
      return Utilities.formatDate(pair.date, APP_CONFIG.timezone, 'dd/MM/yyyy') + ' - ' + pair.plate + ': báo cáo ' + planned + ', tài xế ' + actual + ', lệch ' + diff + '.';
    }).filter(function (message) { return message; });
  }

  function getSpreadsheet_() {
    return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  }

  function readCatalogs_(ss, formType) {
    var needs = catalogNeeds_(formType);
    var params = needs.params ? readParams_(ss) : {};
    var peopleRows = needs.people ? readRows_(ss, 'DM_NhanSu') : [];
    var vehicleRows = needs.vehicles ? readRows_(ss, 'DM_Xe') : [];
    var projectRows = needs.projects ? readRows_(ss, 'DM_DuAn') : [];
    var penaltyRows = needs.penalties ? readRows_(ss, 'DM_PhatNoiBo') : [];
    var assignmentRows = [];
    var chamCongTypes = needs.chamCongTypes ? readChamCongTypes_(ss) : [];

    var people = peopleRows.map(function (row) {
      return {
        name: clean_(row[0]),
        role: clean_(row[1]),
        recruiter: clean_(row[2]),
        status: clean_(row[9])
      };
    }).filter(function (item) { return item.name; });

    var vehicles = vehicleRows.map(function (row) {
      return {
        plate: clean_(row[0]),
        status: clean_(row[3]),
        owner: clean_(row[5])
      };
    }).filter(function (item) { return item.plate; });

    var projects = projectRows.map(function (row) {
      return {
        name: clean_(row[0]),
        distanceKm: parseNumberLoose_(row[1])
      };
    }).filter(function (item) { return item.name; });

    var penalties = penaltyRows.map(function (row) {
      return {
        code: clean_(row[0]),
        content: clean_(row[1]),
        amount: parseNumberLoose_(row[2]),
        status: clean_(row[3])
      };
    }).filter(function (item) { return item.code; });

    var assignments = assignmentRows.map(function (row) {
      return {
        plate: clean_(row[0]),
        driver: clean_(row[1]),
        role: clean_(row[2]),
        fromDate: serializeDate_(row[3]),
        toDate: serializeDate_(row[4]),
        eligible: clean_(row[5]),
        shortage: clean_(row[6]),
        note: clean_(row[7])
      };
    }).filter(function (item) { return item.plate && item.driver; });

    var activeVehicles = vehicles.filter(function (item) { return item.status === 'Dang chay' || item.status === 'Đang chạy'; });
    var activePeople = people.filter(function (item) { return item.status === 'Dang lam' || item.status === 'Đang làm'; });
    var activeDrivers = people.filter(function (item) {
        return (item.status === 'Dang lam' || item.status === 'Đang làm') && item.role === 'Tài xế';
      });
    return {
      vehicles: vehicles,
      activeVehicles: activeVehicles,
      people: people,
      activePeople: activePeople,
      activeDrivers: activeDrivers,
      projects: projects,
      penalties: penalties,
      activePenalties: penalties.filter(function (item) { return item.status === 'Dang ap dung' || item.status === 'Đang áp dụng'; }),
      assignments: assignments,
      params: params,
      chamCongTypes: chamCongTypes,
      nghiVanHanhTypes: ['Mỏ báo nghỉ', 'Mưa', 'Lễ/Tết', 'Xe hỏng', 'Khác'],
      fuelSources: ['Quang Minh', 'Đổ ngoài']
    };
  }

  function catalogNeeds_(formType) {
    var needs = { params: false, people: false, vehicles: false, projects: false, penalties: false, assignments: false, chamCongTypes: false };
    if (!formType) {
      return { params: true, people: true, vehicles: true, projects: true, penalties: true, assignments: true, chamCongTypes: true };
    }
    if (formType === 'vanChuyen') {
      needs.vehicles = true;
      needs.projects = true;
    } else if (formType === 'taiXe') {
      needs.vehicles = true;
      needs.people = true;
    } else if (formType === 'dau') {
      needs.vehicles = true;
    } else if (formType === 'chamCong') {
      needs.people = true;
      needs.chamCongTypes = true;
    } else if (formType === 'phat') {
      needs.people = true;
      needs.penalties = true;
    } else if (formType === 'nghiVanHanh') {
      needs.vehicles = true;
      needs.projects = true;
      needs.params = true;
    } else {
      return catalogNeeds_();
    }
    return needs;
  }

  function readRows_(ss, sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) return [];
    return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  }

  function readChamCongTypes_(ss) {
    var sheet = ss.getSheetByName('NL_ChamCong');
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 10) return [];
    var values = sheet.getRange(2, 10, sheet.getLastRow() - 1, 1).getDisplayValues();
    var seen = {};
    var result = [];
    values.forEach(function (row) {
      var name = clean_(row[0]);
      if (!name || seen[name]) return;
      seen[name] = true;
      result.push({ name: name, group: '', salary: '' });
    });
    return result;
  }

  function readParams_(ss) {
    var sheet = ss.getSheetByName('DM_ThamSo');
    var params = {};
    if (!sheet || sheet.getLastRow() < 2) return params;
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    rows.forEach(function (row) {
      var key = clean_(row[0]);
      if (key) params[key] = parseNumberLoose_(row[2]);
    });
    return params;
  }

  function readOverviewReport_(ss, month) {
    var sheet = ss.getSheetByName('BC_TongQuan');
    if (!sheet) return { months: [], details: [] };

    var months = readOverviewMonths_(sheet);
    var details = readOverviewDetailsWithCache_(ss, sheet, months, month);
    return { months: months, details: details };
  }

  function readOverviewDashboard_(ss) {
    var sheet = ss.getSheetByName('BC_TongQuan');
    if (!sheet) return { months: [], details: [] };
    return { months: readOverviewMonths_(sheet), details: [] };
  }

  function readOverviewMonths_(sheet) {
    var rowCount = Math.min(sheet.getLastRow(), 24);
    if (rowCount < 1) return [];
    return sheet.getRange(1, 7, rowCount, 11).getDisplayValues()
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
    var monthCell = sheet.getRange('B1');
    var originalMonth = monthCell.getValue();
    var lock = LockService.getScriptLock();
    var locked = false;
    try {
      lock.waitLock(15000);
      locked = true;
      months.forEach(function (month) {
        var monthLabel = clean_(month);
        if (!monthLabel) return;
        var monthDate = parseReportMonthDate_(monthLabel);
        monthCell.setValue(monthDate || monthLabel);
        if (monthDate) monthCell.setNumberFormat('mm/yyyy');
        SpreadsheetApp.flush();
        var monthKey = normalizeDisplayMonth_(monthLabel) || normalizeMonthKey_(monthLabel);
        detailsByMonth[monthKey] = readCurrentOverviewDetails_(sheet);
      });
      if (!sameSheetValue_(monthCell.getValue(), originalMonth)) {
        monthCell.setValue(originalMonth);
        if (Object.prototype.toString.call(originalMonth) === '[object Date]' && !isNaN(originalMonth.getTime())) {
          monthCell.setNumberFormat('mm/yyyy');
        }
        SpreadsheetApp.flush();
      }
    } catch (e) {
      console.error('Lỗi tính toán/cache báo cáo chi tiết:', e);
    } finally {
      if (locked) lock.releaseLock();
    }

    writeReportDetailsCache_(ss, dataVersion, detailsByMonth);
    return detailsByMonth;
  }

  function getReportDataVersion_() {
    var baseVersion = PropertiesService.getScriptProperties().getProperty(REPORT_DATA_VERSION_PROP) || '0';
    var hourBucket = Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'yyyyMMddHH');
    return baseVersion + ':' + hourBucket;
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
      payroll: readTable_(ss, 'BC_BangLuong', 2, 1, 200, 14),
      vehicles: readTable_(ss, 'BC_TongHopXe', 2, 1, 200, 12)
    };
    putChunkedCache_(cacheKey, tables, REPORT_TTL_SECONDS);
    return tables;
  }

  function sumTripsByPairs_(sheet, headerRow, pairs, dateColumn, plateColumn, tripsColumn) {
    var result = {};
    if (!sheet) return result;
    var wanted = {};
    pairs.forEach(function (pair) {
      wanted[pairKey_(pair.date, pair.plate)] = true;
    });
    var lastRow = getLastNonEmptyRowInColumn_(sheet, 1, headerRow + 1, true);
    var rowCount = Math.max(lastRow - headerRow, 0);
    if (!rowCount) return result;
    var width = Math.max(dateColumn, plateColumn, tripsColumn);
    var values = sheet.getRange(headerRow + 1, 1, rowCount, width).getValues();
    values.forEach(function (row) {
      var date = row[dateColumn - 1];
      var plate = clean_(row[plateColumn - 1]);
      if (Object.prototype.toString.call(date) !== '[object Date]' || !plate) return;
      var key = pairKey_(date, plate);
      if (!wanted[key]) return;
      result[key] = (result[key] || 0) + parseNumberLoose_(row[tripsColumn - 1]);
    });
    return result;
  }

  function pairKey_(date, plate) {
    return Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM-dd') + '|' + clean_(plate);
  }

  function getAppendRow_(sheet, headerRow) {
    return getLastNonEmptyRowInColumn_(sheet, 1, headerRow + 1, false) + 1;
  }

  function writeRowSkippingColumns_(sheet, rowNum, values, skippedColumns) {
    var skipMap = {};
    (skippedColumns || []).forEach(function (colIdx) {
      skipMap[colIdx] = true;
    });

    var startCol = null;
    var segment = [];
    for (var colIdx = 0; colIdx < values.length; colIdx++) {
      if (skipMap[colIdx]) {
        if (segment.length) {
          sheet.getRange(rowNum, startCol + 1, 1, segment.length).setValues([segment]);
          segment = [];
          startCol = null;
        }
        continue;
      }

      if (startCol === null) startCol = colIdx;
      segment.push(values[colIdx]);
    }

    if (segment.length) {
      sheet.getRange(rowNum, startCol + 1, 1, segment.length).setValues([segment]);
    }
  }

  function getFormulaInputColumnIndexes_(sheetName, headers) {
    var skipped = [];
    (headers || []).forEach(function (header, index) {
      var normalized = normalizeHeader_(header);
      if (sheetName === 'NL_Dau' && (
        normalized === normalizeHeader_('Thành tiền') ||
        normalized === normalizeHeader_('Công ty sở hữu')
      )) {
        skipped.push(index);
      } else if (sheetName === 'NL_ChamCong' && (
        normalized === normalizeHeader_('Tháng') ||
        normalized === normalizeHeader_('Số ngày') ||
        normalized === normalizeHeader_('Tính lương cứng') ||
        normalized === normalizeHeader_('Nhóm xử lý')
      )) {
        skipped.push(index);
      } else if (sheetName === 'NL_Phat' && (
        normalized === normalizeHeader_('Tháng') ||
        normalized === normalizeHeader_('Nội dung phạt') ||
        normalized === normalizeHeader_('Số tiền phạt')
      )) {
        skipped.push(index);
      } else if (sheetName === 'NL_NghiVanHanh' && (
        normalized === normalizeHeader_('Tháng') ||
        normalized === normalizeHeader_('Tính KPI?') ||
        normalized === normalizeHeader_('Giảm KPI')
      )) {
        skipped.push(index);
      } else if (sheetName.indexOf('NL_') === 0 && normalized === normalizeHeader_('Tháng')) {
        skipped.push(index);
      }
    });
    return skipped;
  }

  function normalizeHeader_(value) {
    return clean_(value).toLowerCase();
  }

  function isFormulaInputColumn_(sheetName, header) {
    return getFormulaInputColumnIndexes_(sheetName, [header]).length > 0;
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
    var lastRow = sheet.getLastRow();
    if (lastRow < minRow) return minRow - 1;
    var values = sheet.getRange(1, column, lastRow, 1).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      var val = values[i][0];
      if (val !== '' && val !== null && val !== undefined) {
        var row = i + 1;
        if (row >= minRow) return row;
        break;
      }
    }
    return minRow - 1;
  }

  function ensureRows_(sheet, requiredLastRow) {
    if (sheet.getMaxRows() < requiredLastRow) {
      sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
    }
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
    return value === null || value === undefined ? '' : String(value).trim();
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
    var parts = ['ss', normalizeMonthKey_(APP_CONFIG.spreadsheetId), type, CACHE_VERSION];
    for (var i = 1; i < arguments.length; i++) {
      parts.push(normalizeMonthKey_(arguments[i]) || 'all');
    }
    return parts.join(':');
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

  function parseReportMonthDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), 1);
    }
    var text = clean_(value);
    if (!text) return null;
    var date = ValidationService.parseDate(text);
    if (date) return new Date(date.getFullYear(), date.getMonth(), 1);
    var monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYear) return new Date(Number(monthYear[2]), Number(monthYear[1]) - 1, 1);
    var iso = text.match(/^(\d{4})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, 1);
    return null;
  }

  function sameSheetValue_(a, b) {
    var aIsDate = Object.prototype.toString.call(a) === '[object Date]' && !isNaN(a.getTime());
    var bIsDate = Object.prototype.toString.call(b) === '[object Date]' && !isNaN(b.getTime());
    if (aIsDate && bIsDate) return a.getTime() === b.getTime();
    return clean_(a) === clean_(b);
  }

  function putChunkedCache_(key, data, ttlSeconds) {
    var cache = CacheService.getScriptCache();
    var text = JSON.stringify(data);
    var chunkSize = 90000;
    var chunks = [];
    for (var i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    
    // First, clear old chunks just in case the new count is smaller
    var oldCountStr = cache.get(key + '_count');
    if (oldCountStr) {
      var oldCount = parseInt(oldCountStr, 10);
      var oldKeys = [];
      for (var o = 0; o < oldCount; o++) {
        oldKeys.push(key + '_' + o);
      }
      oldKeys.push(key + '_count');
      cache.removeAll(oldKeys);
    }
    
    // Write new chunks
    var chunkKeys = {};
    for (var j = 0; j < chunks.length; j++) {
      chunkKeys[key + '_' + j] = chunks[j];
    }
    cache.putAll(chunkKeys, ttlSeconds);
    cache.put(key + '_count', String(chunks.length), ttlSeconds);
  }

  function getChunkedCache_(key) {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(key + '_count');
    if (!countStr) return null;
    var count = parseInt(countStr, 10);
    var keys = [];
    for (var j = 0; j < count; j++) {
      keys.push(key + '_' + j);
    }
    var retrieved = cache.getAll(keys);
    var text = '';
    for (var j = 0; j < count; j++) {
      var chunk = retrieved[key + '_' + j];
      if (!chunk) return null; // A chunk is missing or expired
      text += chunk;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function removeChunkedCache_(key) {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(key + '_count');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [key + '_count'];
      for (var j = 0; j < count; j++) {
        keys.push(key + '_' + j);
      }
      cache.removeAll(keys);
    }
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
    removeChunkedCache_(cacheKey_('reports', 'all'));
    removeChunkedCache_(cacheKey_('dashboard', 'latest'));
    removeChunkedCache_(cacheKey_('report', 'overview', 'all'));
    removeChunkedCache_(cacheKey_('report', 'payroll', 'all'));
    removeChunkedCache_(cacheKey_('report', 'vehicles', 'all'));
    removeChunkedCache_(cacheKey_('report_bundle', 'all'));
    removeChunkedCache_(cacheKey_('report_tables', 'all'));
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

      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var headers = [];
      var rows = [];
      var rowLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 500));

      if (lastCol > 0) {
        var rawHeaders = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) {
          return String(h).trim();
        });
        headers = rawHeaders.map(function(h, idx) {
          if (sheetName === 'DM_ThamSo') {
            if (idx === 3) return 'Ngày áp dụng tham số';
            if (idx === 5) return 'Ngày áp dụng giá dầu';
          }
          return h;
        });

        if (lastRow > headerRow) {
          var isJournalSheet = sheetName.indexOf('NL_') === 0;
          var hasDateFilter = (startDateStr || endDateStr) && isJournalSheet;
          var readStartRow = headerRow + 1;
          var readRowCount = lastRow - headerRow;
          var rowEntries = [];
          var startLimit = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
          var endLimit = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;

          if (hasDateFilter) {
            var dateValues = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 1).getValues();
            var matchedRows = [];
            for (var dIdx = 0; dIdx < dateValues.length; dIdx++) {
              var parsedDate = parseSheetDate_(dateValues[dIdx][0]);
              if (parsedDate && (!startLimit || parsedDate >= startLimit) && (!endLimit || parsedDate <= endLimit)) {
                matchedRows.push(headerRow + 1 + dIdx);
              }
            }

            if (matchedRows.length) {
              var groupStart = matchedRows[0];
              var groupEnd = matchedRows[0];
              var groups = [];
              for (var gIdx = 1; gIdx < matchedRows.length; gIdx++) {
                if (matchedRows[gIdx] === groupEnd + 1) {
                  groupEnd = matchedRows[gIdx];
                } else {
                  groups.push({ start: groupStart, end: groupEnd });
                  groupStart = matchedRows[gIdx];
                  groupEnd = matchedRows[gIdx];
                }
              }
              groups.push({ start: groupStart, end: groupEnd });

              groups.forEach(function (group) {
                var groupValues = sheet.getRange(group.start, 1, group.end - group.start + 1, lastCol).getValues();
                groupValues.forEach(function (rowValues, offset) {
                  rowEntries.push({ rowIndex: group.start + offset, values: rowValues });
                });
              });
              rowEntries.sort(function (a, b) { return b.rowIndex - a.rowIndex; });
            }
          } else {
            if (isJournalSheet) {
              var lastDataRow = getLastNonEmptyRowInColumn_(sheet, 1, headerRow + 1, true);
              if (lastDataRow >= headerRow + 1) {
                readRowCount = Math.min(rowLimit, lastDataRow - headerRow);
                readStartRow = lastDataRow - readRowCount + 1;
              } else {
                readRowCount = 0;
              }
            }

            var rawValues = readRowCount > 0
              ? sheet.getRange(readStartRow, 1, readRowCount, lastCol).getValues()
              : [];
            for (var rawIdx = rawValues.length - 1; rawIdx >= 0; rawIdx--) {
              rowEntries.push({ rowIndex: readStartRow + rawIdx, values: rawValues[rawIdx] });
            }
          }

          rowEntries.forEach(function (entry) {
            var rowIndex = entry.rowIndex;
            var rawRow = entry.values;
            var cells = rawRow.map(function (val) {
              if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
                return Utilities.formatDate(val, APP_CONFIG.timezone, 'yyyy-MM-dd');
              }
              return val;
            });
            
            var isEmpty = cells.every(function (cell) {
              return cell === null || cell === undefined || String(cell).trim() === '';
            });
            
            if (isEmpty) return;

            rows.push({
              rowIndex: rowIndex,
              values: cells
            });
          });
        }
      }

      var isLimited = false;
      if (sheetName.indexOf('NL_') === 0 && !startDateStr && !endDateStr) {
        isLimited = true;
      }
      if (sheetName.indexOf('DM_') === 0) {
        rows.reverse();
      }

      return {
        ok: true,
        headers: headers,
        rows: rows,
        isLimited: isLimited
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function saveSheetRow(sheetName, rowIndex, rowData) {
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

      var valuesToSet = [];
      var skippedColumns = [];
      for (var colIdx = 0; colIdx < headers.length; colIdx++) {
        var header = headers[colIdx];
        var val = rowData[header];

        if (existingFormulas && existingFormulas[colIdx]) {
          valuesToSet.push(existingFormulas[colIdx]);
        } else if (isFormulaInputColumn_(sheetName, header)) {
          valuesToSet.push(existingValues ? existingValues[colIdx] : '');
          skippedColumns.push(colIdx);
        } else if (val === undefined && existingValues) {
          valuesToSet.push(existingValues[colIdx]);
        } else if (header === 'Tháng' && sheetName.indexOf('NL_') === 0) {
          valuesToSet.push('');
        } else if (sheetName === 'NL_ChamCong' && (header.toLowerCase().indexOf('số ngày') !== -1 || header.toLowerCase().indexOf('lương cứng') !== -1 || header.toLowerCase().indexOf('nhóm') !== -1)) {
          valuesToSet.push('');
        } else if (sheetName === 'NL_Phat' && (header.toLowerCase().indexOf('nội dung') !== -1 || header.toLowerCase().indexOf('tiền phạt') !== -1)) {
          valuesToSet.push('');
        } else if (sheetName === 'NL_NghiVanHanh' && (header.toLowerCase().indexOf('tính kpi') !== -1 || header.toLowerCase().indexOf('giảm kpi') !== -1)) {
          valuesToSet.push('');
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

      var formType = null;
      for (var key in APP_CONFIG.sheets) {
        if (APP_CONFIG.sheets[key].name === sheetName) {
          formType = key;
          break;
        }
      }
      if (formType) {
        applyFormatsSafely_(sheet, formType, rowNum, 1);
      }

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

  function deleteSheetRow(sheetName, rowIndex, columnsToClear) {
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

  return {
    getBootstrap: getBootstrap,
    getInitialData: getInitialData,
    getCatalogs: getCatalogs,
    getDashboard: getDashboard,
    getReports: getReports,
    getReport: getReport,
    getReportBundle: getReportBundle,
    invalidateCaches: invalidateCaches,
    submitRows: submitRows,
    checkTripReconciliation: checkTripReconciliation,
    readSheetData: readSheetData,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
