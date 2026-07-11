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
        vanChuyen: { name: 'NL_VanChuyen', headerRow: 2, columns: 7 },
        taiXe: { name: 'NL_TaiXe', headerRow: 1, columns: 6 },
        dau: { name: 'NL_Dau', headerRow: 2, columns: 9 },
        chamCong: { name: 'NL_ChamCong', headerRow: 1, columns: 11 },
        phat: { name: 'NL_Phat', headerRow: 1, columns: 7 },
        nghiVanHanh: { name: 'NL_NghiVanHanh', headerRow: 1, columns: 9 }
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
