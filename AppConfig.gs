var AppConfig = (function () {
  var DEFAULT_SPREADSHEET_ID = '1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA';
  var LEGACY_WORKBOOK_YEAR = '2026';
  var ACTIVE_SPREADSHEET_ID_PROP = 'ACTIVE_SPREADSHEET_ID';
  var DEFAULT_SPREADSHEET_ID_PROP = 'DEFAULT_SPREADSHEET_ID';
  var ACTIVE_WORKBOOK_YEAR_PROP = 'ACTIVE_WORKBOOK_YEAR';
  var DEFAULT_WORKBOOK_YEAR_PROP = 'DEFAULT_WORKBOOK_YEAR';
  var YEAR_SPREADSHEET_ID_PREFIX = 'SPREADSHEET_ID_';

  function activate(options) {
    var workbook = resolveWorkbook_(options || {});
    APP_CONFIG = buildConfig_(workbook.spreadsheetId, workbook.year);
    return APP_CONFIG;
  }

  function activateFromEvent(e) {
    var params = e && e.parameter ? e.parameter : {};
    return activate({
      spreadsheetId: params.spreadsheetId || params.ssId,
      year: params.year
    });
  }

  function assertWritableYear(year) {
    // Resolve the operational default independently of the request's APP_CONFIG.
    // Selecting a configured historical/future workbook only grants read access.
    var activeYear = resolveWorkbook_({}).year;
    var requestedYear = clean_(year) || activeYear;
    if (requestedYear !== activeYear) throw new Error('Năm ' + requestedYear + ' đã khóa chỉ đọc. Hãy chuyển sang năm ' + activeYear + ' để ghi dữ liệu.');
    return activeYear;
  }

  function buildConfig_(spreadsheetId, year) {
    return {
      spreadsheetId: spreadsheetId,
      year: year,
      timezone: 'Asia/Saigon',
      sheets: {
        vanChuyen: {
          name: 'NL_VanChuyen', headerRow: 2, columns: 8,
          headers: ['Ngày', 'Tháng', 'Biển số', 'Dự án', 'Số chuyến', 'Số phiếu', 'Ghi chú', 'Khối lượng thực tế (m³)'],
          headerAliases: {
            'Biển số': ['Biển số xe'],
            'Khối lượng thực tế (m³)': ['Khối lượng', 'Khối lượng thực tế', 'Khối lượng (m³)']
          },
          computedHeaders: ['Tháng']
        },
        taiXe: {
          name: 'NL_TaiXe', headerRow: 1, columns: 7,
          headers: ['Ngày', 'Tháng', 'Biển số', 'Nhóm vận hành', 'Tài xế', 'Số chuyến', 'Ghi chú'],
          computedHeaders: ['Tháng']
        },
        dau: {
          name: 'NL_Dau', headerRow: 2, columns: 10,
          headers: ['Ngày', 'Tháng', 'Biển số', 'Nguồn dầu', 'Số lít', 'Giá dầu', 'Thành tiền', 'Nguồn chi', 'Công ty sở hữu', 'Ghi Chú'],
          computedHeaders: ['Tháng', 'Thành tiền', 'Công ty sở hữu']
        },
        chamCong: {
          name: 'NL_ChamCong', headerRow: 1, columns: 11,
          headers: ['Từ ngày', 'Đến ngày', 'Tháng', 'Nhân sự', 'Hình thức', 'Số ngày', 'Tính lương cứng', 'Nhóm xử lý', 'Ghi chú', 'Loại ngày công hợp lệ', 'Lưu ý'],
          computedHeaders: ['Tháng', 'Số ngày', 'Tính lương cứng', 'Nhóm xử lý', 'Loại ngày công hợp lệ', 'Lưu ý']
        },
        phat: {
          name: 'NL_Phat', headerRow: 1, columns: 7,
          headers: ['Ngày', 'Tháng', 'Nhân sự', 'Mã phạt', 'Nội dung phạt', 'Số tiền phạt', 'Ghi chú'],
          computedHeaders: ['Tháng', 'Nội dung phạt', 'Số tiền phạt']
        },
        nghiVanHanh: {
          name: 'NL_NghiVanHanh', headerRow: 1, columns: 10,
          headers: ['Ngày', 'Tháng', 'Biển số xe', 'Dự án', 'Loại nghỉ', 'Số giờ nghỉ', 'Tính KPI?', 'Giảm KPI', 'Lý do', 'Kiểm tra'],
          computedHeaders: ['Tháng', 'Tính KPI?', 'Giảm KPI', 'Kiểm tra']
        },
        phanCongLai: {
          name: 'NL_PhanCongLai', headerRow: 1, columns: 5,
          headers: ['Tháng', 'Tài xế', 'Công ty', 'Ghi chú', 'Kiểm tra'],
          computedHeaders: ['Kiểm tra']
        }
      }
    };
  }

  function resolveWorkbook_(options) {
    var props = PropertiesService.getScriptProperties();
    var requested = clean_(options.spreadsheetId);
    var year = clean_(options.year);
    if (year && !/^20\d{2}$/.test(year)) throw new Error('Năm workbook không hợp lệ: ' + year);
    if (year) {
      var byYear = clean_(props.getProperty(YEAR_SPREADSHEET_ID_PREFIX + year));
      var legacyActiveId = clean_(props.getProperty(ACTIVE_SPREADSHEET_ID_PROP)) ||
        clean_(props.getProperty(DEFAULT_SPREADSHEET_ID_PROP)) || DEFAULT_SPREADSHEET_ID;
      if (!byYear && year === LEGACY_WORKBOOK_YEAR && (!requested || requested === legacyActiveId)) {
        return { spreadsheetId: legacyActiveId, year: year };
      }
      if (!byYear) throw new Error('Chưa cấu hình workbook Vận tải cho năm ' + year + '.');
      if (requested && byYear && requested !== byYear) throw new Error('Workbook không khớp cấu hình năm ' + year + '.');
      return { spreadsheetId: byYear, year: year };
    }

    if (requested) {
      var inferredRequestedYear = inferYearForSpreadsheet_(props, requested);
      if (!inferredRequestedYear) throw new Error('Không xác định được năm của workbook Vận tải đã yêu cầu.');
      return { spreadsheetId: requested, year: inferredRequestedYear };
    }

    var activeYear = clean_(props.getProperty(ACTIVE_WORKBOOK_YEAR_PROP)) || clean_(props.getProperty(DEFAULT_WORKBOOK_YEAR_PROP));
    var activeSpreadsheetId = clean_(props.getProperty(ACTIVE_SPREADSHEET_ID_PROP)) ||
      clean_(props.getProperty(DEFAULT_SPREADSHEET_ID_PROP)) ||
      DEFAULT_SPREADSHEET_ID;
    if (activeYear) {
      if (!/^20\d{2}$/.test(activeYear)) throw new Error('ACTIVE_WORKBOOK_YEAR không hợp lệ.');
      var configuredId = clean_(props.getProperty(YEAR_SPREADSHEET_ID_PREFIX + activeYear));
      if (configuredId && activeSpreadsheetId && configuredId !== activeSpreadsheetId) {
        throw new Error('ACTIVE_WORKBOOK_YEAR không khớp ACTIVE_SPREADSHEET_ID.');
      }
      return { spreadsheetId: configuredId || activeSpreadsheetId, year: activeYear };
    }
    var inferredYear = inferYearForSpreadsheet_(props, activeSpreadsheetId);
    if (!inferredYear && activeSpreadsheetId === DEFAULT_SPREADSHEET_ID) inferredYear = LEGACY_WORKBOOK_YEAR;
    if (!inferredYear) throw new Error('Thiếu ACTIVE_WORKBOOK_YEAR cho workbook Vận tải hiện hành.');
    return { spreadsheetId: activeSpreadsheetId, year: inferredYear };
  }

  function inferYearForSpreadsheet_(props, spreadsheetId) {
    var values = props.getProperties ? props.getProperties() : {};
    var matches = Object.keys(values).filter(function (key) {
      return key.indexOf(YEAR_SPREADSHEET_ID_PREFIX) === 0 && clean_(values[key]) === spreadsheetId;
    }).map(function (key) { return key.slice(YEAR_SPREADSHEET_ID_PREFIX.length); }).filter(function (value) {
      return /^20\d{2}$/.test(value);
    });
    return matches.length === 1 ? matches[0] : '';
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  return {
    activate: activate,
    assertWritableYear: assertWritableYear,
    activateFromEvent: activateFromEvent
  };
})();

var APP_CONFIG = AppConfig.activate();
