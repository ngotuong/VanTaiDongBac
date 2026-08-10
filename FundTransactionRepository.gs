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
      debt: requiredHeaderIndex(headers, ['cong no', 'công nợ'], 9 + offset, normalizeHeader),
      remainingDebt: findHeaderIndex(headers, ['cong no con lai', 'công nợ còn lại'], normalizeHeader)
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

  function findVoucherRows(sheet, vouchers, clean) {
    var wanted = {};
    (vouchers || []).forEach(function (voucher) {
      var value = clean(voucher);
      if (value) wanted[value] = true;
    });
    var found = {};
    var lastRow = sheet.getLastRow();
    if (!Object.keys(wanted).length || lastRow < 2) return found;
    sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().forEach(function (row, index) {
      var voucher = clean(row[0]);
      if (wanted[voucher] && !found[voucher]) found[voucher] = index + 2;
    });
    return found;
  }

  function appendRows(sheet, rows, options) {
    var appendRow = options.getAppendRow(sheet);
    var lastRow = appendRow + rows.length - 1;
    if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
    try {
      sheet.getRange(appendRow, 1, rows.length, rows[0].length).setValues(rows);
      sheet.getRange(appendRow, 2, rows.length, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(appendRow, 6, rows.length, 1).setNumberFormat('#,##0');
      rows.forEach(function (row, index) {
        var rowNumber = appendRow + index;
        if (row[9] === 'Có') sheet.getRange(rowNumber, 13).setFormula(options.buildDebtFormula(rowNumber));
        sheet.getRange(rowNumber, 14).setFormula(options.buildFilterFormula(rowNumber));
      });
      options.flush();
    } catch (error) {
      rollbackRows(sheet, appendRow, rows.length, options);
      throw error;
    }
    return { firstRow: appendRow, lastRow: lastRow };
  }

  function rollbackRows(sheet, startRow, rowCount, options) {
    if (!(startRow > 1) || !(rowCount > 0)) return;
    try {
      sheet.getRange(startRow, 1, rowCount, Math.max(sheet.getLastColumn(), 14)).clearContent();
      options.flush();
    } catch (error) {
      options.warn('Không thể rollback vùng Thu chi ghi lỗi:', error);
    }
  }

  function readRow(sheet, rowNumber, minimumColumns) {
    if (rowNumber > sheet.getLastRow()) return [];
    return sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), minimumColumns)).getValues()[0];
  }

  function updateRow(sheet, rowNumber, row, options) {
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    sheet.getRange(rowNumber, 2).setNumberFormat('dd/MM/yyyy');
    sheet.getRange(rowNumber, 6).setNumberFormat('#,##0');
    if (row[9] === 'Có') sheet.getRange(rowNumber, 13).setFormula(options.buildDebtFormula(rowNumber));
    else sheet.getRange(rowNumber, 13).clearContent();
    sheet.getRange(rowNumber, 14).setFormula(options.buildFilterFormula(rowNumber));
    options.flush();
  }

  function deleteRow(sheet, rowNumber, options) {
    sheet.deleteRow(rowNumber);
    options.flush();
  }

  return { getColumns: getColumns, readSnapshot: readSnapshot, findVoucherRows: findVoucherRows, appendRows: appendRows,
    rollbackRows: rollbackRows, readRow: readRow, updateRow: updateRow, deleteRow: deleteRow };
})();
