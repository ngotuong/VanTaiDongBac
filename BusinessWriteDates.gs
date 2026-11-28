var BusinessWriteDates = (function () {
  function check(action, payload, year) {
    function validate(value, label) {
      if (value === undefined || value === null || String(value).trim() === '') return;
      var text = String(value).trim();
      var iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(text);
      var local = /^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/.exec(text);
      if (!iso && !local) throw new Error(label + ' không phải ngày hợp lệ.');
      var actualYear = Number(iso ? iso[1] : local[3]);
      var month = Number(iso ? iso[2] : local[2]);
      var day = Number(iso ? iso[3] : local[1]);
      var date = new Date(Date.UTC(actualYear, month - 1, day));
      if (date.getUTCFullYear() !== actualYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error(label + ' không phải ngày hợp lệ.');
      }
      if (String(actualYear) !== String(year)) throw new Error(label + ' phải thuộc năm ' + year + '.');
    }

    if (action === 'submitRows' && Array.isArray(payload.rows)) {
      payload.rows.forEach(function (row, index) {
        if (!row) return;
        var prefix = 'Dòng ' + (index + 1) + ': ';
        if (payload.formType === 'chamCong') {
          validate(row.fromDate, prefix + 'Từ ngày');
          validate(row.toDate, prefix + 'Đến ngày');
        } else {
          validate(row.date, prefix + 'Ngày');
        }
      });
    } else if (action === 'saveSheetRow' && /^NL_/.test(String(payload.sheetName || '').trim())) {
      Object.keys(payload.rowData || {}).forEach(function (header) {
        if (/^(ngày|từ ngày|đến ngày)$/i.test(header.trim())) validate(payload.rowData[header], header.trim());
      });
    } else if (action === 'addFundTransactions' && Array.isArray(payload.transactions)) {
      payload.transactions.forEach(function (row, index) {
        validate(row && row.date, 'Ngày giao dịch dòng ' + (index + 1));
      });
    } else if (action === 'addFundTransaction' || action === 'updateFundTransaction') {
      validate(payload.transaction && payload.transaction.date, 'Ngày giao dịch');
    } else if (action === 'addFundLoan') {
      validate(payload.loan && payload.loan.date, 'Ngày vay');
    } else if (action === 'addFundDebtPayment' || action === 'addFundLoanPayment') {
      validate(payload.payment && payload.payment.date, 'Ngày thanh toán');
    }
  }

  return { check: check };
})();

// Vercel and the Apps Script worker use the same validation.
if (typeof module !== 'undefined') module.exports = BusinessWriteDates;
