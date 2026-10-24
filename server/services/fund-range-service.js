function createFundRangeService() {
  const text = (value) => String(value == null ? '' : value).trim();
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const dateKey = (row) => {
    const raw = text(row?.date || row?.dateText || row?.loanDate || row?.loanDateText);
    const vi = raw.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
    return vi ? `${vi[3]}-${vi[2]}-${vi[1]}` : raw.slice(0, 10);
  };
  const metric = (payload, key) => number((payload.metrics || []).find((item) => item.key === key)?.value);
  const inRange = (row, startDate, endDate) => {
    const date = dateKey(row);
    return Boolean(date && date >= startDate && date <= endDate);
  };
  const categoryRows = (rows) => {
    const grouped = new Map();
    rows.forEach((entry) => {
      const key = text(entry.category);
      if (!key) return;
      const current = grouped.get(key) || { category: key, amount: 0, count: 0, details: [] };
      current.amount += number(entry.amount);
      current.count += 1;
      current.details.push(entry);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, 'vi'));
  };

  function buildOverviewRange(input, startDate, endDate) {
    const payloads = Array.isArray(input) ? input : [input];
    const openingPayload = payloads[0] || {};
    const latestPayload = payloads[payloads.length - 1] || openingPayload;
    const incomeAll = payloads.flatMap((payload) => (payload.incomeCategories || []).flatMap((item) => item.details || []));
    const expenseAll = payloads.flatMap((payload) => (payload.expenseCategories || []).flatMap((item) => item.details || []));
    const beforeIncome = incomeAll.filter((row) => dateKey(row) && dateKey(row) < startDate).reduce((sum, row) => sum + number(row.amount), 0);
    const beforeExpense = expenseAll.filter((row) => dateKey(row) && dateKey(row) < startDate).reduce((sum, row) => sum + number(row.amount), 0);
    const incomeRows = incomeAll.filter((row) => inRange(row, startDate, endDate));
    const expenseRows = expenseAll.filter((row) => inRange(row, startDate, endDate));
    const income = incomeRows.reduce((sum, row) => sum + number(row.amount), 0);
    const expense = expenseRows.reduce((sum, row) => sum + number(row.amount), 0);
    const openingBalance = metric(openingPayload, 'openingBalance') + beforeIncome - beforeExpense;
    const net = income - expense;
    return {
      ...latestPayload,
      months: payloads.flatMap((payload) => payload.months || []).filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index),
      selectedMonth: '',
      metrics: [
        { key: 'openingBalance', label: 'Số dư đầu kỳ', value: openingBalance },
        { key: 'periodIncome', label: 'Thu trong kỳ', value: income },
        { key: 'periodExpense', label: 'Chi trong kỳ', value: expense },
        { key: 'periodNet', label: 'Tổng thu chi', value: net },
        { key: 'closingBalance', label: 'Số dư cuối kỳ', value: openingBalance + net },
        { key: 'currentBalance', label: 'Số dư hiện tại', value: metric(latestPayload, 'currentBalance') }
      ],
      incomeCategories: categoryRows(incomeRows),
      expenseCategories: categoryRows(expenseRows),
      supabaseCached: true
    };
  }

  function buildLoansRange(payload, startDate, endDate) {
    const allRows = payload.recentRows || [];
    const filtered = allRows.filter((row) => inRange(row, startDate, endDate));
    const summary = allRows.filter((row) => dateKey(row) && dateKey(row) <= endDate);
    const currentByCode = new Map((payload.loans || []).map((loan) => [text(loan.code), loan]));
    const grouped = new Map();
    summary.forEach((row) => {
      const key = text(row.loanKey || row.code || `row-${row.rowIndex}`);
      const item = grouped.get(key) || { code: text(row.code), partner: text(row.partner), borrowed: 0, principalPaid: 0, interestPaid: 0, outstanding: 0, loanDate: '', loanDateText: '', content: text(row.content) };
      if (row.type === 'Vay') {
        item.borrowed += number(row.amount);
        const date = dateKey(row);
        if (!item.loanDate || date < item.loanDate) {
          item.loanDate = date;
          item.loanDateText = text(row.dateText || row.date);
        }
      }
      if (row.type === 'Trả nợ') item.principalPaid += number(row.amount);
      if (row.type === 'Trả lãi') item.interestPaid += number(row.amount);
      item.outstanding = item.borrowed - item.principalPaid;
      grouped.set(key, item);
    });
    const loans = Array.from(grouped.values()).map((item) => {
      const current = currentByCode.get(item.code);
      return {
        ...item,
        currentOutstanding: current?.currentOutstanding ?? current?.outstanding ?? item.outstanding,
        isCurrentlySettled: Boolean(current?.isCurrentlySettled),
        currentSettlementDate: current?.currentSettlementDate || '',
        currentSettlementDateText: current?.currentSettlementDateText || ''
      };
    }).sort((a, b) => b.outstanding - a.outstanding);
    const sumType = (type) => filtered.filter((row) => row.type === type).reduce((sum, row) => sum + number(row.amount), 0);
    const outstanding = summary.reduce((sum, row) => sum + (row.type === 'Vay' ? number(row.amount) : row.type === 'Trả nợ' ? -number(row.amount) : 0), 0);
    return {
      ...payload,
      selectedMonth: '',
      metrics: [
        { key: 'borrowed', label: 'Tổng khoản vay', value: sumType('Vay') },
        { key: 'principalPaid', label: 'Đã trả nợ gốc', value: sumType('Trả nợ') },
        { key: 'interestPaid', label: 'Đã trả lãi', value: sumType('Trả lãi') },
        { key: 'outstanding', label: 'Dư nợ cuối kỳ', value: outstanding }
      ],
      loans,
      recentRows: filtered.sort((a, b) => dateKey(b).localeCompare(dateKey(a))),
      supabaseCached: true
    };
  }

  function mergeTransactionBundles(payloads, startDate, endDate) {
    const seen = new Set();
    const transactions = [];
    payloads.forEach((payload) => (payload.transactions || []).forEach((row) => {
      const key = `${row.rowIndex || ''}|${row.voucher || ''}|${dateKey(row)}|${row.amount || ''}`;
      if (seen.has(key) || !inRange(row, startDate, endDate)) return;
      seen.add(key);
      transactions.push(row);
    }));
    transactions.sort((a, b) => dateKey(b).localeCompare(dateKey(a)) || number(b.rowIndex) - number(a.rowIndex));
    const syncTimes = payloads.map((item) => text(item.supabaseSyncedAt)).filter(Boolean).sort();
    const limited = payloads.some((item) => item?.limited === true || item?.incomplete === true);
    const sourceTotalRows = payloads.reduce((sum, item) => {
      const total = Number(item?.sourceTotalRows ?? item?.totalRows);
      return sum + (Number.isFinite(total) ? total : (item?.transactions || []).length);
    }, 0);
    return {
      ok: true,
      months: payloads.flatMap((item) => item.months || []).filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index),
      transactions,
      totalRows: transactions.length,
      displayedRows: transactions.length,
      sourceTotalRows,
      limited,
      incomplete: limited,
      supabaseCached: true,
      supabaseSyncedAt: syncTimes[0] || ''
    };
  }

  function monthKeys(startDate, endDate) {
    const result = [];
    let year = Number(startDate.slice(0, 4));
    let month = Number(startDate.slice(5, 7));
    const endKey = endDate.slice(0, 7);
    while (`${year}-${String(month).padStart(2, '0')}` <= endKey && result.length < 24) {
      result.push(`${year}-${String(month).padStart(2, '0')}`);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return result;
  }

  function monthSet_(row) {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row;
    if (!Array.isArray(payload?.months)) return null;
    return payload.months.map((item) => text(item?.key || item)).filter(Boolean).sort();
  }

  function contiguousCachedRows(rows, requestedMonthKeys) {
    const input = Array.isArray(rows) ? rows : [];
    const firstCachedIndex = input.findIndex(Boolean);
    if (firstCachedIndex < 0) return [];
    const available = input.slice(firstCachedIndex);
    if (!available.every(Boolean)) return [];
    if (firstCachedIndex === 0) return available;

    const requested = Array.isArray(requestedMonthKeys) ? requestedMonthKeys.map(text) : [];
    if (requested.length !== input.length) return [];
    const coverageSets = available.map(monthSet_);
    if (coverageSets.some((set) => !set)) return [];
    const baseline = JSON.stringify(coverageSets[0]);
    if (coverageSets.some((set) => JSON.stringify(set) !== baseline)) return [];
    const covered = new Set(coverageSets[0]);
    const missingLeading = requested.slice(0, firstCachedIndex);
    if (missingLeading.some((monthKey) => covered.has(monthKey))) return [];
    if (!requested.slice(firstCachedIndex).every((monthKey) => covered.has(monthKey))) return [];
    const aligned = available.every((row, index) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row;
      return text(payload?.selectedMonth || payload?.month || payload?.monthKey) === requested[firstCachedIndex + index];
    });
    if (!aligned) return [];
    return available;
  }

  return { buildOverviewRange, buildLoansRange, mergeTransactionBundles, monthKeys, contiguousCachedRows };
}

module.exports = { createFundRangeService };
