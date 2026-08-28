var ReportOutputFreshnessService = (function () {
  function buildState(tables, context) {
    var grouped = {};
    var tableNames = ['overview', 'payroll', 'vehicles', 'projectGroups', 'projects'];
    tableNames.forEach(function (tableName) {
      var matrix = tables[tableName] || [];
      var header = matrix.length ? matrix[0] : [];
      matrix.slice(1).forEach(function (row) {
        var monthKey = context.resolveMonthKey(row && row[0]);
        if (!monthKey) return;
        if (!grouped[monthKey]) {
          grouped[monthKey] = {};
          tableNames.forEach(function (name) { grouped[monthKey][name] = []; });
        }
        grouped[monthKey][tableName].push(row);
        grouped[monthKey][tableName + 'Header'] = header;
      });
    });
    var fingerprints = {};
    Object.keys(grouped).sort().forEach(function (monthKey) {
      fingerprints[monthKey] = context.hash(JSON.stringify(grouped[monthKey]));
    });
    return {
      fingerprints: fingerprints,
      rows: Object.keys(grouped).reduce(function (total, monthKey) {
        return total + tableNames.reduce(function (subtotal, tableName) {
          return subtotal + grouped[monthKey][tableName].length;
        }, 0);
      }, 0)
    };
  }

  function parseFingerprintMap(raw) {
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function changedMonths(previous, current) {
    var keys = {};
    Object.keys(previous || {}).forEach(function (key) { keys[key] = true; });
    Object.keys(current || {}).forEach(function (key) { keys[key] = true; });
    return Object.keys(keys).filter(function (key) {
      return previous[key] !== current[key];
    }).sort();
  }

  return {
    buildState: buildState,
    parseFingerprintMap: parseFingerprintMap,
    changedMonths: changedMonths
  };
})();
