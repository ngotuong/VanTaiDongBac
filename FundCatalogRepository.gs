/** Read adapter for managed and native Fund catalog ranges. */
var FundCatalogRepository = (function () {
  function readManagedRows(sheet, context) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues().map(function (row, index) {
      return { rowIndex: index + 2, group: context.clean(row[0]), groupKey: context.normalizeGroup(row[0]), value: context.clean(row[1]), note: context.clean(row[2]) };
    }).filter(function (row) { return row.groupKey && row.value; });
  }

  function resolveNativeSpec(spreadsheet, spec) {
    var resolved = { rangeName: spec.rangeName || '', column: spec.column, startRow: spec.startRow, endRow: spec.endRow || 0 };
    if (spec.rangeName) {
      var range = spreadsheet.getRangeByName(spec.rangeName);
      if (range) {
        resolved.column = range.getColumn();
        resolved.startRow = range.getRow();
        resolved.endRow = range.getRow() + range.getNumRows() - 1;
      }
    }
    return resolved;
  }

  function readNativeRows(spreadsheet, sheet, groups, specs, clean) {
    if (!sheet) return [];
    var rows = [];
    groups.forEach(function (group) {
      var baseSpec = specs[group.key];
      if (!baseSpec) return;
      var spec = resolveNativeSpec(spreadsheet, baseSpec);
      if (sheet.getLastRow() < spec.startRow) return;
      var endRow = spec.endRow || sheet.getLastRow();
      if (endRow < spec.startRow) return;
      sheet.getRange(spec.startRow, spec.column, endRow - spec.startRow + 1, 1).getDisplayValues().forEach(function (row, index) {
        var value = clean(row[0]);
        if (!value) return;
        rows.push({ rowIndex: 'native:' + group.key + ':' + (spec.startRow + index), group: group.label, groupKey: group.key,
          value: value, note: '', source: 'native', nativeColumn: spec.column });
      });
    });
    return rows;
  }

  return { readManagedRows: readManagedRows, resolveNativeSpec: resolveNativeSpec, readNativeRows: readNativeRows };
})();
