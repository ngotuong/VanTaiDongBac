/** Read-side mapping and filtering for Fund transactions. */
var FundTransactionService = (function () {
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
        actor: context.clean(row[columns.actor]), partner: context.clean(row[columns.partner]), content: context.clean(row[columns.content]), debt: context.clean(row[columns.debt])
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

  return { getTransactions: getTransactions };
})();
