var SheetService = (function () {
  var CACHE_VERSION = 'v4';
  var CATALOG_TTL_SECONDS = 21600;
  var REPORT_TTL_SECONDS = 180;

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
    var key = 'catalogs:' + CACHE_VERSION + ':' + (formType || 'all');
    var cached = getChunkedCache_(key);
    if (cached) return cached;
    var catalogs = readCatalogs_(getSpreadsheet_(), formType);
    putChunkedCache_(key, catalogs, CATALOG_TTL_SECONDS);
    return catalogs;
  }

  function getDashboard(month, forceRefresh) {
    var monthKey = normalizeMonthKey_(month) || 'latest';
    var key = 'dashboard:' + CACHE_VERSION + ':' + monthKey;
    if (!forceRefresh) {
      var cached = getChunkedCache_(key);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var dashboard = {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewReport_(ss, month),
      inputs: readInputStats_(ss),
      latestTrips: readLatestTrips_(ss),
      links: reportLinks_(),
      cached: false
    };
    putChunkedCache_(key, dashboard, REPORT_TTL_SECONDS);
    return dashboard;
  }

  function getReports(forceRefresh) {
    var cacheKey = 'reports:' + CACHE_VERSION + ':all';
    if (!forceRefresh) {
      var cached = getChunkedCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var reports = {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewReport_(ss),
      payroll: readTable_(ss, 'BC_BangLuong', 2, 1, 100, 14),
      vehicles: readTable_(ss, 'BC_TongHopXe', 2, 1, 100, 12),
      inputs: readInputStats_(ss),
      latestTrips: readLatestTrips_(ss),
      links: reportLinks_(),
      cached: false
    };
    putChunkedCache_(cacheKey, reports, REPORT_TTL_SECONDS);
    return reports;
  }

  function getReport(type, month, forceRefresh) {
    var reportType = type || 'overview';
    var monthKey = normalizeMonthKey_(month) || 'all';
    var cacheKey = 'report:' + CACHE_VERSION + ':' + reportType + ':' + monthKey;
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
        links: reportLinks_()
      };
    } else if (reportType === 'payroll') {
      report = {
        type: reportType,
        updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
        data: filterDisplayTableByMonth_(readTable_(ss, 'BC_BangLuong', 2, 1, 200, 14), month),
        links: reportLinks_()
      };
    } else if (reportType === 'vehicles') {
      report = {
        type: reportType,
        updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
        data: filterDisplayTableByMonth_(readTable_(ss, 'BC_TongHopXe', 2, 1, 200, 12), month),
        links: reportLinks_()
      };
    } else {
      throw new Error('Loai bao cao khong hop le: ' + reportType);
    }
    putChunkedCache_(cacheKey, report, REPORT_TTL_SECONDS);
    return report;
  }

  function getReportBundle(month, forceRefresh) {
    var monthKey = normalizeMonthKey_(month) || 'all';
    var cacheKey = 'report_bundle:' + CACHE_VERSION + ':' + monthKey;
    if (!forceRefresh) {
      var cached = getChunkedCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getSpreadsheet_();
    var bundle = {
      updatedAt: Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'dd/MM/yyyy HH:mm'),
      overview: readOverviewReport_(ss, month),
      payroll: filterDisplayTableByMonth_(readTable_(ss, 'BC_BangLuong', 2, 1, 200, 14), month),
      vehicles: filterDisplayTableByMonth_(readTable_(ss, 'BC_TongHopXe', 2, 1, 200, 12), month),
      inputs: readInputStats_(ss),
      latestTrips: readLatestTrips_(ss),
      links: reportLinks_()
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

  function reportLinks_() {
    return {
      spreadsheet: 'https://docs.google.com/spreadsheets/d/' + APP_CONFIG.spreadsheetId + '/edit',
      overview: 'https://docs.google.com/spreadsheets/d/' + APP_CONFIG.spreadsheetId + '/edit#gid=20260626',
      payroll: 'https://docs.google.com/spreadsheets/d/' + APP_CONFIG.spreadsheetId + '/edit#gid=1296722813',
      vehicles: 'https://docs.google.com/spreadsheets/d/' + APP_CONFIG.spreadsheetId + '/edit#gid=20260623'
    };
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
      var range = sheet.getRange(appendRow, 1, result.values.length, cfg.columns);
      range.setValues(result.values);
      applyFormats_(sheet, formType, appendRow, result.values.length);

      SpreadsheetApp.flush();
      clearAfterSubmitCache_();
      return {
        ok: result.errors.length === 0,
        inserted: result.values.length,
        startRow: appendRow,
        sheetName: cfg.name,
        errors: result.errors,
        warnings: result.warnings
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
    var assignmentRows = needs.assignments ? readRows_(ss, 'DM_PhanCongLaiXe') : [];

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
      chamCongTypes: [
        { name: 'Nghỉ phép', group: 'NGHI_PHEP', salary: 'Có' },
        { name: 'Nghỉ không phép', group: 'TRU_LUONG', salary: 'Không' },
        { name: 'Nghỉ không lương', group: 'TRU_LUONG', salary: 'Không' },
        { name: 'Nghỉ việc tạm thời', group: 'TRU_LUONG', salary: 'Không' }
      ],
      nghiVanHanhTypes: ['Mỏ báo nghỉ', 'Mưa', 'Lễ/Tết', 'Xe hỏng', 'Khác'],
      fuelSources: ['Đổ ngoài', 'Cây dầu', 'Nội bộ', 'Khác']
    };
  }

  function catalogNeeds_(formType) {
    var needs = { params: false, people: false, vehicles: false, projects: false, penalties: false, assignments: false };
    if (!formType) {
      return { params: true, people: true, vehicles: true, projects: true, penalties: true, assignments: true };
    }
    if (formType === 'vanChuyen') {
      needs.vehicles = true;
      needs.projects = true;
    } else if (formType === 'taiXe') {
      needs.vehicles = true;
      needs.people = true;
      needs.assignments = true;
    } else if (formType === 'dau') {
      needs.vehicles = true;
    } else if (formType === 'chamCong') {
      needs.people = true;
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
    
    var months = sheet.getRange(1, 7, Math.min(sheet.getLastRow(), 24), 11).getDisplayValues()
      .filter(function (row, index) {
        return index === 0 || row.some(function (cell) { return clean_(cell); });
      });
      
    var activeMonths = [];
    if (months.length > 1) {
      for (var i = 1; i < months.length; i++) {
        var mName = clean_(months[i][0]);
        if (mName && mName !== 'Tháng') {
          activeMonths.push(mName);
        }
      }
    }
    
    var detailsRange = sheet.getRange(4, 1, Math.min(Math.max(sheet.getLastRow() - 3, 1), 14), 5);
    
    if (month === 'Tất cả') {
      var originalMonth = '';
      if (activeMonths.length > 0) {
        originalMonth = clean_(sheet.getRange('B1').getValue());
      }
      
      var aggregatedDetails = [];
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
        
        for (var mIdx = 0; mIdx < activeMonths.length; mIdx++) {
          var mVal = activeMonths[mIdx];
          sheet.getRange('B1').setValue(mVal);
          SpreadsheetApp.flush();
          
          var detailsValues = detailsRange.getValues();
          if (mIdx === 0) {
            for (var r = 0; r < detailsValues.length; r++) {
              aggregatedDetails.push({
                category: clean_(detailsValues[r][0]),
                colB: parseNumberLoose_(detailsValues[r][1]) || 0,
                colC: parseNumberLoose_(detailsValues[r][2]) || 0,
                colD: parseNumberLoose_(detailsValues[r][3]) || 0,
                colE: clean_(detailsValues[r][4])
              });
            }
          } else {
            for (var r = 0; r < detailsValues.length; r++) {
              var cat = clean_(detailsValues[r][0]);
              if (r < aggregatedDetails.length && aggregatedDetails[r].category === cat) {
                aggregatedDetails[r].colB += parseNumberLoose_(detailsValues[r][1]) || 0;
                aggregatedDetails[r].colC += parseNumberLoose_(detailsValues[r][2]) || 0;
                aggregatedDetails[r].colD += parseNumberLoose_(detailsValues[r][3]) || 0;
              }
            }
          }
        }
        
        if (originalMonth) {
          sheet.getRange('B1').setValue(originalMonth);
          SpreadsheetApp.flush();
        }
      } catch (e) {
        console.error('Lỗi tính toán Báo cáo chi tiết Tất cả:', e);
      } finally {
        lock.releaseLock();
      }
      
      var originalDisplay = detailsRange.getDisplayValues();
      var detailsDisplay = [];
      if (originalDisplay.length > 0) {
        detailsDisplay.push(originalDisplay[0]); // Header row
      }
      
      for (var r = 1; r < aggregatedDetails.length; r++) {
        var item = aggregatedDetails[r];
        if (!item.category) continue;
        
        var formatCell = function(val, origStr) {
          var str = clean_(origStr);
          if (str.indexOf('₫') !== -1 || str.indexOf('đ') !== -1) {
            return Math.round(val).toLocaleString('vi-VN') + ' ₫';
          }
          if (typeof val === 'number') {
            return val.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
          }
          return val;
        };
        
        detailsDisplay.push([
          item.category,
          formatCell(item.colB, originalDisplay[r] ? originalDisplay[r][1] : ''),
          formatCell(item.colC, originalDisplay[r] ? originalDisplay[r][2] : ''),
          formatCell(item.colD, originalDisplay[r] ? originalDisplay[r][3] : ''),
          item.colE
        ]);
      }
      
      return { months: months, details: detailsDisplay };
    }
    
    var targetMonth = month;
    if (!targetMonth || targetMonth === 'latest' || targetMonth === 'all') {
      if (months.length > 2) {
        targetMonth = months[months.length - 1][0];
      }
    }
    
    if (targetMonth && targetMonth !== 'Tháng' && targetMonth.trim() !== '') {
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        sheet.getRange('B1').setValue(targetMonth);
        SpreadsheetApp.flush();
      } catch (e) {
        console.error('Lỗi set month B1:', e);
      } finally {
        lock.releaseLock();
      }
    }
    
    var details = sheet.getRange(4, 1, Math.min(Math.max(sheet.getLastRow() - 3, 1), 14), 5).getDisplayValues()
      .filter(function (row) {
        return row.some(function (cell) { return clean_(cell); });
      });
      
    return { months: months, details: details };
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

  function applyFormats_(sheet, formType, startRow, rowCount) {
    if (formType === 'vanChuyen') {
      sheet.getRange(startRow, 1, rowCount, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(startRow, 5, rowCount, 1).setNumberFormat('0');
    } else if (formType === 'taiXe') {
      sheet.getRange(startRow, 1, rowCount, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(startRow, 5, rowCount, 1).setNumberFormat('0');
    } else if (formType === 'dau') {
      sheet.getRange(startRow, 1, rowCount, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(startRow, 5, rowCount, 1).setNumberFormat('#,##0.##');
      sheet.getRange(startRow, 6, rowCount, 2).setNumberFormat('#,##0 ₫');
    } else if (formType === 'chamCong') {
      sheet.getRange(startRow, 1, rowCount, 2).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(startRow, 6, rowCount, 1).setNumberFormat('0.##');
    } else if (formType === 'phat') {
      sheet.getRange(startRow, 1, rowCount, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(startRow, 6, rowCount, 1).setNumberFormat('#,##0 ₫');
    } else if (formType === 'nghiVanHanh') {
      sheet.getRange(startRow, 1, rowCount, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(startRow, 6, rowCount, 2).setNumberFormat('0.##');
      sheet.getRange(startRow, 8, rowCount, 1).setNumberFormat('0.##');
    }
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
    removeChunkedCache_('reports:' + CACHE_VERSION + ':all');
    removeChunkedCache_('dashboard:' + CACHE_VERSION + ':latest');
    removeChunkedCache_('report:' + CACHE_VERSION + ':overview:all');
    removeChunkedCache_('report:' + CACHE_VERSION + ':payroll:all');
    removeChunkedCache_('report:' + CACHE_VERSION + ':vehicles:all');
    removeChunkedCache_('report_bundle:' + CACHE_VERSION + ':all');
    
    try {
      var ss = getSpreadsheet_();
      var overview = readOverviewReport_(ss);
      var parsed = parseOverview_(overview.months);
      parsed.months.forEach(function (m) {
        var mKey = normalizeMonthKey_(m);
        if (mKey) {
          removeChunkedCache_('report_bundle:' + CACHE_VERSION + ':' + mKey);
          removeChunkedCache_('dashboard:' + CACHE_VERSION + ':' + mKey);
        }
      });
    } catch (e) {
      // Fallback if sheet read fails during flush
    }
  }

  function readLatestTrips_(ss) {
    var sheet = ss.getSheetByName('NL_VanChuyen');
    if (!sheet) return { date: '', trips: [] };
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return { date: '', trips: [] };
    var values = sheet.getRange(3, 1, lastRow - 2, 5).getValues();
    
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
    values.forEach(function (row) {
      var d = row[0];
      if (Object.prototype.toString.call(d) === '[object Date]') {
        var dStr = Utilities.formatDate(d, APP_CONFIG.timezone, 'yyyy-MM-dd');
        if (dStr === maxDateStr) {
          var plate = clean_(row[2]);
          var count = parseNumberLoose_(row[4]);
          if (plate && count > 0) {
            tripsMap[plate] = (tripsMap[plate] || 0) + count;
          }
        }
      }
    });
    
    var tripsList = Object.keys(tripsMap).map(function (plate) {
      return { vehicle: plate, count: tripsMap[plate] };
    });
    
    tripsList.sort(function (a, b) {
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

  function readSheetData(sheetName) {
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

      if (lastCol > 0) {
        headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) {
          return String(h).trim();
        });

        if (lastRow > headerRow) {
          var rawValues = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
          for (var i = 0; i < rawValues.length; i++) {
            var rowIndex = headerRow + 1 + i;
            var cells = rawValues[i].map(function (val) {
              if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
                return Utilities.formatDate(val, APP_CONFIG.timezone, 'yyyy-MM-dd');
              }
              return val;
            });
            
            var isEmpty = cells.every(function (cell) {
              return cell === null || cell === undefined || String(cell).trim() === '';
            });
            
            if (!isEmpty) {
              rows.push({
                rowIndex: rowIndex,
                values: cells
              });
            }
          }
        }
      }

      if (sheetName.indexOf('NL_') === 0) {
        rows.sort(function (a, b) {
          return b.rowIndex - a.rowIndex;
        });
      }

      return {
        ok: true,
        headers: headers,
        rows: rows
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
      var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) {
        return String(h).trim();
      });

      var rowNum = parseInt(rowIndex, 10);
      if (isNaN(rowNum) || rowNum <= 0) {
        rowNum = getAppendRow_(sheet, headerRow);
        ensureRows_(sheet, rowNum);
      }

      var valuesToSet = [];
      for (var colIdx = 0; colIdx < headers.length; colIdx++) {
        var header = headers[colIdx];
        var val = rowData[header];

        if (header === 'Tháng' && sheetName.indexOf('NL_') === 0) {
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

      var range = sheet.getRange(rowNum, 1, 1, valuesToSet.length);
      range.setValues([valuesToSet]);

      var formType = null;
      for (var key in APP_CONFIG.sheets) {
        if (APP_CONFIG.sheets[key].name === sheetName) {
          formType = key;
          break;
        }
      }
      if (formType) {
        applyFormats_(sheet, formType, rowNum, 1);
      }

      SpreadsheetApp.flush();
      clearAfterSubmitCache_();

      if (sheetName.indexOf('DM_') === 0) {
        removeChunkedCache_('catalogs:' + CACHE_VERSION + ':all');
        for (var key in APP_CONFIG.sheets) {
          removeChunkedCache_('catalogs:' + CACHE_VERSION + ':' + key);
        }
      }

      return { ok: true, rowIndex: rowNum };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      lock.releaseLock();
    }
  }

  function deleteSheetRow(sheetName, rowIndex) {
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

      sheet.deleteRow(rowNum);

      SpreadsheetApp.flush();
      clearAfterSubmitCache_();

      if (sheetName.indexOf('DM_') === 0) {
        removeChunkedCache_('catalogs:' + CACHE_VERSION + ':all');
        for (var key in APP_CONFIG.sheets) {
          removeChunkedCache_('catalogs:' + CACHE_VERSION + ':' + key);
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
    submitRows: submitRows,
    checkTripReconciliation: checkTripReconciliation,
    readSheetData: readSheetData,
    saveSheetRow: saveSheetRow,
    deleteSheetRow: deleteSheetRow
  };
})();
