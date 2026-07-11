var ValidationService = (function () {
  function buildRows(formType, rows, catalogs) {
    var values = [];
    var errors = [];
    var warnings = [];
    rows.forEach(function (row, index) {
      var line = index + 1;
      try {
        var built = buildOne_(formType, row || {}, catalogs, line, warnings);
        if (built) values.push(built);
      } catch (err) {
        errors.push('Dong ' + line + ': ' + err.message);
      }
    });
    return { values: values, errors: errors, warnings: warnings };
  }

  function buildOne_(formType, row, catalogs, line, warnings) {
    if (isBlankRow_(row)) return null;
    if (formType === 'vanChuyen') return buildVanChuyen_(row, catalogs, line, warnings);
    if (formType === 'taiXe') return buildTaiXe_(row, catalogs, line, warnings);
    if (formType === 'dau') return buildDau_(row, catalogs, line, warnings);
    if (formType === 'chamCong') return buildChamCong_(row, catalogs, line, warnings);
    if (formType === 'phat') return buildPhat_(row, catalogs, line, warnings);
    if (formType === 'nghiVanHanh') return buildNghiVanHanh_(row, catalogs, line, warnings);
    throw new Error('Loai form khong hop le.');
  }

  function buildVanChuyen_(row, catalogs, line, warnings) {
    var date = requireDate_(row.date, 'Ngay');
    var plate = requireText_(row.vehicle, 'Bien so xe');
    var project = requireText_(row.project, 'Du an');
    var trips = requirePositiveNumber_(row.trips, 'So chuyen');
    warnIfMissing_(catalogs.vehicles, 'plate', plate, 'Dong ' + line + ': Bien so xe chua co trong DM_Xe.', warnings);
    warnIfMissing_(catalogs.projects, 'name', project, 'Dong ' + line + ': Du an chua co trong DM_DuAn.', warnings);
    return [date, '', plate, project, trips, clean_(row.tickets), clean_(row.note)];
  }

  function buildTaiXe_(row, catalogs, line, warnings) {
    var date = requireDate_(row.date, 'Ngay');
    var plate = requireText_(row.vehicle, 'Bien so xe');
    var driver = requireText_(row.driver, 'Tai xe');
    var trips = requirePositiveNumber_(row.trips, 'So chuyen');
    warnIfMissing_(catalogs.vehicles, 'plate', plate, 'Dong ' + line + ': Bien so xe chua co trong DM_Xe.', warnings);
    warnIfMissing_(catalogs.people, 'name', driver, 'Dong ' + line + ': Tai xe chua co trong DM_NhanSu.', warnings);
    return [date, '', plate, driver, trips, clean_(row.note)];
  }

  function buildDau_(row, catalogs, line, warnings) {
    var date = requireDate_(row.date, 'Ngay');
    var plate = requireText_(row.vehicle, 'Bien so xe');
    var source = requireText_(row.source, 'Nguon dau');
    var liters = requirePositiveNumber_(row.liters, 'So lit');
    var price = requirePositiveNumber_(row.price, 'Gia dau');
    warnIfMissing_(catalogs.vehicles, 'plate', plate, 'Dong ' + line + ': Bien so xe chua co trong DM_Xe.', warnings);
    return [date, '', plate, source, liters, price, '', clean_(row.sourcePay), ''];
  }

  function buildChamCong_(row, catalogs, line, warnings) {
    var fromDate = requireDate_(row.fromDate, 'Tu ngay');
    var toDate = requireDate_(row.toDate, 'Den ngay');
    if (toDate.getTime() < fromDate.getTime()) throw new Error('Den ngay phai lon hon hoac bang Tu ngay.');
    var person = requireText_(row.person, 'Nhan su');
    var type = requireText_(row.workdayType, 'Loai ngay cong');
    warnIfMissing_(catalogs.people, 'name', person, 'Dong ' + line + ': Nhan su chua co trong DM_NhanSu.', warnings);
    return [fromDate, toDate, '', person, type, '', '', '', clean_(row.note), '', ''];
  }

  function buildPhat_(row, catalogs, line, warnings) {
    var date = requireDate_(row.date, 'Ngay');
    var person = requireText_(row.person, 'Nhan su');
    var code = requireText_(row.penaltyCode, 'Ma phat');
    warnIfMissing_(catalogs.people, 'name', person, 'Dong ' + line + ': Nhan su chua co trong DM_NhanSu.', warnings);
    return [date, '', person, code, '', '', clean_(row.note)];
  }

  function buildNghiVanHanh_(row, catalogs, line, warnings) {
    var date = requireDate_(row.date, 'Ngay');
    var plate = requireText_(row.vehicle, 'Bien so xe');
    var project = requireText_(row.project, 'Du an');
    var type = requireText_(row.stopType, 'Loai nghi');
    var hours = requirePositiveNumber_(row.hours, 'So gio nghi');
    warnIfMissing_(catalogs.vehicles, 'plate', plate, 'Dong ' + line + ': Bien so xe chua co trong DM_Xe.', warnings);
    warnIfMissing_(catalogs.projects, 'name', project, 'Dong ' + line + ': Du an chua co trong DM_DuAn.', warnings);
    return [date, '', plate, project, type, hours, '', '', clean_(row.note)];
  }

  function isBlankRow_(row) {
    return Object.keys(row).every(function (key) { return clean_(row[key]) === ''; });
  }

  function requireText_(value, label) {
    var text = clean_(value);
    if (!text) throw new Error('Thieu ' + label + '.');
    return text;
  }

  function requireDate_(value, label) {
    var date = parseDate(value);
    if (!date) throw new Error('Thieu hoac sai dinh dang ' + label + '.');
    return date;
  }

  function requirePositiveNumber_(value, label) {
    var number = parseNumber(value, true);
    if (!(number > 0)) throw new Error(label + ' phai lon hon 0.');
    return number;
  }

  function parseDate(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var text = clean_(value);
    if (!text) return null;
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vn) return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]));
    return null;
  }

  function monthDate_(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function daysInclusive_(fromDate, toDate) {
    var oneDay = 24 * 60 * 60 * 1000;
    return Math.round((toDate.getTime() - fromDate.getTime()) / oneDay) + 1;
  }

  function parseNumber(value, required) {
    if (typeof value === 'number') return value;
    var text = clean_(value);
    if (!text) {
      if (required) throw new Error('Thieu so tien/so luong.');
      return 0;
    }
    text = text.replace(/[₫đĐ\s]/g, '');
    var comma = text.lastIndexOf(',');
    var dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (comma >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (dot >= 0) {
      var decimals = text.length - dot - 1;
      if (decimals === 3) text = text.replace(/\./g, '');
    }
    text = text.replace(/,/g, '');
    var number = Number(text);
    if (isNaN(number)) {
      if (required) throw new Error('Gia tri so khong hop le: ' + value);
      return 0;
    }
    return number;
  }

  function findBy_(items, key, value) {
    var normalized = normalize_(value);
    for (var i = 0; i < items.length; i++) {
      if (normalize_(items[i][key]) === normalized) return items[i];
    }
    return null;
  }

  function warnIfMissing_(items, key, value, message, warnings) {
    if (!findBy_(items, key, value)) warnings.push(message);
  }

  function defaultChamCongGroup_(type, catalogs) {
    var found = findBy_(catalogs.chamCongTypes || [], 'name', type);
    return found ? found.group : '';
  }

  function defaultSalary_(type, catalogs) {
    var found = findBy_(catalogs.chamCongTypes || [], 'name', type);
    return found ? found.salary : 'Không';
  }

  function normalize_(value) {
    return clean_(value).toLowerCase();
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  return {
    buildRows: buildRows,
    parseDate: parseDate,
    parseNumber: parseNumber
  };
})();
