/** Read-side mapping and filtering for Fund transactions. */
var FundTransactionService = (function () {
  function buildRow(payload, voucherSeed, voucherIndex, context) {
    var item = payload || {};
    var type = context.clean(item.type);
    var date = context.parseDate(item.date, item.date);
    var category = context.clean(item.category);
    var amount = context.parseNumber(item.amount);
    var actor = context.clean(item.actor);
    var partner = context.clean(item.partner);
    var content = context.clean(item.content);
    var debt = item.debt === true || context.clean(item.debt) === 'Có' ? 'Có' : '';
    var offset = item.offset === true || context.normalizeHeader(item.offset) === 'true' || context.normalizeHeader(item.offset) === 'co';
    if (!date) throw new Error('Vui lòng nhập ngày hợp lệ.');
    if (type !== 'Thu' && type !== 'Chi') throw new Error('Vui lòng chọn loại Thu hoặc Chi.');
    if (!category) throw new Error('Vui lòng nhập mục thu/chi.');
    if (!(amount > 0) || !isFinite(amount) || amount > 9007199254740991) throw new Error('Số tiền phải lớn hơn 0 và hữu hạn.');
    if (!actor) throw new Error('Vui lòng nhập Người Thu/Chi.');
    if (debt && !partner) throw new Error('Khoản công nợ cần có Đối tác.');
    return [context.clean(item.voucher) || context.buildVoucher(voucherSeed, voucherIndex), date,
      type === 'Thu' ? category : '', type === 'Chi' ? category : '', '', amount, actor, partner, content, debt, '', offset ? true : ''];
  }

  function validate(payloads, context) {
    var items = Array.isArray(payloads) ? payloads : [];
    if (!items.length) throw new Error('Chưa có giao dịch thu chi nào để ghi.');
    items.forEach(function (payload, index) {
      try { buildRow(payload, 'VALIDATION', index, context); }
      catch (error) { throw new Error('Dòng ' + (index + 1) + ': ' + (error && error.message ? error.message : String(error))); }
    });
    return { ok: true, count: items.length };
  }

  function buildDebtPayment(sourceRow, payload, context) {
    var source = Array.isArray(sourceRow) ? sourceRow : [];
    var item = payload || {};
    var columns = context.repository.getColumns(context.headers || [], context.normalizeHeader);
    var voucher = columns.voucher >= 0 ? context.clean(source[columns.voucher]) : '';
    var debtFlag = context.normalizeHeader(source[columns.debt]);
    var remainingDebt = columns.remainingDebt >= 0 ? context.parseNumber(source[columns.remainingDebt]) : 0;
    var incomeCategory = context.clean(source[columns.income]);
    var expenseCategory = context.clean(source[columns.expense]);
    var type = incomeCategory ? 'Thu' : (expenseCategory ? 'Chi' : '');
    var category = incomeCategory || expenseCategory;
    var partner = context.clean(source[columns.partner]);
    var paymentAmount = context.parseNumber(item.amount);
    if (!voucher) throw new Error('Khoản công nợ không có Số phiếu để đối chiếu.');
    if (debtFlag !== 'co') throw new Error('Dòng được chọn không phải là khoản công nợ.');
    if (!(remainingDebt > 0)) throw new Error('Khoản công nợ này đã được thanh toán hết.');
    if (!type || !category) throw new Error('Khoản công nợ không có Mục thu/chi hợp lệ.');
    if (!partner) throw new Error('Khoản công nợ không có Đối tác để đối chiếu.');
    if (!(paymentAmount > 0)) throw new Error('Số tiền thanh toán phải lớn hơn 0.');
    if (paymentAmount > remainingDebt) throw new Error('Số tiền thanh toán không được vượt quá công nợ còn lại.');
    var paymentRow = buildRow({
      voucher: voucher,
      date: item.date,
      type: type,
      category: category,
      amount: paymentAmount,
      actor: item.actor,
      partner: partner,
      content: context.clean(item.content) || ('Thanh toán công nợ ' + voucher),
      debt: '',
      offset: item.offset === true
    }, '', 0, context);
    return {
      row: paymentRow,
      voucher: voucher,
      type: type,
      category: category,
      partner: partner,
      previousRemainingDebt: remainingDebt,
      paymentAmount: paymentAmount,
      expectedRemainingDebt: Math.max(0, remainingDebt - paymentAmount)
    };
  }

  function addTransactions(payloads, writeContext, context) {
    var items = Array.isArray(payloads) ? payloads : [];
    if (!items.length) throw new Error('Chưa có giao dịch thu chi nào để ghi.');
    var seed = context.buildVoucherSeed();
    var rows = items.map(function (payload, index) { return buildRow(payload, seed, index, context); });
    var existing = context.repository.findVoucherRows(context.sheet, rows.map(function (row) { return context.clean(row[0]); }), context.clean);
    var existingCount = Object.keys(existing).length;
    var spreadsheetId = context.spreadsheet.getId();
    var spreadsheetName = context.spreadsheet.getName();
    if (existingCount === rows.length) {
      var replayRows = rows.map(function (row) { return { ok: true, rowIndex: existing[context.clean(row[0])], voucher: context.clean(row[0]), spreadsheetId: spreadsheetId, spreadsheetName: spreadsheetName, sheetName: context.sheetName }; });
      return { ok: true, inserted: rows.length, spreadsheetId: spreadsheetId, spreadsheetName: spreadsheetName,
        firstRow: Math.min.apply(null, replayRows.map(function (row) { return row.rowIndex; })),
        lastRow: Math.max.apply(null, replayRows.map(function (row) { return row.rowIndex; })), rows: replayRows,
        sheetName: context.sheetName, idempotentReplay: true, jobId: writeContext && writeContext.jobId ? writeContext.jobId : '' };
    }
    if (existingCount > 0) throw new Error('Batch Thu chi đã tồn tại một phần voucher; dừng ghi để tránh nhân đôi dữ liệu.');
    var range = context.repository.appendRows(context.sheet, rows, context.appendOptions);
    return { ok: true, inserted: rows.length, spreadsheetId: spreadsheetId, spreadsheetName: spreadsheetName,
      firstRow: range.firstRow, lastRow: range.lastRow,
      rows: rows.map(function (row, index) { return { ok: true, rowIndex: range.firstRow + index, voucher: row[0], spreadsheetId: spreadsheetId, spreadsheetName: spreadsheetName, sheetName: context.sheetName }; }),
      sheetName: context.sheetName };
  }

  function updateTransaction(rowIndex, payload, context) {
    var rowNumber = parseInt(rowIndex, 10);
    if (!(rowNumber > 1)) throw new Error('Số dòng thu chi không hợp lệ: ' + rowIndex);
    var item = payload || {};
    var existing = context.repository.readRow(context.sheet, rowNumber, context.headers.length);
    if (!context.clean(existing[0])) throw new Error('Không tìm thấy giao dịch cần sửa.');
    var row = buildRow(item, undefined, undefined, context);
    if (context.clean(item.voucher) && context.clean(item.voucher) !== context.clean(existing[0])) throw new Error('Không được đổi Số phiếu của giao dịch.');
    row[0] = context.clean(existing[0]);
    row[4] = context.clean(existing[4]);
    row[10] = existing[10];
    if (item.offset === undefined || item.offset === null) row[11] = existing[11] === true || context.normalizeHeader(existing[11]) === 'true' ? true : '';
    var expected = item.expectedTransaction;
    if (!expected || !context.clean(expected.voucher)) throw new Error('Thiếu dấu vân tay giao dịch để sửa an toàn.');
    if (!sameIdentity_(transactionIdentity_(existing, context), expected, context)) {
      if (sameIdentity_(transactionIdentity_(existing, context), transactionIdentity_(row, context), context)) {
        return { ok: true, rowIndex: rowNumber, voucher: row[0], sheetName: context.sheetName, idempotentReplay: true };
      }
      throw new Error('Dòng Thu chi đã thay đổi; tải lại trước khi sửa.');
    }
    context.repository.updateRow(context.sheet, rowNumber, row, context.writeOptions);
    return { ok: true, rowIndex: rowNumber, voucher: row[0], sheetName: context.sheetName };
  }

  function transactionIdentity_(row, context) {
    var values = Array.isArray(row) ? row : [];
    var date = context.parseDate(values[1], values[1]);
    var income = context.clean(values[2]);
    var expense = context.clean(values[3]);
    return {
      voucher: context.clean(values[0]),
      date: date && context.formatDate ? context.formatDate(date, 'yyyy-MM-dd') : context.clean(values[1]),
      type: income ? 'Thu' : (expense ? 'Chi' : ''),
      category: income || expense,
      amount: context.parseNumber(values[5]),
      actor: context.clean(values[6]),
      partner: context.clean(values[7]),
      content: context.clean(values[8]),
      debt: context.normalizeHeader(values[9]) === 'co',
      offset: values[11] === true || context.normalizeHeader(values[11]) === 'true'
    };
  }

  function sameIdentity_(actual, wanted, context) {
    var normalized = {
      voucher: context.clean(wanted.voucher), date: context.clean(wanted.date).slice(0, 10),
      type: context.clean(wanted.type), category: context.clean(wanted.category), amount: context.parseNumber(wanted.amount),
      actor: context.clean(wanted.actor), partner: context.clean(wanted.partner), content: context.clean(wanted.content),
      debt: wanted.debt === true || context.normalizeHeader(wanted.debt) === 'co', offset: wanted.offset === true
    };
    return Object.keys(normalized).every(function (field) { return actual[field] === normalized[field]; });
  }

  function assertIdentity(row, expected, context) {
    if (!expected || !context.clean(expected.voucher) || !sameIdentity_(transactionIdentity_(row, context), expected, context)) {
      throw new Error('Dòng Thu chi đã thay đổi hoặc thiếu dấu vân tay; dừng ghi để tránh nhầm giao dịch.');
    }
  }

  function deleteTransaction(rowIndex, expected, context) {
    var rowNumber = parseInt(rowIndex, 10);
    if (!(rowNumber > 1)) throw new Error('Số dòng thu chi không hợp lệ: ' + rowIndex);
    var existing = context.repository.readRow(context.sheet, rowNumber, 13);
    if (!existing.slice(0, 10).concat([existing[11]]).some(function (cell) { return context.clean(cell); })) {
      return { ok: true, rowIndex: rowNumber, sheetName: context.sheetName, idempotentReplay: true };
    }
    var wanted = expected || {};
    if (!context.clean(wanted.voucher) || !context.clean(wanted.date) || !context.clean(wanted.type) ||
        !context.clean(wanted.category) || !(context.parseNumber(wanted.amount) > 0)) {
      throw new Error('Thiếu dấu vân tay giao dịch để xóa an toàn.');
    }
    var actual = transactionIdentity_(existing, context);
    assertIdentity(existing, wanted, context);
    context.repository.clearRow(context.sheet, rowNumber, context.writeOptions);
    return { ok: true, rowIndex: rowNumber, voucher: actual.voucher, sheetName: context.sheetName };
  }

  function getTransactions(year, filter, context) {
    var snapshot = context.repository.readSnapshot(context.spreadsheet, {
      sheetName: context.sheetName, headers: context.headers, normalizeHeader: context.normalizeHeader
    });
    var state = beginCapture(year, filter, context);
    appendCapture(state, snapshot, filter, context);
    return finishCapture(state);
  }

  function beginCapture(year, filter, context) {
    var options = filter || {};
    var completeCapture = options.completeCapture === true;
    return { year: context.clean(year) || '', sheetName: context.sheetName, headers: context.headers,
      selectedMonth: context.normalizeMonth(options.month), empty: true, monthMap: {}, transactions: [], totalRows: 0,
      completeCapture: completeCapture,
      limit: completeCapture ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.min(parseInt(options.limit, 10) || 300, 1000)) };
  }

  function appendCapture(state, snapshot, filter, context) {
    if (snapshot.empty) return state;
    state.empty = false;
    state.headers = snapshot.headers.slice(0, context.headers.length);
    var options = filter || {};
    var selectedMonth = state.selectedMonth;
    var startFilter = context.parseDate(options.startDate, options.startDate);
    var endFilter = context.parseDate(options.endDate, options.endDate);
    var searchFilter = context.normalizeHeader(options.search || options.query || '');
    // Page-local only: use the configured formatter, never UTC calendar fields.
    // A new append/retry gets a fresh cache; nothing is persisted with the capture.
    var dateFormats = Object.create(null);
    function dateFields(date) {
      var key = String(date.getTime());
      if (!Object.prototype.hasOwnProperty.call(dateFormats, key)) {
        var iso = context.formatDate(date, 'yyyy-MM-dd');
        dateFormats[key] = /^\d{4}-\d{2}-\d{2}$/.test(iso)
          ? { date: iso, month: iso.slice(0, 7), label: iso.slice(5, 7) + '/' + iso.slice(0, 4) }
          : { date: iso, month: context.formatDate(date, 'yyyy-MM'), label: context.formatDate(date, 'MM/yyyy') };
      }
      return dateFormats[key];
    }
    snapshot.displayValues.forEach(function (row, index) {
      if (!row.slice(0, context.headers.length).some(function (cell) { return context.clean(cell); })) return;
      var columns = snapshot.columns;
      var parsedDate = context.parseDate(snapshot.rawDateValues[index][0], row[columns.date]);
      var formatted = parsedDate ? dateFields(parsedDate) : null;
      var monthKey = formatted ? formatted.month : '';
      var monthLabel = formatted ? formatted.label : '';
      if (monthKey) state.monthMap[monthKey] = monthLabel;
      if (selectedMonth && monthKey !== selectedMonth) return;
      if (startFilter && (!parsedDate || parsedDate < startFilter)) return;
      if (endFilter && (!parsedDate || parsedDate > endFilter)) return;
      var incomeCategory = context.clean(row[columns.income]);
      var expenseCategory = context.clean(row[columns.expense]);
      var transaction = {
        rowIndex: index + (snapshot.startRow || 2),
        voucher: columns.voucher >= 0 ? context.clean(row[columns.voucher]) : '',
        date: formatted ? formatted.date : context.clean(row[columns.date]),
        dateText: context.clean(row[columns.date]), month: monthKey, monthLabel: monthLabel,
        type: incomeCategory ? 'Thu' : (expenseCategory ? 'Chi' : ''), category: incomeCategory || expenseCategory,
        incomeCategory: incomeCategory, expenseCategory: expenseCategory,
        method: context.clean(row[columns.method]), amount: context.parseNumber(row[columns.amount]), amountText: context.clean(row[columns.amount]),
        actor: context.clean(row[columns.actor]), partner: context.clean(row[columns.partner]), content: context.clean(row[columns.content]), debt: context.clean(row[columns.debt]),
        offset: columns.offset >= 0 && context.normalizeHeader(row[columns.offset]) === 'true',
        remainingDebt: columns.remainingDebt >= 0 ? context.parseNumber(row[columns.remainingDebt]) : 0
      };
      if (searchFilter) {
        var searchable = context.normalizeHeader([transaction.voucher, transaction.dateText, transaction.type, transaction.category, transaction.amountText, transaction.actor, transaction.partner, transaction.content, transaction.debt, transaction.offset ? 'Không qua Quỹ Cấn trừ' : ''].join(' '));
        if (searchable.indexOf(searchFilter) < 0) return;
      }
      state.totalRows++;
      state.transactions.push(transaction);
    });
    state.transactions.sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.rowIndex - a.rowIndex; });
    if (!state.completeCapture) state.transactions = state.transactions.slice(0, state.limit);
    return state;
  }

  function finishCapture(state) {
    if (state.empty) {
      var emptyResult = { ok: true, year: state.year, sheetName: state.sheetName, headers: state.headers, months: [], transactions: [] };
      if (state.completeCapture) {
        emptyResult.totalRows = 0;
        emptyResult.limited = false;
        emptyResult.completeCapture = true;
      }
      return emptyResult;
    }
    return { ok: true, year: state.year, sheetName: state.sheetName, headers: state.headers,
      months: Object.keys(state.monthMap).sort().reverse().map(function (key) { return { key: key, label: state.monthMap[key] }; }),
      selectedMonth: state.selectedMonth, transactions: state.transactions, totalRows: state.totalRows,
      limited: !state.completeCapture && state.totalRows > state.limit, completeCapture: state.completeCapture === true };
  }

  return { assertIdentity: assertIdentity, buildRow: buildRow, buildDebtPayment: buildDebtPayment, validate: validate, addTransactions: addTransactions, updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction, getTransactions: getTransactions, beginCapture: beginCapture, appendCapture: appendCapture, finishCapture: finishCapture };
})();
