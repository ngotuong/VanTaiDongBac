var FundService = (function () {
  var DEFAULT_FUND_SPREADSHEET_ID = '1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw';
  var FUND_SPREADSHEET_ID_PROP = 'FUND_SPREADSHEET_ID';
  var FUND_SPREADSHEET_ID_PREFIX = 'FUND_SPREADSHEET_ID_';
  var CASHFLOW_SPREADSHEET_ID_PREFIX = 'CASHFLOW_SPREADSHEET_ID_';
  var TRANSACTION_SHEET_NAME = 'NHAP_THUCHI';
  var TRANSACTION_HEADERS = [
    'Số phiếu',
    'Ngày',
    'MỤC THU',
    'MỤC CHI',
    'Hình thức',
    'Số tiền',
    'Người Thu/Chi',
    'Đối tác',
    'Nội dung',
    'Công nợ'
  ];

  function getFundTransactions(year, filter) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    }

    var options = filter || {};
    var selectedMonth = normalizeMonthKey_(options.month);
    var limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 300, 1000));
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), TRANSACTION_HEADERS.length);

    if (lastRow < 2) {
      return {
        ok: true,
        year: clean_(year) || '',
        sheetName: TRANSACTION_SHEET_NAME,
        headers: TRANSACTION_HEADERS,
        months: [],
        transactions: []
      };
    }

    var headerValues = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var displayValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    var rawDateValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var transactions = [];
    var monthMap = {};

    for (var i = 0; i < displayValues.length; i++) {
      var row = displayValues[i];
      var rawDate = rawDateValues[i][0];
      var hasBusinessData = row.slice(0, TRANSACTION_HEADERS.length).some(function (cell) {
        return clean_(cell);
      });
      if (!hasBusinessData) continue;

      var parsedDate = parseDate_(rawDate, row[1]);
      var monthKey = parsedDate ? Utilities.formatDate(parsedDate, APP_CONFIG.timezone, 'yyyy-MM') : '';
      var monthLabel = parsedDate ? Utilities.formatDate(parsedDate, APP_CONFIG.timezone, 'MM/yyyy') : '';
      if (monthKey) monthMap[monthKey] = monthLabel;
      if (selectedMonth && monthKey !== selectedMonth) continue;

      var incomeCategory = clean_(row[2]);
      var expenseCategory = clean_(row[3]);
      transactions.push({
        rowIndex: i + 2,
        voucher: clean_(row[0]),
        date: parsedDate ? Utilities.formatDate(parsedDate, APP_CONFIG.timezone, 'yyyy-MM-dd') : clean_(row[1]),
        dateText: clean_(row[1]),
        month: monthKey,
        monthLabel: monthLabel,
        type: incomeCategory ? 'Thu' : (expenseCategory ? 'Chi' : ''),
        category: incomeCategory || expenseCategory,
        incomeCategory: incomeCategory,
        expenseCategory: expenseCategory,
        method: clean_(row[4]),
        amount: parseNumber_(row[5]),
        amountText: clean_(row[5]),
        actor: clean_(row[6]),
        partner: clean_(row[7]),
        content: clean_(row[8]),
        debt: clean_(row[9])
      });
    }

    transactions.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.rowIndex - a.rowIndex;
    });

    var months = Object.keys(monthMap).sort().reverse().map(function (key) {
      return { key: key, label: monthMap[key] };
    });

    return {
      ok: true,
      year: clean_(year) || '',
      sheetName: TRANSACTION_SHEET_NAME,
      headers: headerValues.slice(0, TRANSACTION_HEADERS.length),
      months: months,
      selectedMonth: selectedMonth,
      transactions: transactions.slice(0, limit),
      totalRows: transactions.length,
      limited: transactions.length > limit
    };
  }

  function getFundSpreadsheet_(year) {
    var spreadsheetId = resolveFundSpreadsheetId_(year);
    return SpreadsheetApp.openById(spreadsheetId);
  }

  function resolveFundSpreadsheetId_(year) {
    var props = PropertiesService.getScriptProperties();
    var normalizedYear = clean_(year);
    if (normalizedYear) {
      var fundByYear = clean_(props.getProperty(FUND_SPREADSHEET_ID_PREFIX + normalizedYear));
      if (fundByYear) return fundByYear;
      var cashflowByYear = clean_(props.getProperty(CASHFLOW_SPREADSHEET_ID_PREFIX + normalizedYear));
      if (cashflowByYear) return cashflowByYear;
    }

    return clean_(props.getProperty(FUND_SPREADSHEET_ID_PROP)) || DEFAULT_FUND_SPREADSHEET_ID;
  }

  function parseDate_(rawValue, displayValue) {
    if (Object.prototype.toString.call(rawValue) === '[object Date]' && !isNaN(rawValue.getTime())) {
      return new Date(rawValue.getFullYear(), rawValue.getMonth(), rawValue.getDate());
    }
    var text = clean_(displayValue || rawValue);
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vn) return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]));
    return null;
  }

  function parseNumber_(value) {
    var text = clean_(value).replace(/[₫đĐ\s]/g, '');
    if (!text) return 0;
    var comma = text.lastIndexOf(',');
    var dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (comma >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (dot >= 0 && text.length - dot - 1 === 3) {
      text = text.replace(/\./g, '');
    }
    text = text.replace(/,/g, '');
    var number = Number(text);
    return isNaN(number) ? 0 : number;
  }

  function normalizeMonthKey_(month) {
    var text = clean_(month);
    if (!text || text === 'all' || text === 'Tất cả') return '';
    var iso = text.match(/^(\d{4})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2];
    var vn = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (vn) return vn[2] + '-' + ('0' + Number(vn[1])).slice(-2);
    return text;
  }

  function clean_(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  return {
    getFundTransactions: getFundTransactions,
    getFundSpreadsheet_: getFundSpreadsheet_
  };
})();

function getFundTransactions(year, filter) {
  return FundService.getFundTransactions(year, filter);
}

function getFundSpreadsheet_(year) {
  return FundService.getFundSpreadsheet_(year);
}
