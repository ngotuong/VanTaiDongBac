/** Sheet read adapter for Fund transactions. */
var FundTransactionRepository = (function () {
  function findHeaderIndex(headers, names, normalizeHeader) {
    var normalizedNames = names.map(normalizeHeader);
    for (var i = 0; i < headers.length; i++) {
      if (normalizedNames.indexOf(normalizeHeader(headers[i])) >= 0) return i;
    }
    return -1;
  }

  function requiredHeaderIndex(headers, names, fallbackIndex, normalizeHeader) {
    var index = findHeaderIndex(headers, names, normalizeHeader);
    return index >= 0 ? index : Math.max(0, fallbackIndex);
  }

  function getColumns(headers, normalizeHeader) {
    var voucher = findHeaderIndex(headers, ['so phieu', 'số phiếu'], normalizeHeader);
    var offset = voucher >= 0 ? 0 : -1;
    return {
      voucher: voucher,
      date: requiredHeaderIndex(headers, ['ngay', 'ngày'], 1 + offset, normalizeHeader),
      income: requiredHeaderIndex(headers, ['muc thu', 'mục thu'], 2 + offset, normalizeHeader),
      expense: requiredHeaderIndex(headers, ['muc chi', 'mục chi'], 3 + offset, normalizeHeader),
      method: requiredHeaderIndex(headers, ['hinh thuc', 'hình thức'], 4 + offset, normalizeHeader),
      amount: requiredHeaderIndex(headers, ['so tien', 'số tiền'], 5 + offset, normalizeHeader),
      actor: requiredHeaderIndex(headers, ['nguoi thu chi', 'người thu chi', 'nguoi thu/chi', 'người thu/chi'], 6 + offset, normalizeHeader),
      partner: requiredHeaderIndex(headers, ['doi tac', 'đối tác'], 7 + offset, normalizeHeader),
      content: requiredHeaderIndex(headers, ['noi dung', 'nội dung'], 8 + offset, normalizeHeader),
      debt: requiredHeaderIndex(headers, ['cong no', 'công nợ'], 9 + offset, normalizeHeader)
    };
  }

  function readSnapshot(spreadsheet, options) {
    var sheet = spreadsheet.getSheetByName(options.sheetName);
    if (!sheet) throw new Error('Không tìm thấy sheet Thu chi: ' + options.sheetName);
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), options.headers.length);
    if (lastRow < 2) return { empty: true, headers: options.headers };
    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var columns = getColumns(headers, options.normalizeHeader);
    return {
      empty: false,
      headers: headers,
      columns: columns,
      displayValues: sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues(),
      rawDateValues: sheet.getRange(2, columns.date + 1, lastRow - 1, 1).getValues()
    };
  }

  return { getColumns: getColumns, readSnapshot: readSnapshot };
})();
