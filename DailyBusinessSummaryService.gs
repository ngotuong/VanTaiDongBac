/** Builds one compact, read-only daily operations summary for notifications. */
var DailyBusinessSummaryService = (function () {
  var SOURCE_SHEET = 'XL_VanChuyen';
  var FUEL_SHEET = 'NL_Dau';
  var DRIVER_TRIP_SHEET = 'NL_TaiXe';
  var SALARY_SHEET = 'XL_LuongTheoXe';
  var CACHE_TABLE = 'manage_data_bundles';
  var CACHE_FILTER_KEY = 'daily-summary:latest';
  var MAX_SOURCE_ROWS = 20000;

  function sync(context) {
    var spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
    var source = spreadsheet.getSheetByName(SOURCE_SHEET);
    if (!source) throw new Error('Không tìm thấy sheet ' + SOURCE_SHEET + '.');

    SpreadsheetApp.flush();
    var columns = resolveColumns_(source);
    var columnCount = Math.max(columns.date, columns.vehicle, columns.project, columns.trips, columns.volume, columns.revenue) + 1;
    var availableRows = Math.max(0, source.getLastRow() - 1);
    var rowCount = Math.min(availableRows, MAX_SOURCE_ROWS);
    var startRow = Math.max(2, source.getLastRow() - rowCount + 1);
    var values = rowCount ? source.getRange(startRow, 1, rowCount, columnCount).getValues() : [];
    var today = context.nowDate();
    var summaryDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    var dateKey = context.formatDate(summaryDate, 'yyyy-MM-dd');
    var vehicles = {};
    var projects = {};
    var trips = 0;
    var volume = 0;
    var revenue = 0;
    var matchedRows = 0;

    values.forEach(function (row) {
      var date = parseDate_(row[columns.date]);
      if (!date || context.formatDate(date, 'yyyy-MM-dd') !== dateKey) return;
      matchedRows += 1;
      var vehicle = clean_(row[columns.vehicle]);
      var project = clean_(row[columns.project]);
      if (vehicle) vehicles[vehicle] = true;
      if (project) projects[project] = true;
      [columns.trips, columns.volume, columns.revenue].forEach(function (column) {
        if (typeof row[column] !== 'number' || !isFinite(row[column])) throw new Error('XL_VanChuyen có số liệu không hợp lệ; không xuất bản tổng hợp ngày.');
      });
      trips += row[columns.trips];
      volume += row[columns.volume];
      revenue += row[columns.revenue];
    });

    var fuel = dailyFuelExpense_(spreadsheet, dateKey, context);
    var salary = dailyDriverLaborExpense_(spreadsheet, dateKey, context, trips);

    var syncedAt = context.nowISOString();
    var payload = {
      ok: true,
      date: dateKey,
      displayDate: context.formatDate(summaryDate, 'dd/MM/yyyy'),
      trips: trips,
      volume: volume,
      revenue: revenue,
      fuelExpense: fuel.value,
      fuelAvailable: fuel.available,
      salaryExpense: salary.value,
      salaryAvailable: salary.available,
      tripSalaryExpense: salary.tripSalary || 0,
      fixedSalaryExpense: salary.fixedSalary || 0,
      recruitmentBonusExpense: salary.recruitmentBonus || 0,
      salaryBasis: 'daily-driver-trip-plus-fixed-daily-plus-recruitment-accrual',
      salaryMatchedRows: salary.matchedRows || 0,
      salaryUnmatchedRows: salary.unmatchedRows,
      salaryUnavailableReasons: salary.reasonCounts || {},
      vehicleCount: Object.keys(vehicles).length,
      projectCount: Object.keys(projects).length,
      sourceRows: matchedRows,
      syncedAt: syncedAt
    };
    context.upsertRows(CACHE_TABLE, [{
      sheet_name: context.year + ':' + SOURCE_SHEET,
      filter_key: CACHE_FILTER_KEY,
      payload: payload,
      synced_at: syncedAt
    }], 'sheet_name,filter_key');
    context.writeSyncStatus('daily_business_summary', 'transport', 'ok', 'Daily business summary synced: ' + matchedRows + ' rows.', syncedAt);
    return payload;
  }

  function dailyDriverLaborExpense_(spreadsheet, dateKey, context, transportTrips) {
    try {
      if (typeof PayrollExplanationService !== 'undefined' && PayrollExplanationService && typeof PayrollExplanationService.resolveDailyDriverLabor === 'function') {
        return PayrollExplanationService.resolveDailyDriverLabor(spreadsheet, dateKey, { transportTrips: transportTrips });
      }
      var trip = dailyTripSalaryExpense_(spreadsheet, dateKey, context, transportTrips);
      return {
        available: false,
        value: 0,
        tripSalary: trip.value || 0,
        fixedSalary: 0,
        recruitmentBonus: 0,
        matchedRows: trip.matchedRows || 0,
        unmatchedRows: trip.unmatchedRows || 0,
        reasonCounts: { DAILY_DRIVER_LABOR_RESOLVER_MISSING: 1 }
      };
    } catch (error) {
      return { available: false, value: 0, tripSalary: 0, fixedSalary: 0, recruitmentBonus: 0, matchedRows: 0, unmatchedRows: 0, reasonCounts: { DAILY_DRIVER_LABOR_FAILED: 1 } };
    }
  }

  function dailyFuelExpense_(spreadsheet, dateKey, context) {
    try {
      var sheet = spreadsheet.getSheetByName(FUEL_SHEET);
      if (!sheet) return { available: false, value: 0 };
      var columns = resolveNamedColumns_(sheet, 2, {
        date: ['Ngày'],
        amount: ['Thành tiền']
      }, FUEL_SHEET);
      var rows = readRecentRows_(sheet, 2, Math.max(columns.date, columns.amount) + 1, MAX_SOURCE_ROWS);
      var value = rows.reduce(function (sum, row) {
        var date = parseDate_(row[columns.date]);
        if (!date || context.formatDate(date, 'yyyy-MM-dd') !== dateKey) return sum;
        var rawAmount = row[columns.amount];
        if (typeof rawAmount !== 'number' || !isFinite(rawAmount)) throw new Error('Thành tiền dầu không phải số hợp lệ.');
        return sum + rawAmount;
      }, 0);
      return { available: true, value: value };
    } catch (error) {
      return { available: false, value: 0 };
    }
  }

  function dailyTripSalaryExpense_(spreadsheet, dateKey, context, transportTrips) {
    try {
      if (typeof PayrollExplanationService !== 'undefined' && PayrollExplanationService && typeof PayrollExplanationService.resolveDailyTripSalary === 'function') {
        return PayrollExplanationService.resolveDailyTripSalary(spreadsheet, dateKey, { transportTrips: transportTrips });
      }
      var tripSheet = spreadsheet.getSheetByName(DRIVER_TRIP_SHEET);
      var salarySheet = spreadsheet.getSheetByName(SALARY_SHEET);
      if (!tripSheet || !salarySheet) return { available: false, value: 0, unmatchedRows: 0 };
      var tripColumns = resolveNamedColumns_(tripSheet, 1, {
        date: ['Ngày'],
        month: ['Tháng'],
        vehicle: ['Biển số', 'Biển số xe'],
        driver: ['Tài xế'],
        trips: ['Số chuyến']
      }, DRIVER_TRIP_SHEET);
      var salaryColumns = resolveNamedColumns_(salarySheet, 1, {
        month: ['Tháng'],
        vehicle: ['Biển số', 'Biển số xe'],
        driver: ['Tài xế'],
        personalTrips: ['Cá nhân'],
        calculationType: ['Loại tính'],
        rate: ['Đơn giá'],
        finalSalary: ['Lương chuyến cuối', 'Lương chuyến']
      }, SALARY_SHEET);
      var salaryRows = readRecentRows_(salarySheet, 1, Math.max(salaryColumns.month, salaryColumns.vehicle, salaryColumns.driver, salaryColumns.personalTrips, salaryColumns.calculationType, salaryColumns.rate, salaryColumns.finalSalary) + 1, 10000);
      var rates = {};
      salaryRows.forEach(function (row) {
        var key = salaryKey_(monthKey_(row[salaryColumns.month]), row[salaryColumns.driver], row[salaryColumns.vehicle]);
        if (!key) return;
        var rate = number_(row[salaryColumns.rate]);
        var personalTrips = number_(row[salaryColumns.personalTrips]);
        var calculationType = normalize_(row[salaryColumns.calculationType]);
        var mixedRate = calculationType.indexOf('hon hop') !== -1 || calculationType.indexOf('hon_hop') !== -1 || calculationType.indexOf('mixed') !== -1;
        if (!(rate > 0) && personalTrips > 0 && !mixedRate) rate = number_(row[salaryColumns.finalSalary]) / personalTrips;
        if (rate > 0 && isFinite(rate)) rates[key] = rate;
      });

      var tripRows = readRecentRows_(tripSheet, 1, Math.max(tripColumns.date, tripColumns.month, tripColumns.vehicle, tripColumns.driver, tripColumns.trips) + 1, MAX_SOURCE_ROWS);
      var value = 0;
      var matchedRows = 0;
      var unmatchedRows = 0;
      tripRows.forEach(function (row) {
        var date = parseDate_(row[tripColumns.date]);
        if (!date || context.formatDate(date, 'yyyy-MM-dd') !== dateKey) return;
        var trips = number_(row[tripColumns.trips]);
        if (!trips) return;
        var key = salaryKey_(monthKey_(row[tripColumns.month]) || monthKey_(date), row[tripColumns.driver], row[tripColumns.vehicle]);
        if (!key || !Object.prototype.hasOwnProperty.call(rates, key)) {
          unmatchedRows += 1;
          return;
        }
        matchedRows += 1;
        value += trips * rates[key];
      });
      var available = unmatchedRows === 0 && (matchedRows > 0 || !(transportTrips > 0));
      return { available: available, value: value, unmatchedRows: unmatchedRows };
    } catch (error) {
      return { available: false, value: 0, unmatchedRows: 0 };
    }
  }

  function readRecentRows_(sheet, headerRow, columnCount, limit) {
    var availableRows = Math.max(0, sheet.getLastRow() - headerRow);
    var rowCount = Math.min(availableRows, limit);
    var startRow = Math.max(headerRow + 1, sheet.getLastRow() - rowCount + 1);
    return rowCount ? sheet.getRange(startRow, 1, rowCount, columnCount).getValues() : [];
  }

  function resolveNamedColumns_(sheet, headerRow, namesByKey, sheetName) {
    var headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(clean_);
    var result = {};
    Object.keys(namesByKey).forEach(function (key) {
      var names = namesByKey[key];
      var index = headers.findIndex(function (header) { return names.indexOf(header) !== -1; });
      if (index < 0) throw new Error('Thiếu cột ' + names[0] + ' trong sheet ' + sheetName + '.');
      result[key] = index;
    });
    return result;
  }

  function monthKey_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return String(value.getMonth() + 1).padStart(2, '0') + '/' + value.getFullYear();
    }
    var text = clean_(value);
    var match = text.match(/^(\d{1,2})\/(20\d{2})$/);
    if (match) return String(match[1]).padStart(2, '0') + '/' + match[2];
    var date = parseDate_(value);
    return date ? String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear() : '';
  }

  function salaryKey_(month, driver, vehicle) {
    var parts = [month, clean_(driver).toLowerCase(), clean_(vehicle).toLowerCase()];
    return parts.every(Boolean) ? parts.join('|') : '';
  }

  function resolveColumns_(sheet) {
    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(clean_);
    function required_(names, label) {
      for (var index = 0; index < headers.length; index += 1) {
        if (names.indexOf(headers[index]) !== -1) return index;
      }
      throw new Error('Thiếu cột ' + label + ' trong sheet ' + SOURCE_SHEET + '.');
    }
    return {
      date: required_(['Ngày'], 'Ngày'),
      vehicle: required_(['Biển số', 'Biển số xe'], 'Biển số'),
      project: required_(['Dự án'], 'Dự án'),
      trips: required_(['Số chuyến'], 'Số chuyến'),
      volume: required_(['Khối lượng', 'Tổng khối lượng'], 'Khối lượng'),
      revenue: required_(['Doanh thu', 'Doanh thu ước tính'], 'Doanh thu')
    };
  }

  function parseDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    var text = clean_(value);
    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!vn) return null;
    return new Date(Number(vn[3].length === 2 ? '20' + vn[3] : vn[3]), Number(vn[2]) - 1, Number(vn[1]));
  }

  function number_(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    var normalized = clean_(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    var parsed = Number(normalized);
    return isFinite(parsed) ? parsed : 0;
  }

  function clean_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  function normalize_(value) {
    return clean_(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }

  return { sync: sync };
})();
