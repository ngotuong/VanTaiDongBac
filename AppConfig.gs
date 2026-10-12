var AppConfig = (function () {
  var DEFAULT_SPREADSHEET_ID = '1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA';
  var ACTIVE_SPREADSHEET_ID_PROP = 'ACTIVE_SPREADSHEET_ID';
  var DEFAULT_SPREADSHEET_ID_PROP = 'DEFAULT_SPREADSHEET_ID';
  var YEAR_SPREADSHEET_ID_PREFIX = 'SPREADSHEET_ID_';

  function activate(options) {
    APP_CONFIG = buildConfig_(resolveSpreadsheetId_(options || {}));
    return APP_CONFIG;
  }

  function activateFromEvent(e) {
    var params = e && e.parameter ? e.parameter : {};
    return activate({
      spreadsheetId: params.spreadsheetId || params.ssId,
      year: params.year
    });
  }

  function buildConfig_(spreadsheetId) {
    return {
      spreadsheetId: spreadsheetId,
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

  function resolveSpreadsheetId_(options) {
    var props = PropertiesService.getScriptProperties();
    var requested = clean_(options.spreadsheetId);
    if (requested) return requested;

    var year = clean_(options.year);
    if (year) {
      var byYear = clean_(props.getProperty(YEAR_SPREADSHEET_ID_PREFIX + year));
      if (byYear) return byYear;
    }

    return clean_(props.getProperty(ACTIVE_SPREADSHEET_ID_PROP)) ||
      clean_(props.getProperty(DEFAULT_SPREADSHEET_ID_PROP)) ||
      DEFAULT_SPREADSHEET_ID;
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  return {
    activate: activate,
    activateFromEvent: activateFromEvent
  };
})();

var APP_CONFIG = AppConfig.activate();
