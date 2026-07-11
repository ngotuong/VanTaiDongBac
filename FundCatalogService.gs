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

  function parseNativeRowIndex(value, context) {
    var match = context.clean(value).match(/^native:([^:]+):(\d+)$/);
    return match ? { groupKey: match[1], row: Number(match[2]) } : null;
  }

  function groupLabel(groupKey, context) {
    var found = context.groups.find(function (group) { return group.key === groupKey; });
    return found ? found.label : groupKey;
  }

  function assertBounds(spec, row, groupKey, context) {
    if (row < spec.startRow || (spec.endRow && row > spec.endRow)) {
      var rangeText = spec.endRow ? ('dòng ' + spec.startRow + '-' + spec.endRow) : ('từ dòng ' + spec.startRow);
      throw new Error(groupLabel(groupKey, context) + ' chỉ được chỉnh trong vùng ' + rangeText + ' của sheet ' + context.sheetName + '.');
    }
  }

  function saveItem(payload, context) {
    var item = payload || {};
    var groupKey = normalizeGroup(item.group, context);
    var value = context.clean(item.value);
    var note = context.clean(item.note);
    var rawRowIndex = context.clean(item.rowIndex);
    var numericRowIndex = parseInt(rawRowIndex || '', 10);
    if (!groupKey) throw new Error('Vui lòng chọn nhóm danh mục.');
    if (!value) throw new Error('Vui lòng nhập giá trị danh mục.');
    var baseSpec = context.nativeSpecs[groupKey];
    if (baseSpec && context.sheet) {
      var spec = context.repository.resolveNativeSpec(context.spreadsheet, baseSpec);
      var parsed = parseNativeRowIndex(rawRowIndex, context);
      var targetRow = parsed && parsed.groupKey === groupKey ? parsed.row : 0;
      if (targetRow) assertBounds(spec, targetRow, groupKey, context);
      var nativeResult = context.repository.saveNativeValue(context.spreadsheet, context.sheet, spec, groupKey, targetRow, value, {
        groupLabel: groupLabel(groupKey, context), columnToLetter: context.columnToLetter, sheetName: context.sheetName
      });
      return { ok: true, rowIndex: nativeResult.rowIndex, group: groupKey, value: value, note: note, sheetName: context.sheetName, nativeColumn: nativeResult.column };
    }
    var rowNumber = context.repository.saveManagedValue(context.sheet, numericRowIndex, [groupLabel(groupKey, context), value, note], context.getAppendRow);
    return { ok: true, rowIndex: rowNumber, group: groupKey, value: value, note: note, sheetName: context.sheetName };
  }

  function deleteItem(payload, context) {
    var rawRowIndex = context.clean(payload && payload.rowIndex);
    var numericRowIndex = parseInt(rawRowIndex || '', 10);
    var parsed = parseNativeRowIndex(rawRowIndex, context);
    if (!parsed && !(numericRowIndex > 1)) throw new Error('Thiếu dòng danh mục cần xóa.');
    if (parsed) {
      var baseSpec = context.nativeSpecs[parsed.groupKey];
      if (baseSpec && context.sheet) {
        var spec = context.repository.resolveNativeSpec(context.spreadsheet, baseSpec);
        assertBounds(spec, parsed.row, parsed.groupKey, context);
        context.repository.deleteNativeValue(context.sheet, spec, parsed.row);
        return { ok: true, rowIndex: numericRowIndex, sheetName: context.sheetName };
      }
    }
    context.repository.deleteManagedValue(context.sheet, numericRowIndex);
    return { ok: true, rowIndex: numericRowIndex, sheetName: context.sheetName };
  }

  return { normalizeGroup: normalizeGroup, unique: unique, readGroups: readGroups, getFormOptions: getFormOptions, getCatalog: getCatalog,
    parseNativeRowIndex: parseNativeRowIndex, assertBounds: assertBounds, saveItem: saveItem, deleteItem: deleteItem };
})();
