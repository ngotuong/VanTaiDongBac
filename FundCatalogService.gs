/** Read-side rules and payload mapping for Fund catalogs. */
var FundCatalogService = (function () {
  function normalizeGroup(value, context) {
    var text = context.clean(value).toLowerCase();
    if (text === 'muc thu' || text === 'mục thu' || text === 'incomecategories') return 'incomeCategories';
    if (text === 'muc chi' || text === 'mục chi' || text === 'expensecategories') return 'expenseCategories';
    if (text === 'nguoi thu/chi' || text === 'người thu/chi' || text === 'actors') return 'actors';
    if (text === 'doi tac' || text === 'đối tác' || text === 'partners') return 'partners';
    if (text === 'noi vay' || text === 'nơi vay' || text === 'loanpartners') return 'loanPartners';
    var exact = context.groups.find(function (group) { return group.key.toLowerCase() === text; });
    return exact ? exact.key : '';
  }

  function unique(values, context) {
    var seen = {};
    var result = [];
    (values || []).forEach(function (value) {
      var text = context.clean(value);
      if (!text) return;
      var key = context.normalizeHeader(text);
      if (!seen[key]) { seen[key] = true; result.push(text); }
    });
    return result;
  }

  function readRows(context) {
    var adapter = { clean: context.clean, normalizeGroup: function (value) { return normalizeGroup(value, context); } };
    return context.repository.readManagedRows(context.sheet, adapter)
      .concat(context.repository.readNativeRows(context.spreadsheet, context.sheet, context.groups, context.nativeSpecs, context.clean));
  }

  function readGroups(context) {
    var grouped = { incomeCategories: [], expenseCategories: [], actors: [], partners: [], loanPartners: [] };
    readRows(context).forEach(function (row) { if (row.groupKey && grouped[row.groupKey]) grouped[row.groupKey].push(row.value); });
    Object.keys(grouped).forEach(function (key) { grouped[key] = unique(grouped[key], context); });
    return grouped;
  }

  function getFormOptions(context) {
    var catalogs = readGroups(context);
    return { ok: true,
      incomeCategories: unique(catalogs.incomeCategories.concat(context.fallbackIncome()), context),
      expenseCategories: unique(catalogs.expenseCategories.concat(context.fallbackExpense()), context),
      actors: unique(catalogs.actors.concat(context.fallbackActors()), context),
      partners: unique(catalogs.partners.concat(context.fallbackPartners()), context),
      loanPartners: unique(catalogs.loanPartners.concat(context.fallbackLoanPartners()), context) };
  }

  function getCatalog(group, context) {
    var rows = readRows(context);
    var selected = normalizeGroup(group, context);
    var counts = {};
    context.groups.forEach(function (item) { counts[item.key] = 0; });
    rows.forEach(function (row) { if (counts[row.groupKey] !== undefined) counts[row.groupKey] += 1; });
    return { ok: true, sheetName: context.sheetName,
      groups: context.groups.map(function (item) { return { key: item.key, label: item.label, count: counts[item.key] || 0 }; }),
      selectedGroup: selected, rows: selected ? rows.filter(function (row) { return row.groupKey === selected; }) : rows };
  }

  return { normalizeGroup: normalizeGroup, unique: unique, readGroups: readGroups, getFormOptions: getFormOptions, getCatalog: getCatalog };
})();
