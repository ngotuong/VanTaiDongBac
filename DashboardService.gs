var DashboardService = (function () {
  function getActiveReportMonths(months) {
    var activeMonths = [];
    if (months && months.length > 1) {
      for (var i = 1; i < months.length; i++) {
        var monthName = clean_(months[i][0]);
        if (monthName && monthName !== 'Tháng') activeMonths.push(monthName);
      }
    }
    return activeMonths;
  }

  function resolveReportMonth(months, month) {
    var targetMonth = clean_(month);
    if (!targetMonth || targetMonth === 'latest' || targetMonth === 'all') {
      var activeMonths = getActiveReportMonths(months);
      targetMonth = activeMonths.length ? activeMonths[activeMonths.length - 1] : '';
    }
    return targetMonth;
  }

  function parseMonthKpis(months, normalizeMonthKey) {
    if (!months || !months.length) return [];
    var headerIndex = -1;
    for (var i = 0; i < months.length; i++) {
      if (normalizeText_(months[i] && months[i][0]) === 'thang') {
        headerIndex = i;
        break;
      }
    }
    var headers = (months[headerIndex >= 0 ? headerIndex : 0] || []).map(function (header) {
      return normalizeText_(header);
    });
    var dataRows = headerIndex >= 0 ? months.slice(headerIndex + 1) : months.slice(1);

    function colIndex(names, fallback) {
      for (var col = 0; col < headers.length; col++) {
        var header = headers[col];
        for (var index = 0; index < names.length; index++) {
          if (header.indexOf(normalizeText_(names[index])) !== -1) return col;
        }
      }
      return fallback;
    }

    var monthCol = colIndex(['tháng'], 0);
    var revenueCol = colIndex(['doanh thu'], 2);
    var taxTndnCol = colIndex(['thuế tndn', 'tndn'], 3);
    var taxVatCol = colIndex(['thuế vat', 'vat'], 4);
    var fuelQmCol = colIndex(['dầu qm', 'quang minh'], 5);
    var fuelOutCol = colIndex(['dầu ngoài', 'đổ ngoài'], 6);
    var tollCol = colIndex(['cầu đường', 'phí cầu đường'], 7);
    var grossCol = colIndex(['lợi nhuận gộp'], 8);
    var payrollCol = colIndex(['chi phí lương', 'tổng lương'], -1);
    var fundCol = colIndex(['chi quỹ thực tế', 'chi quỹ', 'quỹ'], 9);
    var finalCol = colIndex(['lợi nhuận thực tế', 'lợi nhuận thực nhận', 'lợi nhuận thực'], 10);

    return dataRows.map(function (row) {
      var monthName = clean_(row && row[monthCol]);
      if (!monthName || monthName === 'Tháng') return null;
      var revenue = parseNumber_(row[revenueCol]);
      var taxTndn = parseNumber_(row[taxTndnCol]);
      var taxVat = parseNumber_(row[taxVatCol]);
      var fuelQm = parseNumber_(row[fuelQmCol]);
      var fuelOut = parseNumber_(row[fuelOutCol]);
      var toll = parseNumber_(row[tollCol]);
      var fund = parseNumber_(row[fundCol]);
      var finalProfit = parseNumber_(row[finalCol]);
      var calculatedGross = revenue - taxTndn - taxVat - fuelQm - toll;
      var gross = grossCol >= 0 ? parseNumber_(row[grossCol]) : calculatedGross;
      var operatingCost = revenue - gross;
      var cashCost = gross - finalProfit;
      var payroll = payrollCol >= 0 ? parseNumber_(row[payrollCol]) : cashCost - fuelOut - fund;
      return {
        month: monthName,
        monthKey: normalizeMonthKey(monthName),
        revenue: revenue,
        taxTndn: taxTndn,
        taxVat: taxVat,
        fuelQm: fuelQm,
        toll: toll,
        gross: gross,
        operatingCost: operatingCost,
        final: finalProfit,
        cashCost: cashCost,
        fuelOut: fuelOut,
        payroll: payroll,
        fund: fund,
        totalCost: operatingCost + cashCost
      };
    }).filter(function (item) { return item; });
  }

  function parseDetailKpis(details) {
    var rows = details || [];
    var gross = readDetailNumber_(rows, 'Lợi nhuận gộp');
    var outsideFuel = readDetailNumber_(rows, 'Chi phí dầu', 'đổ ngoài');
    var payroll = readDetailNumber_(rows, 'Chi phí lương');
    var fund = readDetailNumber_(rows, 'Chi quỹ thực tế');
    var finalProfit = readDetailNumber_(rows, 'Lợi nhuận thực');
    if (!finalProfit && hasDetailFormulaError_(rows, 'Lợi nhuận thực')) {
      finalProfit = gross - outsideFuel - payroll - fund;
    }
    var cashCost = gross - finalProfit;
    return {
      gross: gross,
      final: finalProfit,
      cashCost: cashCost,
      fuelOut: outsideFuel,
      payroll: payroll,
      fund: fund,
      totalCost: cashCost
    };
  }

  function aggregateDetailMatrices(matrices) {
    var base = matrices[0] || [];
    var result = [];
    if (base.length) result.push(base[0]);
    var totals = [];
    (matrices || []).forEach(function (matrix) {
      for (var rowIndex = 1; rowIndex < matrix.length; rowIndex++) {
        var row = matrix[rowIndex];
        var category = clean_(row[0]);
        if (!category) continue;
        if (!totals[rowIndex]) {
          totals[rowIndex] = {
            category: category,
            colB: 0,
            colC: 0,
            colD: 0,
            colE: clean_(row[4]),
            template: row
          };
        }
        if (totals[rowIndex].category === category) {
          totals[rowIndex].colB += parseNumber_(row[1]) || 0;
          totals[rowIndex].colC += parseNumber_(row[2]) || 0;
          totals[rowIndex].colD += parseNumber_(row[3]) || 0;
        }
      }
    });
    for (var i = 1; i < totals.length; i++) {
      var item = totals[i];
      if (!item) continue;
      result.push([
        item.category,
        formatAggregateDetailCell_(item.colB, item.template[1]),
        formatAggregateDetailCell_(item.colC, item.template[2]),
        formatAggregateDetailCell_(item.colD, item.template[3]),
        item.colE
      ]);
    }
    return result;
  }

  function formatAggregateDetailCell_(value, template) {
    var text = clean_(template);
    if (text.indexOf('₫') !== -1 || text.indexOf('đ') !== -1) {
      return Math.round(value).toLocaleString('vi-VN') + ' ₫';
    }
    return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  }

  function readDetailNumber_(rows, label, explanationContains) {
    var normalizedLabel = normalizeText_(label);
    var normalizedExplanation = normalizeText_(explanationContains || '');
    var fallback = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      if (normalizeText_(row[0]) !== normalizedLabel) continue;
      if (!normalizedExplanation || normalizeText_(row[4]).indexOf(normalizedExplanation) !== -1) {
        return parseNumber_(row[1]);
      }
      if (fallback === null) fallback = parseNumber_(row[1]);
    }
    return fallback === null ? 0 : fallback;
  }

  function hasDetailFormulaError_(rows, label) {
    var normalizedLabel = normalizeText_(label);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      if (normalizeText_(row[0]) !== normalizedLabel) continue;
      return /^#/.test(clean_(row[1]));
    }
    return false;
  }

  function normalizeText_(value) {
    return clean_(value).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function clean_(value) {
    return normalizeCleanValue_(value);
  }

  function parseNumber_(value) {
    return ValidationService.parseNumber(value, false);
  }

  return {
    getActiveReportMonths: getActiveReportMonths,
    resolveReportMonth: resolveReportMonth,
    parseMonthKpis: parseMonthKpis,
    parseDetailKpis: parseDetailKpis,
    aggregateDetailMatrices: aggregateDetailMatrices
  };
})();
