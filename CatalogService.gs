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
      assignments: [],
      params: params,
      chamCongTypes: chamCongTypes,
      nghiVanHanhTypes: ['Mỏ báo nghỉ', 'Mưa', 'Lễ/Tết', 'Xe hỏng', 'Khác'],
      fuelSources: ['Quang Minh', 'Đổ ngoài'],
      fuelPaymentSources: ['Quang Quân', 'Minh Vương', 'Quỹ']
    };
  }

  function catalogNeeds_(formType) {
    var needs = { params: false, people: false, vehicles: false, projects: false, penalties: false, assignments: false, chamCongTypes: false };
    if (!formType) {
      return { params: true, people: true, vehicles: true, projects: true, penalties: true, assignments: false, chamCongTypes: true };
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

  function readCatalogData(displaySheetName) {
    var requestedName = String(displaySheetName || '').trim();
    var sheetName = (requestedName === 'DM_ThamSo_TS' || requestedName === 'DM_ThamSo_GD') ? 'DM_ThamSo' : requestedName;
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
      var colIdx = result.headers.indexOf('DS_TaiXe_DangLam');
      if (colIdx !== -1) {
        result.headers.splice(colIdx, 1);
        result.rows = result.rows.map(function (row) {
          row.values.splice(colIdx, 1);
          return row;
        });
      }
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
    } else if (requestedName === 'DM_ThamSo_GD') {
      result.headers = ['Giá dầu áp dụng', 'Ngày áp dụng giá dầu', 'Ghi chú'];
      result.rows = result.rows.map(function (row) {
        return {
          rowIndex: row.rowIndex,
          values: [row.values[6], row.values[5], row.values[7]]
        };
      }).filter(function (row) {
        return String(row.values[0] || '').trim() !== '';
      });
    }

    if (requestedName !== 'DM_ThamSo_TS' && requestedName !== 'DM_ThamSo_GD') {
      result = projectPrimaryTable_(result);
    }

    return result;
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

  return {
    getCatalogs: getCatalogs,
    readCatalogs: readCatalogs,
    readCatalogData: readCatalogData
  };
})();
