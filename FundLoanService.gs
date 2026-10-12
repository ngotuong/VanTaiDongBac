/** Read, reconciliation, and aggregation rules for Fund loans. */
var FundLoanService = (function () {
  function normalizeType(value, context) {
    var text = context.clean(value);
    var normalized = context.normalizeHeader(text);
    if (!normalized) return '';
    if (normalized === 'vay' || normalized.indexOf('vay ') === 0) return 'Vay';
    if (normalized.indexOf('lai') !== -1) return 'Trả lãi';
    if (normalized.indexOf('tra') !== -1 && (normalized.indexOf('no') !== -1 || normalized.indexOf('goc') !== -1)) return 'Trả nợ';
    return text;
  }

  function buildLoanRow(payload, context) {
    var item = payload || {}, date = context.parseDate(item.date, item.date), partner = context.clean(item.partner), amount = context.parseNumber(item.amount);
    var firstInterestDate = context.parseDate(item.firstInterestDate, item.firstInterestDate);
    if (!date) throw new Error('Vui lòng nhập ngày vay hợp lệ.');
    if (!partner) throw new Error('Vui lòng nhập đối tác cho khoản vay.');
    if (!(amount > 0) || !isFinite(amount) || amount > 9007199254740991) throw new Error('Số tiền vay phải lớn hơn 0.');
    return [context.buildVoucher(date), date, 'Vay', '', partner, amount, context.parseNumber(item.termMonths) || '',
      context.parseNumber(item.annualRate) || '', context.parseNumber(item.interestPeriodMonths) || '', firstInterestDate || '', context.clean(item.content), item.nonFund === true];
  }

  function buildPaymentRow(payload, context) {
    var item = payload || {}, date = context.parseDate(item.date, item.date), code = context.clean(item.code), type = context.clean(item.type);
    var partner = context.clean(item.partner), amount = context.parseNumber(item.amount);
    if (!date) throw new Error('Vui lòng nhập ngày thanh toán hợp lệ.');
    if (!code) throw new Error('Thiếu mã khoản vay cần thanh toán.');
    if (type !== 'Trả nợ' && type !== 'Trả lãi') throw new Error('Vui lòng chọn Trả nợ hoặc Trả lãi.');
    if (!partner) throw new Error('Vui lòng nhập đối tác cho khoản vay.');
    if (!(amount > 0) || !isFinite(amount) || amount > 9007199254740991) throw new Error('Số tiền thanh toán phải lớn hơn 0.');
    return [code, date, type, '', partner, amount, '', '', '', '', context.clean(item.content), item.nonFund === true];
  }

  function buildFilterFormula(rowNumber) {
    return '=IF(BC_VAY!$P$9="";"";A' + rowNumber + ')&IF(BC_VAY!$R$9="";"";C' + rowNumber + ')&IF(BC_VAY!$S$9="";"";E' + rowNumber + ')';
  }

  function addLoan(payload, context) {
    var replay = findReplay(context);
    if (replay) return replay;
    var row = buildLoanRow(payload, context);
    if (context.writeContext && context.writeContext.jobId) return persistIntent_(row, context);
    context.appendOptions.jobId = context.writeContext && context.writeContext.jobId;
    var rowNumber = context.repository.appendRow(context.sheet, row, context.appendOptions);
    return { ok: true, rowIndex: rowNumber, code: row[0], sheetName: context.sheetName };
  }

  function addPayment(payload, context) {
    var replay = findReplay(context);
    if (replay) return replay;
    var row = buildPaymentRow(payload, context);
    if (context.writeContext && context.writeContext.jobId) return persistIntent_(row, context);
    context.appendOptions.jobId = context.writeContext && context.writeContext.jobId;
    var rowNumber = context.repository.appendRow(context.sheet, row, context.appendOptions);
    return { ok: true, rowIndex: rowNumber, code: row[0], sheetName: context.sheetName };
  }

  function findReplay(context) {
    var jobId = context.writeContext && context.writeContext.jobId;
    if (!jobId) return null;
    var journal = FundWriteIntentRepository.find(context.sheet, jobId, context.writeIntent || {});
    if (journal) {
      FundWriteIntentRepository.verifyRows(context.sheet, journal);
      if (journal.state !== 'complete') return persistIntent_(null, context, journal);
      return { ok: true, rowIndex: journal.firstRow, code: journal.rows[0][0], sheetName: context.sheetName, idempotentReplay: true };
    }
    var found = context.repository.findJobRow(context.sheet, jobId);
    if (found) throw new Error('REQUIRES_RECONCILIATION: Marker vay legacy chưa có hash intent; đối soát trước khi retry.');
    return null;
  }

  function persistIntent_(row, context, journal) {
    var id = context.writeContext.jobId;
    journal = journal || FundWriteIntentRepository.prepare(context.sheet, id, context.writeIntent || {}, [row], {}, context.appendOptions.getAppendRow);
    context.appendOptions.reservedRow = journal.firstRow;
    context.repository.appendRow(context.sheet, FundWriteIntentRepository.rows(journal)[0], context.appendOptions);
    SpreadsheetApp.flush();
    FundWriteIntentRepository.verifyRows(context.sheet, journal);
    var result = { ok: true, rowIndex: journal.firstRow, code: journal.rows[0][0], sheetName: context.sheetName };
    FundWriteIntentRepository.complete(context.sheet, journal, result);
    return result;
  }

  function assertPaymentAllowed(payload, rows, context) {
    var item = payload || {};
    var code = context.clean(item.code);
    var partnerKey = context.normalizeHeader(item.partner);
    var type = context.clean(item.type);
    var paymentAmount = context.parseNumber(item.amount);
    var matching = reconcile(rows || [], context).filter(function (row) { return row.loanKey === code; });
    var loans = matching.filter(function (row) { return row.type === 'Vay'; });
    if (!loans.length) throw new Error('Không tìm thấy khoản vay có mã ' + code + '.');
    var loanPartnerKey = context.normalizeHeader(loans[0].partner);
    var nonFund = loans[0].nonFund === true;
    var ambiguous = loans.some(function (row) {
      return context.normalizeHeader(row.partner) !== loanPartnerKey || (row.nonFund === true) !== nonFund;
    });
    if (ambiguous) throw new Error('Mã khoản vay có nhiều thông tin gốc không nhất quán; cần đối chiếu trước khi thanh toán.');
    if (!partnerKey || partnerKey !== loanPartnerKey) throw new Error('Đối tác thanh toán không khớp khoản vay.');
    var borrowed = loans.reduce(function (sum, row) { return sum + context.parseNumber(row.amount); }, 0);
    var principalPaid = matching.filter(function (row) { return row.type === 'Trả nợ'; })
      .reduce(function (sum, row) { return sum + context.parseNumber(row.amount); }, 0);
    var outstanding = borrowed - principalPaid;
    if (!(outstanding > 0.5)) throw new Error('Khoản vay này đã trả hết nợ gốc.');
    if (type === 'Trả nợ' && paymentAmount - outstanding > 0.5) {
      throw new Error('Số tiền trả nợ không được vượt quá dư nợ còn lại.');
    }
    return { partner: loans[0].partner, nonFund: nonFund, outstanding: outstanding };
  }

  function readRows(context) {
    var snapshot = context.repository.readSnapshot(context.spreadsheet, context.sheetName);
    var rows = [];
    snapshot.displayValues.forEach(function (row, index) {
      if (!row.slice(0, 11).some(function (cell) { return context.clean(cell); })) return;
      var dateObj = context.parseDate(snapshot.rawDateValues[index][0], row[1]);
      rows.push({ rowIndex: index + 2, code: context.clean(row[0]), dateObj: dateObj,
        date: dateObj ? context.formatDate(dateObj, 'yyyy-MM-dd') : context.clean(row[1]), dateText: context.clean(row[1]),
        month: dateObj ? context.formatDate(dateObj, 'yyyy-MM') : '', monthLabel: dateObj ? context.formatDate(dateObj, 'MM/yyyy') : '',
        type: normalizeType(row[2], context), rawType: context.clean(row[2]), method: context.clean(row[3]), partner: context.clean(row[4]),
        amount: context.parseNumber(row[5]), amountText: context.clean(row[5]), termMonths: context.parseNumber(row[6]),
        annualRate: context.parseNumber(row[7]), interestPeriodMonths: context.parseNumber(row[8]), firstInterestDate: context.clean(row[9]), content: context.clean(row[10]),
        nonFund: context.normalizeHeader(row[11]) === 'true' });
    });
    return rows;
  }

  function reconcile(rows, context) {
    var resolved = (rows || []).map(function (row) { var copy = {}; Object.keys(row).forEach(function (key) { copy[key] = row[key]; }); copy.loanKey = row.code || ('row-' + row.rowIndex); copy.reconciledFromCode = ''; return copy; });
    var states = {};
    resolved.forEach(function (row) {
      if (row.type !== 'Vay' || !row.code) return;
      if (!states[row.code]) states[row.code] = { code: row.code, partnerKey: context.normalizeHeader(row.partner), borrowed: 0, principalPaid: 0, loanDateObj: row.dateObj || null };
      states[row.code].borrowed += row.amount;
      if (row.dateObj && (!states[row.code].loanDateObj || row.dateObj < states[row.code].loanDateObj)) states[row.code].loanDateObj = row.dateObj;
    });
    resolved.forEach(function (row) { if (row.type === 'Trả nợ' && row.code && states[row.code]) { row.loanKey = row.code; states[row.code].principalPaid += row.amount; } });
    resolved.filter(function (row) { return row.type === 'Trả nợ' && (!row.code || !states[row.code]); })
      .sort(function (a, b) { return (a.dateObj ? a.dateObj.getTime() : 0) - (b.dateObj ? b.dateObj.getTime() : 0); })
      .forEach(function (row) {
        var partnerKey = context.normalizeHeader(row.partner);
        var candidates = Object.keys(states).map(function (key) { return states[key]; }).filter(function (state) {
          var beforePayment = !row.dateObj || !state.loanDateObj || state.loanDateObj <= row.dateObj;
          return partnerKey && state.partnerKey === partnerKey && beforePayment && Math.abs(state.borrowed - state.principalPaid - row.amount) < 0.5;
        });
        if (candidates.length !== 1) return;
        row.loanKey = candidates[0].code; row.reconciledFromCode = row.code || ''; candidates[0].principalPaid += row.amount;
      });
    return resolved;
  }

  function buildSummaryMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = row.loanKey || row.code || ('row-' + row.rowIndex);
      if (!map[key]) map[key] = { code: row.code, borrowed: 0, principalPaid: 0, principalDateObj: null };
      if (row.type === 'Vay') map[key].borrowed += row.amount;
      if (row.type === 'Trả nợ') { map[key].principalPaid += row.amount; if (row.dateObj && (!map[key].principalDateObj || row.dateObj > map[key].principalDateObj)) map[key].principalDateObj = row.dateObj; }
    });
    Object.keys(map).forEach(function (key) { map[key].outstanding = map[key].borrowed - map[key].principalPaid; map[key].isSettled = map[key].borrowed > 0 && map[key].outstanding <= 0; });
    return map;
  }

  function historyRow(row, overallLoan) {
    return { rowIndex: row.rowIndex, code: row.code, loanKey: row.loanKey || row.code, reconciledFromCode: row.reconciledFromCode || '',
      dateObj: row.dateObj, date: row.date, dateText: row.dateText, month: row.month, monthLabel: row.monthLabel, type: row.type,
      method: row.method, partner: row.partner, amount: row.amount, amountText: row.amountText, termMonths: row.termMonths,
      annualRate: row.annualRate, interestPeriodMonths: row.interestPeriodMonths, firstInterestDate: row.firstInterestDate, content: row.content, nonFund: row.nonFund === true,
      isSettled: Boolean(overallLoan && overallLoan.isSettled), statusLabel: overallLoan && overallLoan.isSettled ? 'Đã trả gốc' : '' };
  }

  function getOverview(filter, context) {
    var rows = reconcile(readRows(context), context);
    var months = context.buildMonths(rows);
    var monthKey = context.normalizeMonth((filter || {}).month);
    var explicitStart = context.parseDate((filter || {}).startDate, (filter || {}).startDate);
    var explicitEnd = context.parseDate((filter || {}).endDate, (filter || {}).endDate);
    if (explicitEnd) explicitEnd.setHours(23, 59, 59, 999);
    var period = explicitStart && explicitEnd ? { start: explicitStart, end: explicitEnd } : (monthKey ? context.monthPeriod(monthKey) : null);
    var overallMap = buildSummaryMap(rows);
    var filtered = period ? rows.filter(function (row) { return row.dateObj && row.dateObj >= period.start && row.dateObj <= period.end; }) : rows;
    var summary = period ? rows.filter(function (row) { return row.dateObj && row.dateObj <= period.end; }) : rows;
    var totalBorrowed = 0, totalPrincipalPaid = 0, totalInterestPaid = 0, outstandingBorrowed = 0, outstandingPaid = 0, loanMap = {};
    filtered.forEach(function (row) { if (row.type === 'Vay') totalBorrowed += row.amount; if (row.type === 'Trả nợ') totalPrincipalPaid += row.amount; if (row.type === 'Trả lãi') totalInterestPaid += row.amount; });
    summary.forEach(function (row) {
      var key = row.loanKey || row.code || ('row-' + row.rowIndex);
      if (!loanMap[key]) loanMap[key] = { code: row.code, partner: row.partner, borrowed: 0, principalPaid: 0, interestPaid: 0, loanDateObj: null, principalDateObj: null,
        latestDate: row.date, content: row.content, termMonths: row.termMonths, annualRate: row.annualRate, interestPeriodMonths: row.interestPeriodMonths, firstInterestDate: row.firstInterestDate };
      var item = loanMap[key];
      if (row.type === 'Vay') { item.borrowed += row.amount; outstandingBorrowed += row.amount; if (!item.loanDateObj || row.dateObj < item.loanDateObj) item.loanDateObj = row.dateObj; }
      if (row.type === 'Trả nợ') { item.principalPaid += row.amount; outstandingPaid += row.amount; if (!item.principalDateObj || row.dateObj > item.principalDateObj) item.principalDateObj = row.dateObj; }
      if (row.type === 'Trả lãi') item.interestPaid += row.amount;
      if (row.date > item.latestDate) item.latestDate = row.date;
    });
    var loans = Object.keys(loanMap).map(function (key) {
      var item = loanMap[key], current = overallMap[key] || null;
      item.outstanding = item.borrowed - item.principalPaid;
      item.loanDate = item.loanDateObj ? context.formatDate(item.loanDateObj, 'yyyy-MM-dd') : ''; item.loanDateText = item.loanDateObj ? context.formatDate(item.loanDateObj, 'dd/MM/yyyy') : '';
      item.principalLatestDate = item.principalDateObj ? context.formatDate(item.principalDateObj, 'yyyy-MM-dd') : ''; item.principalLatestDateText = item.principalDateObj ? context.formatDate(item.principalDateObj, 'dd/MM/yyyy') : '';
      item.currentOutstanding = current ? current.outstanding : item.outstanding; item.isCurrentlySettled = Boolean(current && current.isSettled);
      item.currentSettlementDate = current && current.principalDateObj ? context.formatDate(current.principalDateObj, 'yyyy-MM-dd') : '';
      item.currentSettlementDateText = current && current.principalDateObj ? context.formatDate(current.principalDateObj, 'dd/MM/yyyy') : '';
      return item;
    }).sort(function (a, b) {
      if (a.isCurrentlySettled !== b.isCurrentlySettled) return a.isCurrentlySettled ? 1 : -1;
      if (a.loanDate !== b.loanDate) return a.loanDate < b.loanDate ? 1 : -1;
      var partnerCompare = context.normalizeHeader(a.partner).localeCompare(context.normalizeHeader(b.partner));
      if (partnerCompare) return partnerCompare;
      return context.clean(a.code).localeCompare(context.clean(b.code));
    });
    return { ok: true, months: months, selectedMonth: monthKey,
      metrics: [{ key: 'borrowed', label: 'Tổng khoản vay', value: totalBorrowed }, { key: 'principalPaid', label: 'Đã trả nợ gốc', value: totalPrincipalPaid },
        { key: 'interestPaid', label: 'Đã trả lãi', value: totalInterestPaid }, { key: 'outstanding', label: period ? 'Dư nợ cuối kỳ' : 'Dư nợ hiện tại', value: outstandingBorrowed - outstandingPaid }],
      loans: loans, recentRows: filtered.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (row) { return historyRow(row, overallMap[row.loanKey || row.code || ('row-' + row.rowIndex)] || null); }) };
  }

  return { normalizeType: normalizeType, buildLoanRow: buildLoanRow, buildPaymentRow: buildPaymentRow, buildFilterFormula: buildFilterFormula,
    addLoan: addLoan, addPayment: addPayment, findReplay: findReplay, assertPaymentAllowed: assertPaymentAllowed,
    readRows: readRows, reconcile: reconcile, buildSummaryMap: buildSummaryMap, historyRow: historyRow, getOverview: getOverview };
})();
