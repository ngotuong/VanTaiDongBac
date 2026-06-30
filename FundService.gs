var FundService = (function () {
  var DEFAULT_FUND_SPREADSHEET_ID = '1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw';
  var FUND_SPREADSHEET_ID_PROP = 'FUND_SPREADSHEET_ID';
  var FUND_SPREADSHEET_ID_PREFIX = 'FUND_SPREADSHEET_ID_';
  var CASHFLOW_SPREADSHEET_ID_PREFIX = 'CASHFLOW_SPREADSHEET_ID_';
  var FUND_CACHE_VERSION_PROP = 'FUND_DATA_VERSION_V1';
  var FUND_CACHE_TTL_SECONDS = 180;
  var TRANSACTION_SHEET_NAME = 'NHAP_THUCHI';
  var LOAN_SHEET_NAME = 'NHAP_VAY';
  var CATALOG_SHEET_NAME = 'CAIDAT';
  var CATALOG_HEADERS = ['Nhóm', 'Giá trị', 'Ghi chú'];
  var CATALOG_GROUPS = [
    { key: 'incomeCategories', label: 'Mục Thu' },
    { key: 'expenseCategories', label: 'Mục Chi' },
    { key: 'actors', label: 'Người Thu/Chi' },
    { key: 'partners', label: 'Đối tác' },
    { key: 'loanPartners', label: 'Nơi vay' }
  ];
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

  function getFundOverview(year, filter) {
    var options = filter || {};
    var cacheKey = fundCacheKey_('overview', clean_(year), normalizeMonthKey_(options.month) || 'latest');
    if (!(options.forceRefresh === true || options.forceRefresh === 'true')) {
      var cached = getFundCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getFundSpreadsheet_(year);
    var transactions = readFundTransactions_(ss);
    var loans = readLoanRows_(ss);
    var settings = readFundSettings_(ss);
    var months = buildMonths_(transactions.concat(loans));
    var monthKey = normalizeMonthKey_(options.month) || (months[0] && months[0].key) || '';
    var period = monthKey ? monthPeriod_(monthKey) : null;
    var openingBase = settings.cashOpening + settings.bankOpening;
    var today = today_();

    var beforeIncome = 0;
    var beforeExpense = 0;
    var beforeLoanIn = 0;
    var beforeLoanOut = 0;
    var income = 0;
    var expense = 0;
    var currentIncome = 0;
    var currentExpense = 0;
    var currentLoanIn = 0;
    var currentLoanOut = 0;
    var incomeMap = {};
    var expenseMap = {};

    transactions.forEach(function (item) {
      var date = item.dateObj;
      if (!date || item.debt === 'Có') return;
      var isIncome = item.type === 'Thu' && item.category !== settings.withdrawName;
      var isExpense = item.type === 'Chi' && item.category !== settings.depositName;
      if (!isIncome && !isExpense) return;
      if (period && date < period.start) {
        if (isIncome) beforeIncome += item.amount;
        if (isExpense) beforeExpense += item.amount;
      }
      if (!period || (date >= period.start && date <= period.end)) {
        if (isIncome) {
          income += item.amount;
          addCategory_(incomeMap, item.category, item.amount, item);
        }
        if (isExpense) {
          expense += item.amount;
          addCategory_(expenseMap, item.category, item.amount, item);
        }
      }
      if (date <= today) {
        if (isIncome) currentIncome += item.amount;
        if (isExpense) currentExpense += item.amount;
      }
    });

    loans.forEach(function (item) {
      if (!item.dateObj) return;
      if (settings.loanStartDate && item.dateObj < settings.loanStartDate) return;
      var isLoanIn = item.type === 'Vay';
      var isLoanOut = item.type === 'Trả nợ' || item.type === 'Trả lãi';
      if (period && item.dateObj < period.start) {
        if (isLoanIn) beforeLoanIn += item.amount;
        if (isLoanOut) beforeLoanOut += item.amount;
      }
      if (!period || (item.dateObj >= period.start && item.dateObj <= period.end)) {
        if (isLoanIn) {
          income += item.amount;
          addCategory_(incomeMap, settings.loanIncomeName, item.amount, toFundCategoryDetail_(item, 'Thu', settings.loanIncomeName));
        }
        if (isLoanOut) {
          expense += item.amount;
          addCategory_(expenseMap, item.type, item.amount, toFundCategoryDetail_(item, 'Chi', item.type));
        }
      }
      if (item.dateObj <= today) {
        if (isLoanIn) currentLoanIn += item.amount;
        if (isLoanOut) currentLoanOut += item.amount;
      }
    });

    var openingBalance = openingBase + beforeIncome - beforeExpense + beforeLoanIn - beforeLoanOut;
    var net = income - expense;
    var closingBalance = openingBalance + net;
    var currentBalance = openingBase + currentIncome - currentExpense + currentLoanIn - currentLoanOut;

    var result = {
      ok: true,
      months: months,
      selectedMonth: monthKey,
      metrics: [
        { key: 'openingBalance', label: 'Số dư đầu kỳ', value: openingBalance },
        { key: 'periodIncome', label: 'Thu trong kỳ', value: income },
        { key: 'periodExpense', label: 'Chi trong kỳ', value: expense },
        { key: 'periodNet', label: 'Tổng thu chi', value: net },
        { key: 'closingBalance', label: 'Số dư cuối kỳ', value: closingBalance },
        { key: 'currentBalance', label: 'Số dư hiện tại', value: currentBalance }
      ],
      incomeCategories: mapToRows_(incomeMap),
      expenseCategories: mapToRows_(expenseMap)
    };
    putFundCache_(cacheKey, result);
    return result;
  }

  function getFundLoanOverview(year, filter) {
    var options = filter || {};
    var cacheKey = fundCacheKey_('loan_overview', clean_(year), normalizeMonthKey_(options.month) || 'all');
    if (!(options.forceRefresh === true || options.forceRefresh === 'true')) {
      var cached = getFundCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getFundSpreadsheet_(year);
    var rows = readLoanRows_(ss);
    var months = buildMonths_(rows);
    var monthKey = normalizeMonthKey_(options.month);
    var period = monthKey ? monthPeriod_(monthKey) : null;
    var overallLoanMap = buildLoanSummaryMap_(rows);
    var filteredRows = period ? rows.filter(function (row) {
      return row.dateObj && row.dateObj >= period.start && row.dateObj <= period.end;
    }) : rows;
    var summaryRows = period ? rows.filter(function (row) {
      return row.dateObj && row.dateObj <= period.end;
    }) : rows;
    var totalBorrowed = 0;
    var totalPrincipalPaid = 0;
    var totalInterestPaid = 0;
    var totalOutstandingBorrowed = 0;
    var totalOutstandingPrincipalPaid = 0;
    var loanMap = {};

    filteredRows.forEach(function (row) {
      if (row.type === 'Vay') totalBorrowed += row.amount;
      if (row.type === 'Trả nợ') totalPrincipalPaid += row.amount;
      if (row.type === 'Trả lãi') totalInterestPaid += row.amount;
    });

    summaryRows.forEach(function (row) {
      var key = row.code || ('row-' + row.rowIndex);
      if (!loanMap[key]) {
        loanMap[key] = {
          code: row.code,
          partner: row.partner,
          borrowed: 0,
          principalPaid: 0,
          interestPaid: 0,
          loanDateObj: null,
          principalDateObj: null,
          latestDate: row.date,
          content: row.content,
          termMonths: row.termMonths,
          annualRate: row.annualRate,
          interestPeriodMonths: row.interestPeriodMonths,
          firstInterestDate: row.firstInterestDate
        };
      }
      if (row.type === 'Vay') {
        loanMap[key].borrowed += row.amount;
        totalOutstandingBorrowed += row.amount;
        if (!loanMap[key].loanDateObj || row.dateObj < loanMap[key].loanDateObj) {
          loanMap[key].loanDateObj = row.dateObj;
        }
      }
      if (row.type === 'Trả nợ') {
        loanMap[key].principalPaid += row.amount;
        totalOutstandingPrincipalPaid += row.amount;
        if (!loanMap[key].principalDateObj || row.dateObj > loanMap[key].principalDateObj) {
          loanMap[key].principalDateObj = row.dateObj;
        }
      }
      if (row.type === 'Trả lãi') loanMap[key].interestPaid += row.amount;
      if (row.date > loanMap[key].latestDate) loanMap[key].latestDate = row.date;
    });

    var loans = Object.keys(loanMap).map(function (key) {
      var item = loanMap[key];
      item.outstanding = item.borrowed - item.principalPaid;
      item.loanDate = item.loanDateObj ? Utilities.formatDate(item.loanDateObj, APP_CONFIG.timezone, 'yyyy-MM-dd') : '';
      item.loanDateText = item.loanDateObj ? Utilities.formatDate(item.loanDateObj, APP_CONFIG.timezone, 'dd/MM/yyyy') : '';
      item.principalLatestDate = item.principalDateObj ? Utilities.formatDate(item.principalDateObj, APP_CONFIG.timezone, 'yyyy-MM-dd') : '';
      item.principalLatestDateText = item.principalDateObj ? Utilities.formatDate(item.principalDateObj, APP_CONFIG.timezone, 'dd/MM/yyyy') : '';
      return item;
    }).sort(function (a, b) {
      return (b.outstanding || 0) - (a.outstanding || 0);
    });

    var result = {
      ok: true,
      months: months,
      selectedMonth: monthKey,
      metrics: [
        { key: 'borrowed', label: 'Tổng khoản vay', value: totalBorrowed },
        { key: 'principalPaid', label: 'Đã trả nợ gốc', value: totalPrincipalPaid },
        { key: 'interestPaid', label: 'Đã trả lãi', value: totalInterestPaid },
        { key: 'outstanding', label: period ? 'Dư nợ cuối kỳ' : 'Dư nợ hiện tại', value: totalOutstandingBorrowed - totalOutstandingPrincipalPaid }
      ],
      loans: loans,
      recentRows: filteredRows.slice().sort(function (a, b) {
        return a.date < b.date ? 1 : -1;
      }).slice(0, 100).map(function (row) {
        var overallLoan = overallLoanMap[row.code || ('row-' + row.rowIndex)] || null;
        return extendLoanHistoryRow_(row, overallLoan);
      })
    };
    putFundCache_(cacheKey, result);
    return result;
  }

  function addFundLoan(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(LOAN_SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet khoản vay: ' + LOAN_SHEET_NAME);
    var row = buildLoanRow_(payload || {});
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
      sheet.getRange(appendRow, 14).setFormula(buildLoanFilterFormula_(appendRow));
      bumpFundDataVersion_();
      return { ok: true, rowIndex: appendRow, code: row[0], sheetName: LOAN_SHEET_NAME };
    } finally {
      lock.releaseLock();
    }
  }

  function addFundLoanPayment(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(LOAN_SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet khoản vay: ' + LOAN_SHEET_NAME);
    var row = buildLoanPaymentRow_(payload || {});
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
      sheet.getRange(appendRow, 14).setFormula(buildLoanFilterFormula_(appendRow));
      bumpFundDataVersion_();
      return { ok: true, rowIndex: appendRow, code: row[0], sheetName: LOAN_SHEET_NAME };
    } finally {
      lock.releaseLock();
    }
  }

  function getFundFormOptions(year, forceRefresh) {
    var cacheKey = fundCacheKey_('form_options', clean_(year));
    if (!(forceRefresh === true || forceRefresh === 'true')) {
      var cached = getFundCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getFundSpreadsheet_(year);
    var settings = readFundSettings_(ss);
    var catalogs = readFundCatalogGroups_(ss);
    var result = {
      ok: true,
      incomeCategories: mergeUniqueValues_(catalogs.incomeCategories, getFallbackFundIncomeCategories_(ss, settings)),
      expenseCategories: mergeUniqueValues_(catalogs.expenseCategories, getFallbackFundExpenseCategories_(ss)),
      actors: mergeUniqueValues_(catalogs.actors, getFallbackFundActors_(ss)),
      partners: mergeUniqueValues_(catalogs.partners, getFallbackFundPartners_(ss)),
      loanPartners: mergeUniqueValues_(catalogs.loanPartners, getFallbackFundLoanPartners_(ss))
    };
    putFundCache_(cacheKey, result);
    return result;
  }

  function getFundCatalog(year, group, forceRefresh) {
    var normalizedGroup = normalizeFundCatalogGroup_(group);
    var cacheKey = fundCacheKey_('catalog', clean_(year), normalizedGroup || 'all');
    if (!(forceRefresh === true || forceRefresh === 'true')) {
      var cached = getFundCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getFundSpreadsheet_(year);
    var catalogSheet = ensureFundCatalogSheet_(ss);
    var rows = readFundCatalogRows_(catalogSheet);
    var groups = getFundCatalogGroupSummary_(rows);
    var result = {
      ok: true,
      sheetName: CATALOG_SHEET_NAME,
      groups: groups,
      selectedGroup: normalizedGroup,
      rows: normalizedGroup ? rows.filter(function (row) { return row.groupKey === normalizedGroup; }) : rows
    };
    putFundCache_(cacheKey, result);
    return result;
  }

  function saveFundCatalogItem(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ensureFundCatalogSheet_(ss);
    var groupKey = normalizeFundCatalogGroup_(payload && payload.group);
    var value = clean_(payload && payload.value);
    var note = clean_(payload && payload.note);
    var rowIndex = parseInt((payload && payload.rowIndex) || '', 10);

    if (!groupKey) throw new Error('Vui lòng chọn nhóm danh mục.');
    if (!value) throw new Error('Vui lòng nhập giá trị danh mục.');

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var targetRow = rowIndex > 1 ? rowIndex : getAppendRow_(sheet);
      if (sheet.getMaxRows() < targetRow) {
        sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
      }
      sheet.getRange(targetRow, 1, 1, 3).setValues([[getFundCatalogGroupLabel_(groupKey), value, note]]);
      bumpFundDataVersion_();
      return { ok: true, rowIndex: targetRow, group: groupKey, value: value, note: note, sheetName: CATALOG_SHEET_NAME };
    } finally {
      lock.releaseLock();
    }
  }

  function deleteFundCatalogItem(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ensureFundCatalogSheet_(ss);
    var rowIndex = parseInt((payload && payload.rowIndex) || '', 10);
    if (!(rowIndex > 1)) throw new Error('Thiếu dòng danh mục cần xóa.');

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      sheet.deleteRow(rowIndex);
      bumpFundDataVersion_();
      return { ok: true, rowIndex: rowIndex, sheetName: CATALOG_SHEET_NAME };
    } finally {
      lock.releaseLock();
    }
  }

  function getFundTransactions(year, filter) {
    var options = filter || {};
    var selectedMonth = normalizeMonthKey_(options.month);
    var limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 300, 1000));
    var cacheKey = fundCacheKey_('transactions', clean_(year), selectedMonth || 'latest', String(limit));
    if (!(options.forceRefresh === true || options.forceRefresh === 'true')) {
      var cached = getFundCache_(cacheKey);
      if (cached) return cached;
    }
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    }

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
    var columns = getTransactionColumns_(headerValues);
    var displayValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    var rawDateValues = sheet.getRange(2, columns.date + 1, lastRow - 1, 1).getValues();
    var transactions = [];
    var monthMap = {};

    for (var i = 0; i < displayValues.length; i++) {
      var row = displayValues[i];
      var rawDate = rawDateValues[i][0];
      var hasBusinessData = row.slice(0, TRANSACTION_HEADERS.length).some(function (cell) {
        return clean_(cell);
      });
      if (!hasBusinessData) continue;

      var parsedDate = parseDate_(rawDate, row[columns.date]);
      var monthKey = parsedDate ? Utilities.formatDate(parsedDate, APP_CONFIG.timezone, 'yyyy-MM') : '';
      var monthLabel = parsedDate ? Utilities.formatDate(parsedDate, APP_CONFIG.timezone, 'MM/yyyy') : '';
      if (monthKey) monthMap[monthKey] = monthLabel;
      if (selectedMonth && monthKey !== selectedMonth) continue;

      var incomeCategory = clean_(row[columns.income]);
      var expenseCategory = clean_(row[columns.expense]);
      transactions.push({
        rowIndex: i + 2,
        voucher: columns.voucher >= 0 ? clean_(row[columns.voucher]) : '',
        date: parsedDate ? Utilities.formatDate(parsedDate, APP_CONFIG.timezone, 'yyyy-MM-dd') : clean_(row[columns.date]),
        dateText: clean_(row[columns.date]),
        month: monthKey,
        monthLabel: monthLabel,
        type: incomeCategory ? 'Thu' : (expenseCategory ? 'Chi' : ''),
        category: incomeCategory || expenseCategory,
        incomeCategory: incomeCategory,
        expenseCategory: expenseCategory,
        method: clean_(row[columns.method]),
        amount: parseNumber_(row[columns.amount]),
        amountText: clean_(row[columns.amount]),
        actor: clean_(row[columns.actor]),
        partner: clean_(row[columns.partner]),
        content: clean_(row[columns.content]),
        debt: clean_(row[columns.debt])
      });
    }

    transactions.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.rowIndex - a.rowIndex;
    });

    var months = Object.keys(monthMap).sort().reverse().map(function (key) {
      return { key: key, label: monthMap[key] };
    });

    var result = {
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
    putFundCache_(cacheKey, result);
    return result;
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
      bumpFundDataVersion_();

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

  function readFundTransactions_(ss) {
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), TRANSACTION_HEADERS.length);
    if (lastRow < 2) return [];
    var headerValues = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var columns = getTransactionColumns_(headerValues);
    var displayValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    var rawDateValues = sheet.getRange(2, columns.date + 1, lastRow - 1, 1).getValues();
    var rows = [];
    displayValues.forEach(function (row, index) {
      if (!row.slice(0, TRANSACTION_HEADERS.length).some(function (cell) { return clean_(cell); })) return;
      var dateObj = parseDate_(rawDateValues[index][0], row[columns.date]);
      var incomeCategory = clean_(row[columns.income]);
      var expenseCategory = clean_(row[columns.expense]);
      rows.push({
        rowIndex: index + 2,
        voucher: columns.voucher >= 0 ? clean_(row[columns.voucher]) : '',
        dateObj: dateObj,
        date: dateObj ? Utilities.formatDate(dateObj, APP_CONFIG.timezone, 'yyyy-MM-dd') : clean_(row[columns.date]),
        dateText: clean_(row[columns.date]),
        month: dateObj ? Utilities.formatDate(dateObj, APP_CONFIG.timezone, 'yyyy-MM') : '',
        monthLabel: dateObj ? Utilities.formatDate(dateObj, APP_CONFIG.timezone, 'MM/yyyy') : '',
        type: incomeCategory ? 'Thu' : (expenseCategory ? 'Chi' : ''),
        category: incomeCategory || expenseCategory,
        incomeCategory: incomeCategory,
        expenseCategory: expenseCategory,
        method: clean_(row[columns.method]),
        amount: parseNumber_(row[columns.amount]),
        amountText: clean_(row[columns.amount]),
        actor: clean_(row[columns.actor]),
        partner: clean_(row[columns.partner]),
        content: clean_(row[columns.content]),
        debt: clean_(row[columns.debt])
      });
    });
    return rows;
  }

  function getTransactionColumns_(headers) {
    var hasVoucher = findHeaderIndex_(headers, ['so phieu', 'số phiếu']) >= 0;
    var offset = hasVoucher ? 0 : -1;
    return {
      voucher: findHeaderIndex_(headers, ['so phieu', 'số phiếu']),
      date: requiredHeaderIndex_(headers, ['ngay', 'ngày'], 1 + offset),
      income: requiredHeaderIndex_(headers, ['muc thu', 'mục thu'], 2 + offset),
      expense: requiredHeaderIndex_(headers, ['muc chi', 'mục chi'], 3 + offset),
      method: requiredHeaderIndex_(headers, ['hinh thuc', 'hình thức'], 4 + offset),
      amount: requiredHeaderIndex_(headers, ['so tien', 'số tiền'], 5 + offset),
      actor: requiredHeaderIndex_(headers, ['nguoi thu chi', 'người thu chi', 'nguoi thu/chi', 'người thu/chi'], 6 + offset),
      partner: requiredHeaderIndex_(headers, ['doi tac', 'đối tác'], 7 + offset),
      content: requiredHeaderIndex_(headers, ['noi dung', 'nội dung'], 8 + offset),
      debt: requiredHeaderIndex_(headers, ['cong no', 'công nợ'], 9 + offset)
    };
  }

  function requiredHeaderIndex_(headers, names, fallbackIndex) {
    var index = findHeaderIndex_(headers, names);
    return index >= 0 ? index : Math.max(0, fallbackIndex);
  }

  function findHeaderIndex_(headers, names) {
    var normalizedNames = names.map(normalizeHeader_);
    for (var i = 0; i < headers.length; i++) {
      var value = normalizeHeader_(headers[i]);
      if (normalizedNames.indexOf(value) >= 0) return i;
    }
    return -1;
  }

  function normalizeHeader_(value) {
    return clean_(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function readLoanRows_(ss) {
    var sheet = ss.getSheetByName(LOAN_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 14)).getDisplayValues();
    var rawDates = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var rows = [];
    values.forEach(function (row, index) {
      if (!row.slice(0, 11).some(function (cell) { return clean_(cell); })) return;
      var dateObj = parseDate_(rawDates[index][0], row[1]);
      rows.push({
        rowIndex: index + 2,
        code: clean_(row[0]),
        dateObj: dateObj,
        date: dateObj ? Utilities.formatDate(dateObj, APP_CONFIG.timezone, 'yyyy-MM-dd') : clean_(row[1]),
        dateText: clean_(row[1]),
        month: dateObj ? Utilities.formatDate(dateObj, APP_CONFIG.timezone, 'yyyy-MM') : '',
        monthLabel: dateObj ? Utilities.formatDate(dateObj, APP_CONFIG.timezone, 'MM/yyyy') : '',
        type: clean_(row[2]),
        method: clean_(row[3]),
        partner: clean_(row[4]),
        amount: parseNumber_(row[5]),
        amountText: clean_(row[5]),
        termMonths: parseNumber_(row[6]),
        annualRate: parseNumber_(row[7]),
        interestPeriodMonths: parseNumber_(row[8]),
        firstInterestDate: clean_(row[9]),
        content: clean_(row[10])
      });
    });
    return rows;
  }

  function buildLoanSummaryMap_(rows) {
    var loanMap = {};
    (rows || []).forEach(function (row) {
      var key = row.code || ('row-' + row.rowIndex);
      if (!loanMap[key]) {
        loanMap[key] = {
          code: row.code,
          borrowed: 0,
          principalPaid: 0
        };
      }
      if (row.type === 'Vay') loanMap[key].borrowed += row.amount;
      if (row.type === 'Trả nợ') loanMap[key].principalPaid += row.amount;
    });

    Object.keys(loanMap).forEach(function (key) {
      loanMap[key].outstanding = loanMap[key].borrowed - loanMap[key].principalPaid;
      loanMap[key].isSettled = loanMap[key].borrowed > 0 && loanMap[key].outstanding <= 0;
    });
    return loanMap;
  }

  function extendLoanHistoryRow_(row, overallLoan) {
    return {
      rowIndex: row.rowIndex,
      code: row.code,
      dateObj: row.dateObj,
      date: row.date,
      dateText: row.dateText,
      month: row.month,
      monthLabel: row.monthLabel,
      type: row.type,
      method: row.method,
      partner: row.partner,
      amount: row.amount,
      amountText: row.amountText,
      termMonths: row.termMonths,
      annualRate: row.annualRate,
      interestPeriodMonths: row.interestPeriodMonths,
      firstInterestDate: row.firstInterestDate,
      content: row.content,
      isSettled: Boolean(overallLoan && overallLoan.isSettled),
      statusLabel: overallLoan && overallLoan.isSettled ? 'Đã trả gốc' : ''
    };
  }

  function readFundCatalogGroups_(ss) {
    var rows = readFundCatalogRows_(ensureFundCatalogSheet_(ss));
    var grouped = {
      incomeCategories: [],
      expenseCategories: [],
      actors: [],
      partners: [],
      loanPartners: []
    };
    rows.forEach(function (row) {
      if (row.groupKey && grouped[row.groupKey]) {
        grouped[row.groupKey].push(row.value);
      }
    });
    Object.keys(grouped).forEach(function (key) {
      grouped[key] = uniqueValues_(grouped[key]);
    });
    return grouped;
  }

  function readFundSettings_(ss) {
    return {
      cashOpening: parseNumber_(readNamedRangeDisplay_(ss, 'TMDK')),
      bankOpening: parseNumber_(readNamedRangeDisplay_(ss, 'TKDK')),
      loanStartDate: readNamedRangeDate_(ss, 'NGAYTINHVAY'),
      depositName: readNamedRangeDisplay_(ss, 'NOPTIEN') || 'Nộp vào TK',
      withdrawName: readNamedRangeDisplay_(ss, 'RUTTIEN') || 'Rút tiền',
      loanIncomeName: readNamedRangeDisplay_(ss, 'KHOANVAY') || 'Khoản vay'
    };
  }

  function ensureFundCatalogSheet_(ss) {
    var sheet = ss.getSheetByName(CATALOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CATALOG_SHEET_NAME);
      sheet.getRange(1, 1, 1, CATALOG_HEADERS.length).setValues([CATALOG_HEADERS]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function readFundCatalogRows_(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
    return values.map(function (row, index) {
      return {
        rowIndex: index + 2,
        group: clean_(row[0]),
        groupKey: normalizeFundCatalogGroup_(row[0]),
        value: clean_(row[1]),
        note: clean_(row[2])
      };
    }).filter(function (row) {
      return row.groupKey && row.value;
    });
  }

  function getFundCatalogGroupSummary_(rows) {
    var counts = {};
    CATALOG_GROUPS.forEach(function (group) {
      counts[group.key] = 0;
    });
    rows.forEach(function (row) {
      if (counts[row.groupKey] !== undefined) counts[row.groupKey] += 1;
    });
    return CATALOG_GROUPS.map(function (group) {
      return {
        key: group.key,
        label: group.label,
        count: counts[group.key] || 0
      };
    });
  }

  function getFundCatalogGroupLabel_(groupKey) {
    var found = CATALOG_GROUPS.find(function (group) { return group.key === groupKey; });
    return found ? found.label : groupKey;
  }

  function normalizeFundCatalogGroup_(value) {
    var text = clean_(value).toLowerCase();
    if (text === 'muc thu' || text === 'mục thu' || text === 'incomecategories') return 'incomeCategories';
    if (text === 'muc chi' || text === 'mục chi' || text === 'expensecategories') return 'expenseCategories';
    if (text === 'nguoi thu/chi' || text === 'người thu/chi' || text === 'actors') return 'actors';
    if (text === 'doi tac' || text === 'đối tác' || text === 'partners') return 'partners';
    if (text === 'noi vay' || text === 'nơi vay' || text === 'loanpartners') return 'loanPartners';
    var exact = CATALOG_GROUPS.find(function (group) { return group.key.toLowerCase() === text; });
    return exact ? exact.key : '';
  }

  function uniqueValues_(values) {
    var seen = {};
    var result = [];
    (values || []).forEach(function (value) {
      var text = clean_(value);
      if (!text) return;
      var key = normalizeHeader_(text);
      if (!seen[key]) {
        seen[key] = true;
        result.push(text);
      }
    });
    return result;
  }

  function mergeUniqueValues_(baseValues, fallbackValues) {
    return uniqueValues_((baseValues || []).concat(fallbackValues || []));
  }

  function getFallbackFundIncomeCategories_(ss, settings) {
    var values = readValuesByTransactionType_(ss, 'Thu', 3);
    if (settings && settings.loanIncomeName) values.unshift(settings.loanIncomeName);
    return values;
  }

  function getFallbackFundExpenseCategories_(ss) {
    return readValuesByTransactionType_(ss, 'Chi', 4);
  }

  function getFallbackFundActors_(ss) {
    return readTransactionColumnValues_(ss, 7);
  }

  function getFallbackFundPartners_(ss) {
    return readTransactionColumnValues_(ss, 8);
  }

  function getFallbackFundLoanPartners_(ss) {
    return readLoanPartnerColumnValues_(ss);
  }

  function getFallbackFundMethods_(ss) {
    return readTransactionColumnValues_(ss, 5);
  }

  function readValuesByTransactionType_(ss, type, columnIndex) {
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), TRANSACTION_HEADERS.length)).getDisplayValues()[0];
    var columns = getTransactionColumns_(headers);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), TRANSACTION_HEADERS.length)).getDisplayValues();
    var result = [];
    data.forEach(function (row) {
      if ((type === 'Thu' && clean_(row[columns.income])) || (type === 'Chi' && clean_(row[columns.expense]))) {
        result.push(clean_(row[columnIndex - 1]));
      }
    });
    return result;
  }

  function readTransactionColumnValues_(ss, columnIndex) {
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), TRANSACTION_HEADERS.length)).getDisplayValues()[0];
    var columns = getTransactionColumns_(headers);
    if (columnIndex === 7) {
      return flattenValues_(sheet.getRange(2, columns.actor + 1, sheet.getLastRow() - 1, 1).getDisplayValues());
    }
    if (columnIndex === 8) {
      return flattenValues_(sheet.getRange(2, columns.partner + 1, sheet.getLastRow() - 1, 1).getDisplayValues());
    }
    return [];
  }

  function readLoanPartnerColumnValues_(ss) {
    var sheet = ss.getSheetByName(LOAN_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return flattenValues_(sheet.getRange(2, 5, sheet.getLastRow() - 1, 1).getDisplayValues());
  }

  function readNamedRangeDate_(ss, name) {
    var range = ss.getRangeByName(name);
    if (!range) return null;
    return parseDate_(range.getValue(), range.getDisplayValue());
  }

  function readNamedRangeDisplay_(ss, name) {
    var range = ss.getRangeByName(name);
    return range ? clean_(range.getDisplayValue()) : '';
  }

  function today_() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function buildMonths_(rows) {
    var map = {};
    rows.forEach(function (row) {
      if (row.month) map[row.month] = row.monthLabel;
    });
    return Object.keys(map).sort().reverse().map(function (key) {
      return { key: key, label: map[key] };
    });
  }

  function monthPeriod_(monthKey) {
    var parts = monthKey.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0, 23, 59, 59)
    };
  }

  function addCategory_(map, category, amount, item) {
    var key = category || 'Khác';
    if (!map[key]) map[key] = { category: key, amount: 0, count: 0, details: [] };
    map[key].amount += amount;
    map[key].count += 1;
    map[key].details.push(item);
  }

  function toFundCategoryDetail_(row, type, category) {
    return {
      rowIndex: row.rowIndex,
      voucher: row.code,
      dateObj: row.dateObj,
      date: row.date,
      dateText: row.dateText,
      month: row.month,
      monthLabel: row.monthLabel,
      type: type,
      category: category,
      incomeCategory: type === 'Thu' ? category : '',
      expenseCategory: type === 'Chi' ? category : '',
      method: row.method,
      amount: row.amount,
      amountText: row.amountText,
      actor: '',
      partner: row.partner,
      content: row.content,
      debt: ''
    };
  }

  function mapToRows_(map) {
    return Object.keys(map).map(function (key) {
      return map[key];
    }).sort(function (a, b) {
      return b.amount - a.amount;
    });
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

  function buildLoanRow_(payload) {
    var date = parseDate_(payload.date, payload.date);
    var method = clean_(payload.method);
    var partner = clean_(payload.partner);
    var amount = parseNumber_(payload.amount);
    var termMonths = parseNumber_(payload.termMonths);
    var annualRate = parseNumber_(payload.annualRate);
    var interestPeriodMonths = parseNumber_(payload.interestPeriodMonths);
    var firstInterestDate = parseDate_(payload.firstInterestDate, payload.firstInterestDate);
    var content = clean_(payload.content);
    if (!date) throw new Error('Vui lòng nhập ngày vay hợp lệ.');
    if (!partner) throw new Error('Vui lòng nhập đối tác cho khoản vay.');
    if (!(amount > 0)) throw new Error('Số tiền vay phải lớn hơn 0.');
    return [
      buildVoucher_(),
      date,
      'Vay',
      method,
      partner,
      amount,
      termMonths || '',
      annualRate || '',
      interestPeriodMonths || '',
      firstInterestDate || '',
      content
    ];
  }

  function buildLoanPaymentRow_(payload) {
    var date = parseDate_(payload.date, payload.date);
    var code = clean_(payload.code);
    var type = clean_(payload.type);
    var partner = clean_(payload.partner);
    var amount = parseNumber_(payload.amount);
    var content = clean_(payload.content);
    if (!date) throw new Error('Vui lòng nhập ngày thanh toán hợp lệ.');
    if (!code) throw new Error('Thiếu mã khoản vay cần thanh toán.');
    if (type !== 'Trả nợ' && type !== 'Trả lãi') throw new Error('Vui lòng chọn Trả nợ hoặc Trả lãi.');
    if (!partner) throw new Error('Vui lòng nhập đối tác cho khoản vay.');
    if (!(amount > 0)) throw new Error('Số tiền thanh toán phải lớn hơn 0.');
    return [
      code,
      date,
      type,
      '',
      partner,
      amount,
      '',
      '',
      '',
      '',
      content
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

  function buildLoanFilterFormula_(rowNumber) {
    return '=IF(BC_VAY!$P$9="";"";A' + rowNumber + ')&IF(BC_VAY!$R$9="";"";C' + rowNumber + ')&IF(BC_VAY!$S$9="";"";E' + rowNumber + ')';
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
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), TRANSACTION_HEADERS.length)).getDisplayValues()[0];
    var columns = getTransactionColumns_(headers);
    return flattenValues_(sheet.getRange(2, columns.partner + 1, sheet.getLastRow() - 1, 1).getDisplayValues());
  }

  function readLoanPartners_(ss) {
    // Danh mục "Nơi vay" nằm ở cột K của sheet CAIDAT trong file ThuChi.
    return readColumnValues_(ss, 'CAIDAT', 11, 3);
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

  function ensureOption_(values, option) {
    var target = clean_(option);
    if (!target) return values || [];
    var result = values || [];
    var exists = result.some(function (value) {
      return normalizeHeader_(value) === normalizeHeader_(target);
    });
    return exists ? result : result.concat([target]);
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

  function fundCacheKey_() {
    var parts = ['fund', getFundDataVersion_()];
    for (var i = 0; i < arguments.length; i++) {
      parts.push(normalizeCachePart_(arguments[i]));
    }
    return parts.join(':');
  }

  function getFundDataVersion_() {
    return PropertiesService.getScriptProperties().getProperty(FUND_CACHE_VERSION_PROP) || '0';
  }

  function bumpFundDataVersion_() {
    PropertiesService.getScriptProperties().setProperty(FUND_CACHE_VERSION_PROP, String(new Date().getTime()));
  }

  function getFundCache_(key) {
    var cache = CacheService.getScriptCache();
    var countText = cache.get(key + ':count');
    if (!countText) return null;
    var count = parseInt(countText, 10);
    if (!(count > 0)) return null;
    var keys = [];
    for (var i = 0; i < count; i++) {
      keys.push(key + ':' + i);
    }
    var chunks = cache.getAll(keys);
    var text = '';
    for (var j = 0; j < count; j++) {
      var chunk = chunks[key + ':' + j];
      if (!chunk) return null;
      text += chunk;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function putFundCache_(key, data) {
    var cache = CacheService.getScriptCache();
    var text = JSON.stringify(data);
    var chunkSize = 90000;
    var chunks = {};
    var count = Math.ceil(text.length / chunkSize);
    for (var i = 0; i < count; i++) {
      chunks[key + ':' + i] = text.substring(i * chunkSize, (i + 1) * chunkSize);
    }
    cache.putAll(chunks, FUND_CACHE_TTL_SECONDS);
    cache.put(key + ':count', String(count), FUND_CACHE_TTL_SECONDS);
  }

  function normalizeCachePart_(value) {
    return clean_(value).replace(/[^A-Za-z0-9_-]/g, '_') || 'all';
  }

  function clean_(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  return {
    addFundTransaction: addFundTransaction,
    addFundLoan: addFundLoan,
    addFundLoanPayment: addFundLoanPayment,
    deleteFundCatalogItem: deleteFundCatalogItem,
    getFundFormOptions: getFundFormOptions,
    getFundCatalog: getFundCatalog,
    getFundLoanOverview: getFundLoanOverview,
    getFundOverview: getFundOverview,
    getFundTransactions: getFundTransactions,
    saveFundCatalogItem: saveFundCatalogItem,
    getFundSpreadsheet_: getFundSpreadsheet_
  };
})();

function getFundTransactions(year, filter) {
  return FundService.getFundTransactions(year, filter);
}

function getFundFormOptions(year, forceRefresh) {
  return FundService.getFundFormOptions(year, forceRefresh);
}

function addFundTransaction(year, payload) {
  return FundService.addFundTransaction(year, payload);
}

function getFundOverview(year, filter) {
  return FundService.getFundOverview(year, filter);
}

function getFundLoanOverview(year, filter) {
  return FundService.getFundLoanOverview(year, filter);
}

function addFundLoan(year, payload) {
  return FundService.addFundLoan(year, payload);
}

function addFundLoanPayment(year, payload) {
  return FundService.addFundLoanPayment(year, payload);
}

function getFundSpreadsheet_(year) {
  return FundService.getFundSpreadsheet_(year);
}
