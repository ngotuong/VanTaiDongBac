/**
 * Builds compact opening snapshots for a new yearly workbook. Source Sheets
 * are read only. Writes are limited to ranges declared in the approved
 * rollover manifest and happen only on the two newly created copies.
 */
var YearRolloverSnapshotService = (function () {
  function captureAll(operations, years, books) {
    return (operations || []).map(function (operation) {
      if (operation.kind === 'fund') return captureFund_(operation, years, books);
      if (operation.kind === 'salary') return captureSalary_(operation, years, books);
      throw new Error('Loại snapshot chuyển năm không được hỗ trợ: ' + operation.kind + '.');
    });
  }

  function applyAll(snapshots, books) {
    (snapshots || []).forEach(function (snapshot) {
      if (snapshot.kind === 'fund') applyFund_(snapshot, books);
      else if (snapshot.kind === 'salary') applySalary_(snapshot, books);
      else throw new Error('Snapshot chuyển năm không hợp lệ.');
    });
  }

  function debtSummary(book) {
    var sheet = book && book.getSheetByName('NHAP_THUCHI');
    var result = { count: 0, receivable: 0, payable: 0 };
    if (!sheet || sheet.getLastRow() < 2) return result;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())).getValues();
    var displays = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())).getDisplayValues();
    values.forEach(function (row, index) {
      var shown = displays[index] || [];
      if (normalize_(shown[9]) !== 'co') return;
      var remaining = parseNumber_(row[12] == null || row[12] === '' ? shown[12] : row[12]);
      if (!(remaining > 0.5)) return;
      result.count += 1;
      if (clean_(shown[2])) result.receivable += remaining;
      else if (clean_(shown[3])) result.payable += remaining;
    });
    return result;
  }

  function salarySummary(book) {
    var sheet = book && book.getSheetByName('NL_SoDuLuong');
    var result = { count: 0, total: 0, balances: {} };
    if (!sheet || sheet.getLastRow() < 2) return result;
    var rowCount = Math.min(999, sheet.getLastRow() - 1);
    var values = sheet.getRange(2, 1, rowCount, 9).getValues();
    var displays = sheet.getRange(2, 1, rowCount, 9).getDisplayValues();
    var latest = {};
    values.forEach(function (row, index) {
      var shown = displays[index] || [];
      var id = clean_(shown[0] || row[0]);
      if (!id || normalize_(shown[3] || row[3]) === 'ghi chu lich su') return;
      var remaining = parseNumber_(row[8] == null || row[8] === '' ? shown[8] : row[8]);
      var order = dateOrder_(row[5] || row[1], index);
      if (!latest[id] || order >= latest[id].order) latest[id] = { order: order, remaining: remaining };
    });
    Object.keys(latest).sort().forEach(function (id) {
      var remaining = latest[id].remaining;
      if (Math.abs(remaining) <= 0.5) return;
      result.balances[id] = remaining;
      result.count += 1;
      result.total += remaining;
    });
    return result;
  }

  function captureFund_(operation, years, books) {
    var overview = FundService.getFundOverview(years.sourceYear, { forceRefresh: true });
    var loanOverview = FundService.getFundLoanOverview(years.sourceYear, { forceRefresh: true });
    var sourceBalance = metric_(overview.metrics, 'currentBalance');
    var loanRows = buildLoanRows_(loanOverview, years);
    var fundOutstanding = loanRows.reduce(function (sum, item) {
      return sum + (item.values[11] === true ? 0 : Number(item.values[5] || 0));
    }, 0);
    var openingBase = sourceBalance - fundOutstanding;
    var openingMode = String(operation.openingBalanceMode || 'cash').trim();
    if (openingMode !== 'cash' && openingMode !== 'bank') throw new Error('openingBalanceMode chỉ nhận cash hoặc bank.');
    var sourceTransactionRange = exactRange_(books.source, operation.module, operation.transactionSheet, operation.transactionRange);
    var debtRows = buildDebtRows_(sourceTransactionRange, years);
    return {
      kind: 'fund', operation: operation,
      sourceBalance: sourceBalance,
      fundOutstanding: fundOutstanding,
      cashOpening: openingMode === 'cash' ? openingBase : 0,
      bankOpening: openingMode === 'bank' ? openingBase : 0,
      loanRows: loanRows.map(function (item) { return item.values; }),
      debtRows: debtRows,
      targetDate: new Date(Number(years.targetYear), 0, 1)
    };
  }

  function buildLoanRows_(overview, years) {
    var history = (overview && overview.recentRows || []).slice();
    return (overview && overview.loans || []).filter(function (loan) {
      return Number(loan.currentOutstanding == null ? loan.outstanding : loan.currentOutstanding) > 0.5;
    }).map(function (loan) {
      var key = clean_(loan.code);
      var origins = history.filter(function (row) {
        return row.type === 'Vay' && clean_(row.loanKey || row.code) === key;
      });
      if (!key || !origins.length) throw new Error('Không xác định được khoản vay gốc để chuyển tiếp: ' + key + '.');
      var first = origins[0];
      var partnerKey = normalize_(first.partner);
      var nonFund = first.nonFund === true;
      if (origins.some(function (row) { return normalize_(row.partner) !== partnerKey || (row.nonFund === true) !== nonFund; })) {
        throw new Error('Khoản vay ' + key + ' có đối tác hoặc trạng thái Không qua Quỹ không nhất quán.');
      }
      var outstanding = Number(loan.currentOutstanding == null ? loan.outstanding : loan.currentOutstanding);
      var originDate = clean_(first.dateText || first.date);
      var note = 'Chuyển tiếp dư nợ từ ' + years.sourceYear + ' (ngày vay gốc ' + (originDate || 'không rõ') + ').';
      if (clean_(first.content)) note += ' ' + clean_(first.content);
      return { values: [
        key, new Date(Number(years.targetYear), 0, 1), 'Vay', clean_(first.method), clean_(first.partner), outstanding,
        numberOrBlank_(first.termMonths), numberOrBlank_(first.annualRate), numberOrBlank_(first.interestPeriodMonths),
        first.firstInterestDate || '', note, nonFund
      ] };
    });
  }

  function buildDebtRows_(sourceRange, years) {
    var values = sourceRange.getValues();
    var displays = sourceRange.getDisplayValues();
    var result = [];
    var seen = {};
    values.forEach(function (row, index) {
      var shown = displays[index] || [];
      var debt = normalize_(shown[9]);
      var remaining = parseNumber_(row[12] == null || row[12] === '' ? shown[12] : row[12]);
      if (debt !== 'co' || !(remaining > 0.5)) return;
      var type = clean_(shown[2]) ? 'Thu' : (clean_(shown[3]) ? 'Chi' : '');
      if (!type || !clean_(shown[7])) throw new Error('Công nợ nguồn chưa đủ loại/đối tác tại dòng ' + (sourceRange.getRow() + index) + '.');
      var originalVoucher = clean_(shown[0] || row[0]);
      if (!originalVoucher) throw new Error('Công nợ còn mở thiếu số phiếu tại dòng ' + (sourceRange.getRow() + index) + '.');
      var debtKey = normalize_(originalVoucher);
      var debtIdentity = type + '|' + normalize_(shown[7]);
      if (seen[debtKey]) {
        if (seen[debtKey] !== debtIdentity) throw new Error('Công nợ ' + originalVoucher + ' có loại hoặc đối tác không nhất quán.');
        return;
      }
      seen[debtKey] = debtIdentity;
      var content = 'Chuyển tiếp công nợ từ ' + years.sourceYear + (originalVoucher ? ' • phiếu ' + originalVoucher : '') + '.';
      if (clean_(shown[8])) content += ' ' + clean_(shown[8]);
      var rolloverVoucher = rolloverVoucher_(years.targetYear, result.length + 1);
      result.push([
        rolloverVoucher,
        new Date(Number(years.targetYear), 0, 1),
        type === 'Thu' ? clean_(shown[2]) : '',
        type === 'Chi' ? clean_(shown[3]) : '',
        clean_(shown[4]), remaining, clean_(shown[6]), clean_(shown[7]), content, 'Có', '', shown[11] === 'TRUE' || row[11] === true
      ]);
    });
    return result;
  }

  function rolloverVoucher_(targetYear, sequence) {
    var prefix = String(targetYear).slice(-2) + '0101';
    var next = Number(sequence || 0);
    if (!(next > 0) || next > 999999) throw new Error('Đã vượt giới hạn mã công nợ chuyển tiếp cho năm ' + targetYear + '.');
    return Number(prefix + ('000000' + next).slice(-6));
  }

  function captureSalary_(operation, years, books) {
    var range = exactRange_(books.source, operation.module, operation.sheet, operation.range);
    var values = range.getValues();
    var displays = range.getDisplayValues();
    var latest = {};
    values.forEach(function (row, index) {
      var shown = displays[index] || [];
      var id = clean_(shown[0] || row[0]);
      var type = clean_(shown[3] || row[3]);
      if (!id || normalize_(type) === 'ghi chu lich su') return;
      var remaining = parseNumber_(row[8] == null || row[8] === '' ? shown[8] : row[8]);
      var order = dateOrder_(row[5] || row[1], index);
      if (!latest[id] || order >= latest[id].order) latest[id] = {
        order: order, id: id, person: clean_(shown[2] || row[2]), type: type,
        remaining: remaining, note: clean_(shown[10] || row[10])
      };
    });
    var rows = Object.keys(latest).sort().map(function (key) { return latest[key]; }).filter(function (item) {
      return Math.abs(item.remaining) > 0.5;
    }).map(function (item) {
      if (!(item.remaining > 0)) throw new Error('Số dư lương chuyển tiếp âm cho ' + item.id + '.');
      return {
        left: [item.id, new Date(Number(years.targetYear), 0, 1), item.person, item.type, item.remaining, '', ''],
        note: 'Chuyển tiếp từ ' + years.sourceYear + (item.note ? ': ' + item.note : '')
      };
    });
    return { kind: 'salary', operation: operation, rows: rows };
  }

  function applyFund_(snapshot, books) {
    var operation = snapshot.operation;
    var targetBook = books.target[operation.module];
    var transactionRange = exactRange_(books.target, operation.module, operation.transactionSheet, operation.transactionRange);
    var loanRange = exactRange_(books.target, operation.module, operation.loanSheet, operation.loanRange);
    assertCapacity_(transactionRange, snapshot.debtRows.length, 13, 'công nợ');
    assertCapacity_(loanRange, snapshot.loanRows.length, 12, 'dư nợ vay');
    targetBook.getSheetByName(operation.settingsSheet).getRange(operation.cashOpeningRange).setValue(snapshot.cashOpening).setNumberFormat('#,##0');
    targetBook.getSheetByName(operation.settingsSheet).getRange(operation.bankOpeningRange).setValue(snapshot.bankOpening).setNumberFormat('#,##0');
    targetBook.getSheetByName(operation.settingsSheet).getRange(operation.dataStartDateRange).setValue(snapshot.targetDate).setNumberFormat('dd/MM/yyyy');
    targetBook.getSheetByName(operation.settingsSheet).getRange(operation.loanStartDateRange).setValue(snapshot.targetDate).setNumberFormat('dd/MM/yyyy');
    if (snapshot.debtRows.length) {
      var debtStart = transactionRange.getSheet().getRange(transactionRange.getRow(), transactionRange.getColumn(), snapshot.debtRows.length, 12);
      var debtCategories = debtStart.offset(0, 2, snapshot.debtRows.length, 2);
      debtCategories.clearDataValidations();
      debtStart.setValues(snapshot.debtRows);
      debtCategories.setDataValidations(debtValidationMatrix_(snapshot.debtRows, targetBook, operation.categoryValidation));
      debtStart.offset(0, 1, snapshot.debtRows.length, 1).setNumberFormat('dd/MM/yyyy');
      debtStart.offset(0, 5, snapshot.debtRows.length, 1).setNumberFormat('#,##0');
      snapshot.debtRows.forEach(function (_row, index) {
        var rowNumber = transactionRange.getRow() + index;
        transactionRange.getSheet().getRange(rowNumber, 13).setFormula(debtFormula_(rowNumber));
      });
    }
    if (snapshot.loanRows.length) {
      var loanStart = loanRange.getSheet().getRange(loanRange.getRow(), loanRange.getColumn(), snapshot.loanRows.length, 12);
      loanStart.setValues(snapshot.loanRows);
      loanStart.offset(0, 1, snapshot.loanRows.length, 1).setNumberFormat('dd/MM/yyyy');
      loanStart.offset(0, 5, snapshot.loanRows.length, 1).setNumberFormat('#,##0');
    }
  }

  function debtValidationMatrix_(rows, targetBook, config) {
    config = config || {};
    var settingsSheet = targetBook.getSheetByName(String(config.settingsSheet || ''));
    var exclusionSheet = targetBook.getSheetByName(String(config.mutualExclusionSheet || ''));
    if (!settingsSheet || !exclusionSheet) throw new Error('Không tìm thấy sheet cấu hình validation Thu/Chi.');
    var incomeRule = SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ chọn trong danh sách')
      .requireValueInRange(settingsSheet.getRange(String(config.incomeRange || '')), true)
      .build();
    var expenseRule = SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ chọn trong danh sách')
      .requireValueInRange(settingsSheet.getRange(String(config.expenseRange || '')), true)
      .build();
    var mutualExclusionRule = SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ nhập THU hoặc CHI')
      .requireValueInRange(exclusionSheet.getRange(String(config.mutualExclusionRange || '')), false)
      .build();
    return rows.map(function (row) {
      return clean_(row[2]) ? [incomeRule, mutualExclusionRule] : [mutualExclusionRule, expenseRule];
    });
  }

  function applySalary_(snapshot, books) {
    if (!snapshot.rows.length) return;
    var operation = snapshot.operation;
    var range = exactRange_(books.target, operation.module, operation.sheet, operation.range);
    assertCapacity_(range, snapshot.rows.length, 11, 'số dư lương');
    var sheet = range.getSheet();
    var row = range.getRow();
    var column = range.getColumn();
    sheet.getRange(row, column, snapshot.rows.length, 7).setValues(snapshot.rows.map(function (item) { return item.left; }));
    sheet.getRange(row, column + 10, snapshot.rows.length, 1).setValues(snapshot.rows.map(function (item) { return [item.note]; }));
    sheet.getRange(row, column + 1, snapshot.rows.length, 1).setNumberFormat('MM/yyyy');
    sheet.getRange(row, column + 4, snapshot.rows.length, 1).setNumberFormat('#,##0');
  }

  function exactRange_(scope, module, sheetName, a1) {
    var book = scope[module];
    var sheet = book && book.getSheetByName(String(sheetName || ''));
    if (!sheet) throw new Error('Không tìm thấy sheet snapshot: ' + sheetName + '.');
    return sheet.getRange(String(a1 || ''));
  }
  function assertCapacity_(range, rows, columns, label) {
    if (rows > range.getNumRows() || columns > range.getNumColumns()) throw new Error('Vùng manifest không đủ chỗ cho ' + label + '.');
  }
  function metric_(metrics, key) {
    var row = (metrics || []).filter(function (item) { return item.key === key; })[0];
    return Number(row && row.value || 0);
  }
  function debtFormula_(row) {
    return '=IF(SUMIFS(F:F;A:A;A' + row + ';J:J;"Có")-SUMIFS(F:F;A:A;A' + row + ';J:J;"="&"")<=0;0;SUMIFS(F:F;A:A;A' + row + ';J:J;"Có")-SUMIFS(F:F;A:A;A' + row + ';J:J;"="&""))';
  }
  function parseNumber_(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var text = clean_(value).replace(/[^0-9,.-]/g, '');
    if (!text) return 0;
    if (text.indexOf(',') >= 0 && text.indexOf('.') >= 0) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    else if (text.indexOf(',') >= 0) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
    var number = Number(text);
    return isFinite(number) ? number : 0;
  }
  function numberOrBlank_(value) { var number = Number(value || 0); return number ? number : ''; }
  function dateOrder_(value, fallback) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value.getTime();
    return Number(fallback || 0);
  }
  function clean_(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function normalize_(value) {
    return clean_(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  return { captureAll: captureAll, applyAll: applyAll, debtSummary: debtSummary, salarySummary: salarySummary };
})();
