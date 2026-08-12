var CatalogService = (function () {
  function getCatalogs(formType) {
    return SheetService.getCatalogs(formType);
  }

  function readCatalogs(ss, formType) {
    var needs = catalogNeeds_(formType);
    var params = needs.params ? readParams_(ss) : {};
    var peopleRows = needs.people ? readRows_(ss, 'DM_NhanSu') : [];
    var vehicleRows = needs.vehicles ? readRows_(ss, 'DM_Xe') : [];
    var projectRows = needs.projects ? readRows_(ss, 'DM_DuAn') : [];
    var penaltyRows = needs.penalties ? readRows_(ss, 'DM_PhatNoiBo') : [];
    var assignmentRows = needs.assignments ? readRows_(ss, 'DM_PhanCongXe') : [];
    var chamCongTypes = needs.chamCongTypes ? readChamCongTypes_(ss) : [];
    var fuelSources = needs.fuelOptions ? readColumnOptions_(ss, 'NL_Dau', 2, ['Nguồn dầu']) : [];
    var fuelPaymentSources = needs.fuelOptions ? readColumnOptions_(ss, 'NL_Dau', 2, ['Nguồn chi']) : [];
    var nghiVanHanhTypes = needs.stopTypes ? readColumnOptions_(ss, 'NL_NghiVanHanh', 1, ['Loại nghỉ']) : [];
    var companies = needs.companies ? readColumnOptions_(ss, 'DM_Xe', 1, ['Công ty sở hữu']) : [];

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
        plate: clean_(row[1]),
        status: clean_(row[5]),
        owner: clean_(row[7])
      };
    }).filter(function (item) { return item.plate; });

    var projects = projectRows.map(function (row) {
      return {
        name: clean_(row[0]),
        distanceKm: parseNumber_(row[1])
      };
    }).filter(function (item) { return item.name; });

    var penalties = penaltyRows.map(function (row) {
      return {
        code: clean_(row[0]),
        content: clean_(row[1]),
        amount: parseNumber_(row[2]),
        status: clean_(row[3])
      };
    }).filter(function (item) { return item.code; });

    var activeVehicles = vehicles.filter(function (item) {
      return item.status === 'Dang chay' || item.status === 'Đang chạy';
    });
    var activePeople = people.filter(function (item) {
      return item.status === 'Dang lam' || item.status === 'Đang làm';
    });
    var activeDrivers = people.filter(function (item) {
      return (item.status === 'Dang lam' || item.status === 'Đang làm') && item.role === 'Tài xế';
    });
    var assignments = assignmentRows.map(function (row) {
      return {
        plate: clean_(row[0]),
        operationGroup: clean_(row[1]),
        startDate: formatDateValue_(row[2]),
        endDate: formatDateValue_(row[3]),
        note: clean_(row[4]),
        status: clean_(row[5])
      };
    }).filter(function (item) { return item.plate && item.operationGroup && item.startDate; });
    var operationGroupValues = needs.projects ? readColumnOptions_(ss, 'SYS_DanhSach', 1, ['DS_NhomVanHanh']) : [];
    if (!operationGroupValues.length) {
      operationGroupValues = projectRows.map(function (row) { return clean_(row[8]); });
    }
    var operationGroups = uniqueNamed_(operationGroupValues.map(function (name) {
      return { name: clean_(name) };
    }));

    return {
      vehicles: vehicles,
      activeVehicles: activeVehicles,
      people: people,
      activePeople: activePeople,
      activeDrivers: activeDrivers,
      projects: projects,
      penalties: penalties,
      activePenalties: penalties.filter(function (item) {
        return item.status === 'Dang ap dung' || item.status === 'Đang áp dụng';
      }),
      assignments: assignments,
      operationGroups: operationGroups,
      params: params,
      chamCongTypes: chamCongTypes,
      nghiVanHanhTypes: nghiVanHanhTypes,
      fuelSources: fuelSources,
      fuelPaymentSources: fuelPaymentSources,
      companies: companies
    };
  }

  function catalogNeeds_(formType) {
    var needs = { params: false, people: false, vehicles: false, projects: false, penalties: false, assignments: false, chamCongTypes: false, fuelOptions: false, stopTypes: false, companies: false };
    if (!formType) {
      return { params: true, people: true, vehicles: true, projects: true, penalties: true, assignments: false, chamCongTypes: true, fuelOptions: true, stopTypes: true, companies: true };
    }
    if (formType === 'vanChuyen') {
      needs.vehicles = true;
      needs.projects = true;
    } else if (formType === 'taiXe') {
      needs.vehicles = true;
      needs.people = true;
      needs.projects = true;
    } else if (formType === 'dau') {
      needs.vehicles = true;
      needs.fuelOptions = true;
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
      needs.assignments = true;
      needs.stopTypes = true;
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

  function uniqueStrings_(values) {
    var seen = {};
    var result = [];
    (values || []).forEach(function (value) {
      var text = clean_(value);
      var key = text.toLowerCase();
      if (!text || seen[key]) return;
      seen[key] = true;
      result.push(text);
    });
    return result;
  }

  function validationOptions_(range) {
    if (!range || typeof range.getDataValidations !== 'function') return [];
    var result = [];
    range.getDataValidations().forEach(function (row) {
      row.forEach(function (rule) {
        if (!rule) return;
        var criteria = rule.getCriteriaType();
        var values = rule.getCriteriaValues();
        if (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
          result = result.concat(values[0] || []);
        } else if (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && values[0]) {
          values[0].getDisplayValues().forEach(function (sourceRow) {
            result = result.concat(sourceRow);
          });
        }
      });
    });
    return uniqueStrings_(result);
  }

  function readColumnOptions_(ss, sheetName, headerRow, headerNames) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastColumn() < 1) return [];
    var headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    var wanted = (headerNames || []).map(function (header) { return normalizeCatalogHeader_(header); });
    var column = -1;
    headers.some(function (header, index) {
      if (wanted.indexOf(normalizeCatalogHeader_(header)) < 0) return false;
      column = index + 1;
      return true;
    });
    if (column < 1) return [];
    var startRow = headerRow + 1;
    var rowCount = Math.max(1, Math.min(Math.max(sheet.getLastRow(), startRow) - startRow + 1, 500));
    var range = sheet.getRange(startRow, column, rowCount, 1);
    var validationValues = validationOptions_(range);
    if (validationValues.length) return validationValues;
    return uniqueStrings_(range.getDisplayValues().map(function (row) { return row[0]; }));
  }

  function normalizeCatalogHeader_(value) {
    return String(value || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9?]+/g, ' ').trim();
  }

  function readCatalogFieldOptions_(sheetName, result) {
    var optionHeaders = {
      DM_DuAn: ['Nhóm vận hành', 'Áp dụng lương chuyến?', 'Áp dụng thưởng QL?'],
      DM_NhanSu: ['Chức vụ', 'Người tuyển', 'Trạng Thái', 'Công ty'],
      DM_Xe: ['Loại xe', 'Trạng thái', 'Công ty sở hữu'],
      DM_CheDoLuong: ['Chế độ lương'],
      DM_LuongChuyen: ['Mã loại tính', 'Nhóm vận hành'],
      DM_DonGiaVanChuyen: ['Cách tính'],
      DM_ThuongQuanLy: ['Trạng thái', 'Nhóm vận hành'],
      DM_PhatNoiBo: ['Trạng thái'],
      DM_PhanCongXe: ['Nhóm vận hành']
    };
    var requested = optionHeaders[sheetName] || [];
    if (!requested.length) return {};
    var options = {};
    var spreadsheet;
    try { spreadsheet = SpreadsheetApp.openById(APP_CONFIG.spreadsheetId); } catch (error) { spreadsheet = null; }
    requested.forEach(function (requestedHeader) {
      var headerIndex = (result.headers || []).findIndex(function (header) {
        return normalizeCatalogHeader_(header) === normalizeCatalogHeader_(requestedHeader);
      });
      if (headerIndex < 0) return;
      var header = result.headers[headerIndex];
      var values = spreadsheet ? readColumnOptions_(spreadsheet, sheetName, 1, [header]) : [];
      if (values.length) options[header] = values;
    });
    return options;
  }

  function readParams_(ss) {
    var sheet = ss.getSheetByName('DM_ThamSo');
    var params = {};
    if (!sheet || sheet.getLastRow() < 2) return params;
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    rows.forEach(function (row) {
      var key = clean_(row[0]);
      if (key) params[key] = parseNumber_(row[2]);
    });
    return params;
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  function parseNumber_(value) {
    return ValidationService.parseNumber(value, false);
  }

  function formatDateValue_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, APP_CONFIG.timezone, 'yyyy-MM-dd');
    }
    return clean_(value);
  }

  function uniqueNamed_(items) {
    var seen = {};
    return (items || []).filter(function (item) {
      var key = clean_(item && item.name).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function readCatalogData(displaySheetName) {
    var requestedName = String(displaySheetName || '').trim();
    var sheetName = requestedName === 'DM_ThamSo_TS' ? 'DM_ThamSo' : requestedName;
    var data = SheetReadService.readSheetData(sheetName, '', '', 500);
    if (!data || data.ok === false) return data;

    var result = {
      ok: true,
      headers: (data.headers || []).slice(),
      rows: (data.rows || []).map(function (row) {
        return { rowIndex: row.rowIndex, values: (row.values || []).slice() };
      }),
      isLimited: Boolean(data.isLimited),
      sourceSheetName: sheetName,
      displaySheetName: requestedName || sheetName
    };

    if (requestedName === 'DM_NhanSu') {
      // DM_NhanSu contains a formula spill column between Trạng Thái and Công ty.
      // Its workbook label has changed over time (for example
      // DS_TaiXe_DangLam and Cột 11), so expose only the stable business fields
      // instead of relying on one helper-column name.
      result = projectColumns_(result, [
        'Nhân sự', 'Chức vụ', 'Người tuyển', 'Tính thưởng', 'Dừng thưởng',
        'Ngày vào', 'Ngày nghỉ', 'Lương cứng', 'Nghỉ chuẩn', 'Trạng Thái',
        'Công ty'
      ]);
    } else if (requestedName === 'DM_ThamSo_TS') {
      result.headers = ['Mã tham số', 'Tên tham số', 'Giá trị', 'Ngày áp dụng tham số'];
      result.rows = result.rows.map(function (row) {
        return {
          rowIndex: row.rowIndex,
          values: [row.values[0], row.values[1], row.values[2], row.values[3]]
        };
      }).filter(function (row) {
        return String(row.values[0] || '').trim() !== '';
      });
    }

    if (requestedName !== 'DM_ThamSo_TS') {
      result = projectPrimaryTable_(result);
    }
    result.editableHeaders = editableHeadersForSheet_(requestedName, result.headers);
    result.fieldOptions = readCatalogFieldOptions_(requestedName, result);

    return result;
  }

  function editableHeadersForSheet_(sheetName, headers) {
    var explicit = {
      DM_DuAn: ['Tên dự án', 'Số km', 'Từ ngày', 'Đến ngày', 'Ghi chú', 'Áp dụng lương chuyến?', 'Áp dụng thưởng QL?'],
      DM_Xe: ['Biển số xe', 'Biển số rơ mooc', 'Khối lượng', 'Loại xe', 'Trạng thái', 'Ghi chú', 'Công ty sở hữu'],
      DM_NhanSu: ['Nhân sự', 'Chức vụ', 'Người tuyển', 'Tính thưởng', 'Dừng thưởng', 'Ngày vào', 'Ngày nghỉ', 'Lương cứng', 'Nghỉ chuẩn', 'Công ty'],
      DM_CheDoLuong: ['Nhân sự', 'Chế độ lương', 'Mức khoán', 'Hiệu lực từ', 'Hiệu lực đến', 'Dự án', 'Ghi chú'],
      DM_PhanCongXe: ['Biển số xe', 'Nhóm vận hành', 'Hiệu lực từ', 'Hiệu lực đến', 'Ghi chú'],
      // Column C is labelled "Ghi chú" in the live workbook, but rows 3+
      // contain the price-delta formula. Keep it read-only so an append copies
      // the preceding formula instead of replacing it with user input.
      DM_GiaDau: ['Ngày áp dụng', 'Giá dầu áp dụng'],
      DM_UuDaiNoiBo: ['Dự án', 'Ưu đãi nội bộ', 'Hiệu lực từ', 'Hiệu lực đến', 'Ghi chú']
    };
    if (sheetName === 'DM_ThamSo_TS') return ['Mã tham số', 'Tên tham số', 'Giá trị', 'Ngày áp dụng tham số'];
    var allowed = explicit[sheetName] || headers;
    return allowed.filter(function (header) { return headers.indexOf(header) !== -1; });
  }

  function projectPrimaryTable_(result) {
    var width = (result.headers || []).length;
    for (var index = 0; index < width; index++) {
      if (String(result.headers[index] || '').trim() === '') {
        width = index;
        break;
      }
    }
    result.headers = (result.headers || []).slice(0, width);
    result.rows = (result.rows || []).map(function (row) {
      return {
        rowIndex: row.rowIndex,
        values: (row.values || []).slice(0, width)
      };
    }).filter(function (row) {
      return row.values.some(function (value) {
        return value !== null && value !== undefined && String(value).trim() !== '';
      });
    });
    return result;
  }

  function projectColumns_(result, allowedHeaders) {
    var allowed = {};
    (allowedHeaders || []).forEach(function (header) {
      allowed[String(header || '').trim().toLowerCase()] = true;
    });
    var indexes = [];
    (result.headers || []).forEach(function (header, index) {
      if (allowed[String(header || '').trim().toLowerCase()]) indexes.push(index);
    });
    result.headers = indexes.map(function (index) { return result.headers[index]; });
    result.rows = (result.rows || []).map(function (row) {
      return {
        rowIndex: row.rowIndex,
        values: indexes.map(function (index) { return (row.values || [])[index]; })
      };
    });
    return result;
  }

  return {
    getCatalogs: getCatalogs,
    readCatalogs: readCatalogs,
    readCatalogData: readCatalogData
  };
})();
