/** Compare input snapshots before scheduling expensive caches. Commit only after cache stages. */
var TransportSourceProbeService = (function () {
  var PREFIX = 'SUPABASE_TRANSPORT_INPUT_HASH_V1_';
  function createReader(context) {
    var spreadsheet = null;
    var snapshot = null;
    function log(record) {
      try { context.log('transport_probe_phase:' + JSON.stringify(record)); } catch (ignored) {}
    }
    function measure(sheet, phase, work) {
      var label = /^[A-Z][A-Za-z0-9_]{0,63}$/.test(sheet) ? sheet : 'unknown';
      var started = context.nowMillis();
      log({ sheet: label, phase: phase, event: 'start' });
      var ok = false;
      try {
        var result = work();
        ok = true;
        return result;
      } finally {
        // Do not log cell values, formulas, hashes or exception/HTTP contents.
        log({ sheet: label, phase: phase, event: 'end', ms: Math.max(0, context.nowMillis() - started), ok: ok });
      }
    }
    function readHash(sheetName) {
      snapshot = null;
      if (!spreadsheet) spreadsheet = measure(sheetName, 'openWorkbook', context.openSpreadsheet);
      var sheet = measure(sheetName, 'getSheet', function () { return spreadsheet.getSheetByName(sheetName); });
      if (!sheet) throw new Error('Không tìm thấy sheet ' + sheetName + '.');
      var rows = measure(sheetName, 'lastRow', function () { return Math.max(1, sheet.getLastRow()); });
      var columns = measure(sheetName, 'lastColumn', function () { return Math.max(1, sheet.getLastColumn()); });
      var range = measure(sheetName, 'getRange', function () { return sheet.getRange(1, 1, rows, columns); });
      var values = measure(sheetName, 'values', function () { return range.getValues(); });
      var display = measure(sheetName, 'display', function () { return range.getDisplayValues(); });
      var formulas = measure(sheetName, 'formulas', function () { return range.getFormulas(); });
      var hash = measure(sheetName, 'hash', function () { return context.hash(JSON.stringify([values, display, formulas])); });
      var months = measure(sheetName, 'months', function () { return context.monthKeys(sheetName, values, display); });
      // Retain only compact metadata, not three whole-sheet arrays.
      snapshot = { sheet: sheetName, months: months };
      return hash;
    }
    return {
      readHash: readHash,
      measure: measure,
      monthKeys: function (sheetName) {
        if (!snapshot || snapshot.sheet !== sheetName) throw new Error('Missing current transport probe snapshot.');
        return snapshot.months.slice();
      }
    };
  }
  function eligible(item) {
    return (item.sources || []).some(function (source) {
      return /^signal:transport:|^safety:transport$/.test(source);
    });
  }
  function tasks(item, sources) {
    item.inputHashes = {};
    item.changedSheets = [];
    item.changedCatalogs = [];
    item.changedReports = false;
    item.fastManagedSheets = [];
    function probe(source) { return ['probeInput', source.sheet, source.kind, source.display || source.sheet]; }
    return sources.filter(function (source) { return source.kind === 'manage'; }).map(probe)
      .concat([['publishPriorityTransport']])
      .concat(sources.filter(function (source) { return source.kind !== 'manage'; }).map(probe))
      .concat([['planInputs']]);
  }
  function run(task, item, context) {
    if (task[0] === 'probeInput') {
      var hash = context.readHash(task[1]);
      item.inputHashes[task[1]] = hash;
      function measure(phase, work) { return context.measure ? context.measure(task[1], phase, work) : work(); }
      var previousHash = measure('previousHash', function () { return context.getProperty(PREFIX + task[1]); });
      if (previousHash !== hash || !measure('cacheIndex', function () { return context.cachePresent(task); })) {
        if (task[2] === 'manage') {
          item.changedSheets.push(task[1]);
          item.fastManagedSheets.push(task[1]);
          var fast = [['manage', task[1]]];
          (item.priorityMonths || []).concat(context.currentMonth ? [context.currentMonth] : [])
            .filter(function (month, index, all) { return all.indexOf(month) === index; })
            .sort().reverse().forEach(function (month) { fast.push(['manageMonth', task[1], month]); });
          // Publish an input immediately; do not wait for 23 catalog/helper probes.
          return { result: { ok: true }, added: fast };
        }
        else if (task[2] === 'catalog') item.changedCatalogs.push(task[3]);
        else item.changedReports = true;
      }
      return { result: { ok: true } };
    }
    if (task[0] === 'publishPriorityTransport') {
      if (!item.changedSheets.length && (item.sources || []).indexOf('safety:transport') < 0) return { result: { ok: true } };
      item.fastDashboard = true;
      var priority = [['dashboard']];
      if (item.full) priority.push(['discoverReports']);
      priority.push(['preparePriorityReport'], ['background']);
      return { result: { ok: true }, added: priority };
    }
    if (task[0] === 'planInputs') {
      // Original sheets/catalogs/full scope stays in the lease for rollback.
      // The default planner receives only changed sources; report refresh stays
      // full because catalog/helper changes can affect historical months.
      var changed = item.changedSheets.length || item.changedCatalogs.length || item.changedReports;
      var safety = (item.sources || []).indexOf('safety:transport') >= 0;
      var externalScope = (item.sources || []).some(function (source) { return !/^signal:transport:|^safety:transport$/.test(source); });
      var plan = { sheets: item.changedSheets, catalogs: item.changedCatalogs, full: !!changed || safety || (externalScope && item.full), months: externalScope ? item.months || [] : [],
        priorityMonths: item.priorityMonths || [], fastManagedSheets: item.fastManagedSheets,
        fastDashboard: item.fastDashboard, priorityReport: item.priorityReport };
      var added = changed || safety || externalScope ? context.buildCacheTasks(plan) : [];
      // Reports/dashboard can change with time/formulas even if input hashes
      // match. Safety also repairs startup/options without rereading every catalog.
      if (safety && !item.changedCatalogs.length) added = added.concat(context.safetyCatalogTasks());
      item.skipVerification = !changed && !safety && !externalScope;
      added.push(['commitInputs']);
      return { result: { ok: true }, added: added };
    }
    if (task[0] === 'commitInputs') {
      context.commit(function () {
        Object.keys(item.inputHashes).forEach(function (sheet) {
          context.setProperty(PREFIX + sheet, item.inputHashes[sheet]);
        });
      });
      return { result: { ok: true } };
    }
    return null;
  }
  return { eligible: eligible, tasks: tasks, run: run, createReader: createReader };
})();
