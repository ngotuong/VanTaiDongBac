/** Read-side mapping and filtering for Fund transactions. */
var FundTransactionService = (function () {
  function buildRow(payload, voucherSeed, voucherIndex, context) {
    var item = payload || {};
    var type = context.clean(item.type);
    var date = context.parseDate(item.date, item.date);
    var category = context.clean(item.category);
    var method = context.clean(item.method);
    var amount = context.parseNumber(item.amount);
    var actor = context.clean(item.actor);
    var partner = context.clean(item.partner);
    var content = context.clean(item.content);
    var debt = item.debt === true || context.clean(item.debt) === 'Có' ? 'Có' : '';
    if (!date) throw new Error('Vui lòng nhập ngày hợp lệ.');
    if (type !== 'Thu' && type !== 'Chi') throw new Error('Vui lòng chọn loại Thu hoặc Chi.');
    if (!category) throw new Error('Vui lòng nhập mục thu/chi.');
    if (!method) throw new Error('Vui lòng chọn hình thức.');
    if (!(amount > 0)) throw new Error('Số tiền phải lớn hơn 0.');
    if (!actor) throw new Error('Vui lòng nhập Người Thu/Chi.');
    if (debt && !partner) throw new Error('Khoản công nợ cần có Đối tác.');
    return [context.clean(item.voucher) || context.buildVoucher(voucherSeed, voucherIndex), date,
      type === 'Thu' ? category : '', type === 'Chi' ? category : '', method, amount, actor, partner, content, debt];
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
    var row = buildRow(item, undefined, undefined, context);
    row[0] = context.clean(item.voucher) || context.clean(existing[0]) || row[0];
    row[4] = context.clean(item.method) || context.clean(existing[4]) || row[4];
    context.repository.updateRow(context.sheet, rowNumber, row, context.writeOptions);
    return { ok: true, rowIndex: rowNumber, voucher: row[0], sheetName: context.sheetName };
  }

  function deleteTransaction(rowIndex, context) {
    var rowNumber = parseInt(rowIndex, 10);
    if (!(rowNumber > 1)) throw new Error('Số dòng thu chi không hợp lệ: ' + rowIndex);
    context.repository.deleteRow(context.sheet, rowNumber, context.writeOptions);
    return { ok: true, rowIndex: rowNumber, sheetName: context.sheetName };
  }

  function getTransactions(year, filter, context) {
    var options = filter || {};
    var selectedMonth = context.normalizeMonth(options.month);
    var startFilter = context.parseDate(options.startDate, options.startDate);
    var endFilter = context.parseDate(options.endDate, options.endDate);
    var searchFilter = context.normalizeHeader(options.search || options.query || '');
    var limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 300, 1000));
    var snapshot = context.repository.readSnapshot(context.spreadsheet, {
      sheetName: context.sheetName,
      headers: context.headers,
      normalizeHeader: context.normalizeHeader
    });
    if (snapshot.empty) {
      return { ok: true, year: context.clean(year) || '', sheetName: context.sheetName, headers: context.headers, months: [], transactions: [] };
    }

    var transactions = [];
    var monthMap = {};
    snapshot.displayValues.forEach(function (row, index) {
      if (!row.slice(0, context.headers.length).some(function (cell) { return context.clean(cell); })) return;
      var columns = snapshot.columns;
      var parsedDate = context.parseDate(snapshot.rawDateValues[index][0], row[columns.date]);
      var monthKey = parsedDate ? context.formatDate(parsedDate, 'yyyy-MM') : '';
      var monthLabel = parsedDate ? context.formatDate(parsedDate, 'MM/yyyy') : '';
      if (monthKey) monthMap[monthKey] = monthLabel;
      if (selectedMonth && monthKey !== selectedMonth) return;
      if (startFilter && (!parsedDate || parsedDate < startFilter)) return;
      if (endFilter && (!parsedDate || parsedDate > endFilter)) return;
      var incomeCategory = context.clean(row[columns.income]);
      var expenseCategory = context.clean(row[columns.expense]);
      var transaction = {
        rowIndex: index + 2,
        voucher: columns.voucher >= 0 ? context.clean(row[columns.voucher]) : '',
        date: parsedDate ? context.formatDate(parsedDate, 'yyyy-MM-dd') : context.clean(row[columns.date]),
        dateText: context.clean(row[columns.date]), month: monthKey, monthLabel: monthLabel,
        type: incomeCategory ? 'Thu' : (expenseCategory ? 'Chi' : ''), category: incomeCategory || expenseCategory,
        incomeCategory: incomeCategory, expenseCategory: expenseCategory,
        method: context.clean(row[columns.method]), amount: context.parseNumber(row[columns.amount]), amountText: context.clean(row[columns.amount]),
        actor: context.clean(row[columns.actor]), partner: context.clean(row[columns.partner]), content: context.clean(row[columns.content]), debt: context.clean(row[columns.debt]),
        remainingDebt: columns.remainingDebt >= 0 ? context.parseNumber(row[columns.remainingDebt]) : 0
      };
      if (searchFilter) {
        var searchable = context.normalizeHeader([transaction.voucher, transaction.dateText, transaction.type, transaction.category, transaction.amountText, transaction.actor, transaction.partner, transaction.content, transaction.debt].join(' '));
        if (searchable.indexOf(searchFilter) < 0) return;
      }
      transactions.push(transaction);
    });
    transactions.sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.rowIndex - a.rowIndex; });
    return {
      ok: true, year: context.clean(year) || '', sheetName: context.sheetName,
      headers: snapshot.headers.slice(0, context.headers.length),
      months: Object.keys(monthMap).sort().reverse().map(function (key) { return { key: key, label: monthMap[key] }; }),
      selectedMonth: selectedMonth, transactions: transactions.slice(0, limit), totalRows: transactions.length, limited: transactions.length > limit
    };
  }

  return { buildRow: buildRow, validate: validate, addTransactions: addTransactions, updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction, getTransactions: getTransactions };
})();
