function createFundTransactionPageService() {
  const text = (value) => String(value == null ? '' : value).trim();
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const normalized = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const dateKey = (row) => {
    const raw = text(row?.date || row?.dateText);
    const vi = raw.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
    return vi ? `${vi[3]}-${vi[2]}-${vi[1]}` : raw.slice(0, 10);
  };
  const rowKey = (row) => `${row?.rowIndex || ''}|${row?.voucher || ''}|${dateKey(row)}|${row?.amount || ''}`;
  const searchable = (row) => normalized([row?.voucher, row?.dateText || row?.date, row?.type, row?.category, row?.amountText || row?.amount, row?.actor, row?.partner, row?.content, row?.debt, row?.offset ? 'Không qua Quỹ Cấn trừ' : ''].join(' '));

  function isPagedManifest(payload) {
    const pagination = payload?.pagination;
    return Boolean(pagination && text(pagination.version) && number(pagination.cachePageSize) > 0 && number(pagination.pageCount) > 0);
  }

  function build(input = {}) {
    const manifests = Array.isArray(input.manifests) ? input.manifests : [];
    const pageBundles = Array.isArray(input.pageBundles) ? input.pageBundles : [];
    const page = Math.max(1, Math.floor(number(input.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(number(input.pageSize) || 20)));
    const startDate = text(input.startDate);
    const endDate = text(input.endDate);
    const query = normalized(input.search);
    const mode = input.mode === 'debt' ? 'debt' : 'all';
    const partner = text(input.partner);
    const seen = new Set();
    const availablePartners = new Set();
    const all = [];
    pageBundles
      .slice()
      .sort((left, right) => number(left?.cachePage) - number(right?.cachePage))
      .forEach((bundle) => (bundle?.transactions || []).forEach((row) => {
        const key = rowKey(row);
        const date = dateKey(row);
        if (seen.has(key) || (startDate && date < startDate) || (endDate && date > endDate)) return;
        if (mode === 'debt' && !(row?.debt === true || row?.debt === 'Có')) return;
        if (mode === 'debt' && text(row?.partner)) availablePartners.add(text(row?.partner));
        if (partner && text(row?.partner) !== partner) return;
        if (query && !searchable(row).includes(query)) return;
        seen.add(key);
        all.push(row);
      }));
    all.sort((left, right) => dateKey(right).localeCompare(dateKey(left)) || number(right?.rowIndex) - number(left?.rowIndex));
    const totalRows = all.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const currentPage = Math.min(page, totalPages);
    const transactions = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const debtRows = mode === 'debt' ? all : [];
    const receivable = debtRows.filter((row) => row?.type === 'Thu').reduce((sum, row) => sum + number(row?.remainingDebt), 0);
    const payable = debtRows.filter((row) => row?.type === 'Chi').reduce((sum, row) => sum + number(row?.remainingDebt), 0);
    const syncTimes = manifests.map((item) => text(item?.supabaseSyncedAt)).filter(Boolean).sort();
    const months = manifests.flatMap((item) => item?.months || []).filter((item, index, values) => values.findIndex((candidate) => candidate?.key === item?.key) === index);
    const sourceTotalRows = manifests.reduce((sum, item) => sum + number(item?.pagination?.totalRows ?? item?.sourceTotalRows ?? item?.totalRows), 0);
    const cacheVersion = manifests.map((item) => text(item?.pagination?.version)).filter(Boolean).sort().join(':');
    return {
      ok: true,
      months,
      transactions,
      totalRows,
      displayedRows: transactions.length,
      sourceTotalRows,
      limited: false,
      incomplete: false,
      page: currentPage,
      pageSize,
      totalPages,
      cacheVersion,
      partners: mode === 'debt' ? Array.from(availablePartners).sort((a, b) => a.localeCompare(b, 'vi')) : undefined,
      debtSummary: mode === 'debt' ? { receivable, payable, net: receivable - payable } : undefined,
      supabaseCached: true,
      supabaseSyncedAt: syncTimes[0] || ''
    };
  }

  function buildDirectPage(manifest, pageBundles, requestedPage, requestedPageSize) {
    const page = Math.max(1, Math.floor(number(requestedPage) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(number(requestedPageSize) || 20)));
    const totalRows = number(manifest?.pagination?.totalRows ?? manifest?.totalRows);
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const currentPage = Math.min(page, totalPages);
    const cachePageSize = number(manifest?.pagination?.cachePageSize);
    const sourceOffset = Math.floor(((currentPage - 1) * pageSize) / cachePageSize) * cachePageSize;
    const rows = (Array.isArray(pageBundles) ? pageBundles : [])
      .slice()
      .sort((left, right) => number(left?.cachePage) - number(right?.cachePage))
      .flatMap((bundle) => bundle?.transactions || []);
    const localOffset = (currentPage - 1) * pageSize - sourceOffset;
    const transactions = rows.slice(localOffset, localOffset + pageSize);
    return {
      ...manifest,
      transactions,
      totalRows,
      displayedRows: transactions.length,
      sourceTotalRows: totalRows,
      limited: false,
      incomplete: false,
      page: currentPage,
      pageSize,
      totalPages,
      cacheVersion: text(manifest?.pagination?.version),
      supabaseCached: true
    };
  }

  return { build, buildDirectPage, isPagedManifest };
}

module.exports = { createFundTransactionPageService };
