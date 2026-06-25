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

  function getFundFormOptions(year) {
    var ss = getFundSpreadsheet_(year);
    return {
      ok: true,
      incomeCategories: readNamedRangeValues_(ss, 'MUCTHU'),
      expenseCategories: readNamedRangeValues_(ss, 'MUCCHI'),
      methods: readNamedRangeValues_(ss, 'HINHTHUC'),
      actors: readColumnValues_(ss, 'CAIDAT', 15, 3),
      partners: readPartners_(ss)
    };
  }

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

  function addFundTransaction(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    }

    var row = buildTransactionRow_(payload || {});
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var appendRow = getAppendRow_(sheet);
      if (sheet.getMaxRows() < appendRow) {
        sheet.insertRowsAfter(sheet.getMaxRows(), appendRow - sheet.getMaxRows());
      }

      sheet.getRange(appendRow, 1, 1, row.length).setValues([row]);
      sheet.getRange(appendRow, 2).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(appendRow, 6).setNumberFormat('#,##0');
      if (row[9] === 'Có') {
        sheet.getRange(appendRow, 13).setFormula(buildDebtFormula_(appendRow));
      }
      sheet.getRange(appendRow, 14).setFormula(buildFilterFormula_(appendRow));

      return {
        ok: true,
        rowIndex: appendRow,
        voucher: row[0],
        sheetName: TRANSACTION_SHEET_NAME
      };
    } finally {
      lock.releaseLock();
    }
  }

  function getFundSpreadsheet_(year) {
    var spreadsheetId = resolveFundSpreadsheetId_(year);
    return SpreadsheetApp.openById(spreadsheetId);
  }

  function buildTransactionRow_(payload) {
    var type = clean_(payload.type);
    var date = parseDate_(payload.date, payload.date);
    var category = clean_(payload.category);
    var method = clean_(payload.method);
    var amount = parseNumber_(payload.amount);
    var actor = clean_(payload.actor);
    var partner = clean_(payload.partner);
    var content = clean_(payload.content);
    var debt = payload.debt === true || clean_(payload.debt) === 'Có' ? 'Có' : '';

    if (!date) throw new Error('Vui lòng nhập ngày hợp lệ.');
    if (type !== 'Thu' && type !== 'Chi') throw new Error('Vui lòng chọn loại Thu hoặc Chi.');
    if (!category) throw new Error('Vui lòng nhập mục thu/chi.');
    if (!method) throw new Error('Vui lòng nhập hình thức.');
    if (!(amount > 0)) throw new Error('Số tiền phải lớn hơn 0.');
    if (!actor) throw new Error('Vui lòng nhập Người Thu/Chi.');
    if (debt && !partner) throw new Error('Khoản công nợ cần có Đối tác.');

    return [
      buildVoucher_(),
      date,
      type === 'Thu' ? category : '',
      type === 'Chi' ? category : '',
      method,
      amount,
      actor,
      partner,
      content,
      debt
    ];
  }

  function getAppendRow_(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return 2;
    var values = sheet.getRange(1, 2, lastRow, 1).getValues();
    for (var i = values.length - 1; i >= 1; i--) {
      var value = values[i][0];
      if (value !== '' && value !== null && value !== undefined) return i + 2;
    }
    return 2;
  }

  function buildVoucher_() {
    return Utilities.formatDate(new Date(), APP_CONFIG.timezone, 'yyMMddHHmmss');
  }

  function buildDebtFormula_(rowNumber) {
    var voucherCell = 'A' + rowNumber;
    return '=IF(SUMIFS(F:F;A:A;' + voucherCell + ';J:J;"Có")-SUMIFS(F:F;A:A;' + voucherCell + ';J:J;"="&"")<=0;0;SUMIFS(F:F;A:A;' + voucherCell + ';J:J;"Có")-SUMIFS(F:F;A:A;' + voucherCell + ';J:J;"="&""))';
  }

  function buildFilterFormula_(rowNumber) {
    return '=IF(BC_THUCHI!$C$15="";"";A' + rowNumber + ')&IF(BC_THUCHI!$J$15="";"";G' + rowNumber + ')&IF(BC_THUCHI!$K$15="";"";H' + rowNumber + ')';
  }

  function readNamedRangeValues_(ss, name) {
    var range = ss.getRangeByName(name);
    if (!range) return [];
    return flattenValues_(range.getDisplayValues());
  }

  function readColumnValues_(ss, sheetName, column, startRow) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < startRow) return [];
    return flattenValues_(sheet.getRange(startRow, column, sheet.getLastRow() - startRow + 1, 1).getDisplayValues());
  }

  function readPartners_(ss) {
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return flattenValues_(sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getDisplayValues());
  }

  function flattenValues_(values) {
    var seen = {};
    var result = [];
    values.forEach(function (row) {
      row.forEach(function (cell) {
        var value = clean_(cell);
        if (value && !seen[value]) {
          seen[value] = true;
          result.push(value);
        }
      });
    });
    return result;
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
    addFundTransaction: addFundTransaction,
    getFundFormOptions: getFundFormOptions,
    getFundTransactions: getFundTransactions,
    getFundSpreadsheet_: getFundSpreadsheet_
  };
})();

function getFundTransactions(year, filter) {
  return FundService.getFundTransactions(year, filter);
}

function getFundFormOptions(year) {
  return FundService.getFundFormOptions(year);
}

function addFundTransaction(year, payload) {
  return FundService.addFundTransaction(year, payload);
}

function getFundSpreadsheet_(year) {
  return FundService.getFundSpreadsheet_(year);
}
