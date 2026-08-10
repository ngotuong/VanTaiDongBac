var FundService = (function () {
  var FUND_CACHE_VERSION = 'fund_v7';
  var FUND_TTL_SECONDS = 300;
  var FUND_CATALOG_TTL_SECONDS = 21600;
  var FUND_DATA_VERSION_PROP = 'FUND_DATA_VERSION_V1';
  var DEFAULT_FUND_SPREADSHEET_ID = '1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw';
  var FUND_SPREADSHEET_ID_PROP = 'FUND_SPREADSHEET_ID';
  var FUND_SPREADSHEET_ID_PREFIX = 'FUND_SPREADSHEET_ID_';
  var CASHFLOW_SPREADSHEET_ID_PREFIX = 'CASHFLOW_SPREADSHEET_ID_';
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
    var safeFilter = filter || {};
    var explicitStart = parseDate_(safeFilter.startDate, safeFilter.startDate);
    var explicitEnd = parseDate_(safeFilter.endDate, safeFilter.endDate);
    if (explicitEnd) explicitEnd.setHours(23, 59, 59, 999);
    var rangeKey = explicitStart && explicitEnd
      ? formatDateKey_(explicitStart) + '_' + formatDateKey_(explicitEnd)
      : normalizeMonthKey_(safeFilter.month) || 'all';
    var overviewCacheKey = fundCacheKey_(year, 'overview', rangeKey);
    var overviewCached = getFundCache_(overviewCacheKey);
    if (overviewCached) return overviewCached;
    var ss = getFundSpreadsheet_(year);
    var transactions = readFundTransactions_(ss);
    var loans = readLoanRows_(ss);
    var settings = readFundSettings_(ss);
    var months = buildMonths_(transactions.concat(loans));
    var monthKey = normalizeMonthKey_(safeFilter.month) || (!explicitStart && !explicitEnd && (months[0] && months[0].key)) || '';
    var period = explicitStart && explicitEnd ? { start: explicitStart, end: explicitEnd } : (monthKey ? monthPeriod_(monthKey) : null);
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
    putFundCache_(overviewCacheKey, result, FUND_TTL_SECONDS);
    return result;
  }

  function getFundLoanOverview(year, filter) {
    var safeFilter = filter || {};
    var rangeKey = clean_(safeFilter.startDate) && clean_(safeFilter.endDate)
      ? clean_(safeFilter.startDate) + '_' + clean_(safeFilter.endDate)
      : normalizeMonthKey_(safeFilter.month) || 'all';
    var loanCacheKey = fundCacheKey_(year, 'loan_overview', rangeKey);
    var loanCached = getFundCache_(loanCacheKey);
    if (loanCached) return loanCached;
    var result = FundLoanService.getOverview(filter || {}, fundLoanReadContext_(getFundSpreadsheet_(year)));
    putFundCache_(loanCacheKey, result, FUND_TTL_SECONDS);
    return result;
  }

  function fundLoanReadContext_(ss) {
    return { repository: FundLoanRepository, spreadsheet: ss, sheetName: LOAN_SHEET_NAME, clean: clean_, normalizeHeader: normalizeHeader_,
      parseDate: parseDate_, parseNumber: parseNumber_, normalizeMonth: normalizeMonthKey_, monthPeriod: monthPeriod_, buildMonths: buildMonths_,
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); } };
  }

  function addFundLoan(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(LOAN_SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet khoản vay: ' + LOAN_SHEET_NAME);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var context = fundLoanWriteContext_(ss, sheet);
      var result = FundLoanService.addLoan(payload, context);
      bumpFundDataVersion_();
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function addFundLoanPayment(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(LOAN_SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet khoản vay: ' + LOAN_SHEET_NAME);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var context = fundLoanWriteContext_(ss, sheet);
      var result = FundLoanService.addPayment(payload, context);
      bumpFundDataVersion_();
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function fundLoanWriteContext_(ss, sheet) {
    return { repository: FundLoanRepository, sheet: sheet, sheetName: LOAN_SHEET_NAME, clean: clean_, parseDate: parseDate_, parseNumber: parseNumber_,
      buildVoucher: function (date) { return nextLoanVoucher_(ss, sheet, date); },
      appendOptions: { getAppendRow: getAppendRow_ } };
  }

  function getFundFormOptions(year, forceRefresh) {
    var optionsCacheKey = fundCacheKey_(year, 'form_options');
    var optionsCached = forceRefresh ? null : getFundCache_(optionsCacheKey);
    if (optionsCached) return optionsCached;
    var ss = getFundSpreadsheet_(year);
    var settings = readFundSettings_(ss);
    var context = fundCatalogReadContext_(ss, ensureFundCatalogSheet_(ss));
    context.fallbackIncome = function () { return getFallbackFundIncomeCategories_(ss, settings); };
    context.fallbackExpense = function () { return getFallbackFundExpenseCategories_(ss); };
    context.fallbackActors = function () { return getFallbackFundActors_(ss); };
    context.fallbackPartners = function () { return getFallbackFundPartners_(ss); };
    context.fallbackLoanPartners = function () { return getFallbackFundLoanPartners_(ss); };
    var result = FundCatalogService.getFormOptions(context);
    result.settings = publicFundSettings_(settings);
    putFundCache_(optionsCacheKey, result, FUND_CATALOG_TTL_SECONDS);
    return result;
  }

  function publicFundSettings_(settings) {
    return {
      cashOpening: Number(settings.cashOpening || 0),
      bankOpening: Number(settings.bankOpening || 0),
      dataStartDate: formatDateKey_(settings.dataStartDate),
      loanStartDate: formatDateKey_(settings.loanStartDate)
    };
  }

  function updateFundSettings(year, payload) {
    var item = payload || {};
    var cashOpening = parseNumber_(item.cashOpening);
    var bankOpening = parseNumber_(item.bankOpening);
    var dataStartDate = parseDate_(item.dataStartDate, item.dataStartDate);
    var loanStartDate = parseDate_(item.loanStartDate, item.loanStartDate);
    if (!isFinite(cashOpening) || !isFinite(bankOpening)) throw new Error('Số dư đầu kỳ không hợp lệ.');
    if (!dataStartDate) throw new Error('Ngày bắt đầu nhập liệu không hợp lệ.');
    if (!loanStartDate) throw new Error('Ngày bắt đầu tính khoản vay không hợp lệ.');
    var ss = getFundSpreadsheet_(year);
    var ranges = {
      TMDK: ss.getRangeByName('TMDK'),
      TKDK: ss.getRangeByName('TKDK'),
      NGAYNHAPLIEU: ss.getRangeByName('NGAYNHAPLIEU'),
      NGAYTINHVAY: ss.getRangeByName('NGAYTINHVAY')
    };
    Object.keys(ranges).forEach(function (name) {
      if (!ranges[name]) throw new Error('Không tìm thấy named range Thu chi: ' + name + '.');
    });
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      ranges.TMDK.setValue(cashOpening).setNumberFormat('#,##0');
      ranges.TKDK.setValue(bankOpening).setNumberFormat('#,##0');
      ranges.NGAYNHAPLIEU.setValue(dataStartDate).setNumberFormat('dd/MM/yyyy');
      ranges.NGAYTINHVAY.setValue(loanStartDate).setNumberFormat('dd/MM/yyyy');
      SpreadsheetApp.flush();
      bumpFundDataVersion_();
      return { ok: true, year: clean_(year), settings: publicFundSettings_({
        cashOpening: cashOpening,
        bankOpening: bankOpening,
        dataStartDate: dataStartDate,
        loanStartDate: loanStartDate
      }) };
    } finally {
      lock.releaseLock();
    }
  }

  function getFundCatalog(year, group, forceRefresh) {
    var catalogCacheKey = fundCacheKey_(year, 'catalog', FundCatalogService.normalizeGroup(group, fundCatalogReadContext_(null, null)) || 'all');
    var catalogCached = forceRefresh ? null : getFundCache_(catalogCacheKey);
    if (catalogCached) return catalogCached;
    var ss = getFundSpreadsheet_(year);
    var settings = readFundSettings_(ss);
    var context = fundCatalogReadContext_(ss, ensureFundCatalogSheet_(ss));
    context.fallbackIncome = function () { return getFallbackFundIncomeCategories_(ss, settings); };
    context.fallbackExpense = function () { return getFallbackFundExpenseCategories_(ss); };
    context.fallbackActors = function () { return getFallbackFundActors_(ss); };
    context.fallbackPartners = function () { return getFallbackFundPartners_(ss); };
    context.fallbackLoanPartners = function () { return getFallbackFundLoanPartners_(ss); };
    var result = FundCatalogService.getCatalog(group, context);
    putFundCache_(catalogCacheKey, result, FUND_CATALOG_TTL_SECONDS);
    return result;
  }

  function fundCatalogReadContext_(ss, sheet) {
    return { repository: FundCatalogRepository, spreadsheet: ss, sheet: sheet, sheetName: CATALOG_SHEET_NAME,
      groups: CATALOG_GROUPS, nativeSpecs: {
        incomeCategories: { rangeName: 'MUCTHU', column: 5, startRow: 3 },
        expenseCategories: { rangeName: 'MUCCHI', column: 8, startRow: 3 },
        actors: { column: 15, startRow: 3 }, partners: { column: 13, startRow: 3 }, loanPartners: { column: 11, startRow: 3 }
      }, clean: clean_, normalizeHeader: normalizeHeader_ };
  }

  function saveFundCatalogItem(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ensureFundCatalogSheet_(ss);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var context = fundCatalogReadContext_(ss, sheet);
      context.getAppendRow = getAppendRow_;
      context.columnToLetter = columnToLetter_;
      var result = FundCatalogService.saveItem(payload, context);
      bumpFundDataVersion_();
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function deleteFundCatalogItem(year, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ensureFundCatalogSheet_(ss);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var context = fundCatalogReadContext_(ss, sheet);
      var result = FundCatalogService.deleteItem(payload, context);
      bumpFundDataVersion_();
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function getFundTransactions(year, filter) {
    var options = filter || {};
    var selectedMonth = normalizeMonthKey_(options.month);
    var startFilter = parseDate_(options.startDate, options.startDate);
    var endFilter = parseDate_(options.endDate, options.endDate);
    var searchFilter = normalizeHeader_(options.search || options.query || '');
    var transactionsCacheKey = fundCacheKey_(year, 'transactions', selectedMonth || 'all', formatDateKey_(startFilter) || 'all', formatDateKey_(endFilter) || 'all', searchFilter || 'all', String(options.limit || ''));
    var transactionsCached = getFundCache_(transactionsCacheKey);
    if (transactionsCached) return transactionsCached;
    var result = FundTransactionService.getTransactions(year, options, {
      repository: FundTransactionRepository, spreadsheet: getFundSpreadsheet_(year), sheetName: TRANSACTION_SHEET_NAME,
      headers: TRANSACTION_HEADERS, clean: clean_, normalizeMonth: normalizeMonthKey_, normalizeHeader: normalizeHeader_,
      parseDate: parseDate_, parseNumber: parseNumber_,
      formatDate: function (date, pattern) { return Utilities.formatDate(date, APP_CONFIG.timezone, pattern); }
    });
    putFundCache_(transactionsCacheKey, result, FUND_TTL_SECONDS);
    return result;
  }

  function addFundTransaction(year, payload) {
    var result = addFundTransactions(year, [payload || {}]);
    return result.rows[0];
  }

  function validateFundTransactions(payloads) {
    return FundTransactionService.validate(payloads, fundTransactionWriteContext_());
  }

  function addFundTransactions(year, payloads, writeContext) {
    var safePayloads = Array.isArray(payloads) ? payloads : [];
    if (!safePayloads.length) {
      throw new Error('Chưa có giao dịch thu chi nào để ghi.');
    }
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var preparedPayloads = assignTransactionVouchers_(ss, sheet, safePayloads);
      var context = fundTransactionWriteContext_();
      context.spreadsheet = ss;
      context.sheet = sheet;
      context.appendOptions = { getAppendRow: getAppendRow_, buildDebtFormula: buildDebtFormula_, buildFilterFormula: buildFilterFormula_,
        flush: function () { SpreadsheetApp.flush(); }, warn: function (message, error) { console.warn(message, error); } };
      var result = FundTransactionService.addTransactions(preparedPayloads, writeContext, context);
      if (result.idempotentReplay) return result;
      bumpFundDataVersion_();
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function prepareFundTransactionVouchers(year, payloads) {
    var safePayloads = Array.isArray(payloads) ? payloads : [];
    if (!safePayloads.length) return [];
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return assignTransactionVouchers_(ss, sheet, safePayloads);
    } finally {
      lock.releaseLock();
    }
  }

  function fundTransactionWriteContext_() {
    return { repository: FundTransactionRepository, sheetName: TRANSACTION_SHEET_NAME, clean: clean_, parseDate: parseDate_,
      parseNumber: parseNumber_, buildVoucherSeed: buildVoucherSeed_, buildVoucher: buildVoucher_, headers: TRANSACTION_HEADERS };
  }

  function updateFundTransaction(year, rowIndex, payload) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var context = fundTransactionWriteContext_();
      context.sheet = sheet;
      context.writeOptions = { buildDebtFormula: buildDebtFormula_, buildFilterFormula: buildFilterFormula_, flush: function () { SpreadsheetApp.flush(); } };
      var result = FundTransactionService.updateTransaction(rowIndex, payload, context);
      bumpFundDataVersion_();
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function deleteFundTransaction(year, rowIndex) {
    var ss = getFundSpreadsheet_(year);
    var sheet = ss.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet Thu chi: ' + TRANSACTION_SHEET_NAME);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var context = fundTransactionWriteContext_();
      context.sheet = sheet;
      context.writeOptions = { flush: function () { SpreadsheetApp.flush(); } };
      var result = FundTransactionService.deleteTransaction(rowIndex, context);
      bumpFundDataVersion_();
      return result;
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

  function normalizeLoanType_(value) {
    var text = clean_(value);
    var normalized = normalizeHeader_(text);
    if (!normalized) return '';
    if (normalized === 'vay' || normalized.indexOf('vay ') === 0) return 'Vay';
    if (normalized.indexOf('lai') !== -1) return 'Trả lãi';
    if (
      normalized.indexOf('tra') !== -1 &&
      (normalized.indexOf('no') !== -1 || normalized.indexOf('goc') !== -1)
    ) {
      return 'Trả nợ';
    }
    return text;
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
        type: normalizeLoanType_(row[2]),
        rawType: clean_(row[2]),
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

  function resolveLoanPaymentCodes_(rows) {
    var resolvedRows = (rows || []).map(function (row) {
      var copy = {};
      Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
      copy.loanKey = row.code || ('row-' + row.rowIndex);
      copy.reconciledFromCode = '';
      return copy;
    });
    var states = {};

    resolvedRows.forEach(function (row) {
      if (row.type !== 'Vay' || !row.code) return;
      if (!states[row.code]) {
        states[row.code] = {
          code: row.code,
          partnerKey: normalizeHeader_(row.partner),
          borrowed: 0,
          principalPaid: 0,
          loanDateObj: row.dateObj || null
        };
      }
      states[row.code].borrowed += row.amount;
      if (row.dateObj && (!states[row.code].loanDateObj || row.dateObj < states[row.code].loanDateObj)) {
        states[row.code].loanDateObj = row.dateObj;
      }
    });

    // Ưu tiên tuyệt đối mã vay khớp chính xác trước khi đối soát các mã trả nợ bị lệch.
    resolvedRows.forEach(function (row) {
      if (row.type !== 'Trả nợ' || !row.code || !states[row.code]) return;
      row.loanKey = row.code;
      states[row.code].principalPaid += row.amount;
    });

    resolvedRows
      .filter(function (row) {
        return row.type === 'Trả nợ' && (!row.code || !states[row.code]);
      })
      .sort(function (a, b) {
        return (a.dateObj ? a.dateObj.getTime() : 0) - (b.dateObj ? b.dateObj.getTime() : 0);
      })
      .forEach(function (row) {
        var partnerKey = normalizeHeader_(row.partner);
        var candidates = Object.keys(states).map(function (key) { return states[key]; }).filter(function (state) {
          var remaining = state.borrowed - state.principalPaid;
          var beforePayment = !row.dateObj || !state.loanDateObj || state.loanDateObj <= row.dateObj;
          return partnerKey && state.partnerKey === partnerKey && beforePayment && Math.abs(remaining - row.amount) < 0.5;
        });
        // Chỉ tự ghép khi có đúng một khoản vay cùng đối tác và số dư khớp hoàn toàn.
        if (candidates.length !== 1) return;
        var match = candidates[0];
        row.loanKey = match.code;
        row.reconciledFromCode = row.code || '';
        match.principalPaid += row.amount;
      });

    return resolvedRows;
  }

  function buildLoanSummaryMap_(rows) {
    var loanMap = {};
    (rows || []).forEach(function (row) {
      var key = row.loanKey || row.code || ('row-' + row.rowIndex);
      if (!loanMap[key]) {
        loanMap[key] = {
          code: row.code,
          borrowed: 0,
          principalPaid: 0,
          principalDateObj: null
        };
      }
      if (row.type === 'Vay') loanMap[key].borrowed += row.amount;
      if (row.type === 'Trả nợ') {
        loanMap[key].principalPaid += row.amount;
        if (row.dateObj && (!loanMap[key].principalDateObj || row.dateObj > loanMap[key].principalDateObj)) {
          loanMap[key].principalDateObj = row.dateObj;
        }
      }
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
      loanKey: row.loanKey || row.code,
      reconciledFromCode: row.reconciledFromCode || '',
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

  function readFundSettings_(ss) {
    return {
      cashOpening: parseNumber_(readNamedRangeDisplay_(ss, 'TMDK')),
      bankOpening: parseNumber_(readNamedRangeDisplay_(ss, 'TKDK')),
      dataStartDate: readNamedRangeDate_(ss, 'NGAYNHAPLIEU'),
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

  function buildTransactionRow_(payload, voucherSeed, voucherIndex) {
    return FundTransactionService.buildRow(payload || {}, voucherSeed, voucherIndex, fundTransactionWriteContext_());
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

  function buildVoucherSeed_() {
    var now = new Date();
    return Utilities.formatDate(now, APP_CONFIG.timezone, 'yyMMddHHmmss') + String(now.getMilliseconds()).padStart(3, '0');
  }

  function buildVoucher_(seed, index) {
    var base = seed || buildVoucherSeed_();
    var suffix = index === undefined || index === null ? '' : '-' + String(index + 1).padStart(2, '0');
    return base + suffix;
  }

  function assignTransactionVouchers_(ss, sheet, payloads) {
    var prepared = (payloads || []).map(function (payload) {
      var copy = {};
      Object.keys(payload || {}).forEach(function (key) { copy[key] = payload[key]; });
      return copy;
    });
    var prefixes = {};
    prepared.forEach(function (payload) {
      if (clean_(payload.voucher)) return;
      var date = parseDate_(payload.date, payload.date);
      if (!date) return;
      prefixes[Utilities.formatDate(date, APP_CONFIG.timezone, 'yyMMdd')] = true;
    });
    var prefixKeys = Object.keys(prefixes);
    if (!prefixKeys.length) return prepared;

    var maxByPrefix = {};
    prefixKeys.forEach(function (prefix) { maxByPrefix[prefix] = 0; });
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (row) {
        var match = clean_(row[0]).match(/^(\d{6})(\d{6})$/);
        if (!match || maxByPrefix[match[1]] === undefined) return;
        maxByPrefix[match[1]] = Math.max(maxByPrefix[match[1]], Number(match[2]));
      });
    }

    var props = PropertiesService.getScriptProperties();
    prefixKeys.forEach(function (prefix) {
      var propertyKey = transactionVoucherPropertyKey_(ss.getId(), prefix);
      maxByPrefix[prefix] = Math.max(maxByPrefix[prefix], Number(props.getProperty(propertyKey) || 0));
    });
    prepared.forEach(function (payload) {
      if (clean_(payload.voucher)) return;
      var date = parseDate_(payload.date, payload.date);
      if (!date) return;
      var prefix = Utilities.formatDate(date, APP_CONFIG.timezone, 'yyMMdd');
      var next = maxByPrefix[prefix] + 1;
      if (next > 999999) throw new Error('Đã vượt giới hạn mã giao dịch trong ngày ' + prefix + '.');
      maxByPrefix[prefix] = next;
      payload.voucher = Number(prefix + ('000000' + next).slice(-6));
    });
    prefixKeys.forEach(function (prefix) {
      props.setProperty(transactionVoucherPropertyKey_(ss.getId(), prefix), String(maxByPrefix[prefix]));
    });
    return prepared;
  }

  function transactionVoucherPropertyKey_(spreadsheetId, prefix) {
    return 'FUND_TRANSACTION_VOUCHER_SEQ_' + spreadsheetId + '_' + prefix;
  }

  function nextLoanVoucher_(ss, sheet, date) {
    var prefix = Utilities.formatDate(date, APP_CONFIG.timezone, 'yyMMdd');
    var maxSequence = 0;
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (row) {
        var match = clean_(row[0]).match(/^(\d{6})(\d{6})$/);
        if (match && match[1] === prefix) maxSequence = Math.max(maxSequence, Number(match[2]));
      });
    }

    var properties = PropertiesService.getScriptProperties();
    var propertyKey = 'FUND_LOAN_VOUCHER_SEQ_' + ss.getId() + '_' + prefix;
    maxSequence = Math.max(maxSequence, Number(properties.getProperty(propertyKey) || 0));
    var nextSequence = maxSequence + 1;
    if (nextSequence > 999999) throw new Error('Đã vượt giới hạn mã khoản vay trong ngày ' + prefix + '.');
    properties.setProperty(propertyKey, String(nextSequence));
    return Number(prefix + ('000000' + nextSequence).slice(-6));
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

  function columnToLetter_(column) {
    var letters = '';
    var current = Number(column) || 0;
    while (current > 0) {
      var remainder = (current - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      current = Math.floor((current - remainder - 1) / 26);
    }
    return letters || 'A';
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

  function fundCacheKey_(year) {
    var parts = [FUND_CACHE_VERSION, getFundDataVersion_(), clean_(year) || 'default'];
    for (var i = 1; i < arguments.length; i++) {
      parts.push(clean_(arguments[i]) || 'all');
    }
    return parts.join(':');
  }

  function getFundDataVersion_() {
    return PropertiesService.getScriptProperties().getProperty(FUND_DATA_VERSION_PROP) || '0';
  }

  function bumpFundDataVersion_() {
    PropertiesService.getScriptProperties().setProperty(FUND_DATA_VERSION_PROP, String(new Date().getTime()));
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

  function putFundCache_(key, value, ttlSeconds) {
    var cache = CacheService.getScriptCache();
    var text = JSON.stringify(value);
    var chunkSize = 90000;
    var chunks = {};
    var count = Math.ceil(text.length / chunkSize);
    for (var i = 0; i < count; i++) {
      chunks[key + ':' + i] = text.substring(i * chunkSize, (i + 1) * chunkSize);
    }
    cache.putAll(chunks, ttlSeconds);
    cache.put(key + ':count', String(count), ttlSeconds);
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

  function formatDateKey_(date) {
    return date ? Utilities.formatDate(date, APP_CONFIG.timezone, 'yyyy-MM-dd') : '';
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
    return normalizeCleanValue_(value);
  }

  return {
    addFundTransaction: addFundTransaction,
    addFundTransactions: addFundTransactions,
    addFundLoan: addFundLoan,
    addFundLoanPayment: addFundLoanPayment,
    updateFundTransaction: updateFundTransaction,
    deleteFundTransaction: deleteFundTransaction,
    deleteFundCatalogItem: deleteFundCatalogItem,
    getFundFormOptions: getFundFormOptions,
    getFundCatalog: getFundCatalog,
    getFundLoanOverview: getFundLoanOverview,
    getFundOverview: getFundOverview,
    getFundTransactions: getFundTransactions,
    saveFundCatalogItem: saveFundCatalogItem,
    updateFundSettings: updateFundSettings,
    validateFundTransactions: validateFundTransactions,
    prepareFundTransactionVouchers: prepareFundTransactionVouchers,
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

function addFundTransactions(year, payloads) {
  return FundService.addFundTransactions(year, payloads);
}

function updateFundTransaction(year, rowIndex, payload) {
  return FundService.updateFundTransaction(year, rowIndex, payload);
}

function deleteFundTransaction(year, rowIndex) {
  return FundService.deleteFundTransaction(year, rowIndex);
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
