/**
 * Owner-only yearly workbook cutover. Audits are read-only. Activation changes
 * Script Properties and installable trigger bindings; it never edits a Sheet.
 */
var YearRolloverMigration = (function () {
  var YEAR = /^20\d{2}$/;
  var MAX_SCAN_CELLS = 250000;
  var TRANSPORT_PREFIX = 'SPREADSHEET_ID_';
  var FUND_PREFIX = 'FUND_SPREADSHEET_ID_';
  var CASHFLOW_PREFIX = 'CASHFLOW_SPREADSHEET_ID_';
  var ACTIVE_YEAR = 'ACTIVE_WORKBOOK_YEAR';
  var DEFAULT_YEAR = 'DEFAULT_WORKBOOK_YEAR';
  var ACTIVE_TRANSPORT = 'ACTIVE_SPREADSHEET_ID';
  var AUDIT_BASE_STEPS = ['preflight', 'transportStructure', 'fundStructure', 'transportHeaders', 'fundHeaders'];
  var AUDIT_TAIL_STEPS = ['staleTransport', 'staleFund', 'carryover', 'queues'];
  var FORMULA_SHEETS_PER_STEP = 3;

  function audit(sourceYear, targetYear) {
    var years = years_(sourceYear, targetYear);
    var props = PropertiesService.getScriptProperties();
    var ids = ids_(props, years.sourceYear, years.targetYear);
    var blockers = [];
    var warnings = [];
    Object.keys(ids).forEach(function (key) {
      if (!ids[key]) blockers.push('Thiếu Script Property cho ' + key + '.');
    });
    if (ids.sourceTransport && ids.sourceTransport === ids.targetTransport) blockers.push('Workbook Vận tải nguồn và đích phải khác nhau.');
    if (ids.sourceFund && ids.sourceFund === ids.targetFund) blockers.push('Workbook Thu chi nguồn và đích phải khác nhau.');
    if (blockers.length) return result_(years, ids, blockers, warnings, null, null, null);

    var sourceTransport = SpreadsheetApp.openById(ids.sourceTransport);
    var targetTransport = SpreadsheetApp.openById(ids.targetTransport);
    var sourceFund = SpreadsheetApp.openById(ids.sourceFund);
    var targetFund = SpreadsheetApp.openById(ids.targetFund);
    var transportStructure = compareStructure_(sourceTransport, targetTransport);
    var fundStructure = compareStructure_(sourceFund, targetFund);
    transportStructure.missingSheets.forEach(function (name) { blockers.push('Vận tải đích thiếu sheet ' + name + '.'); });
    transportStructure.missingNamedRanges.forEach(function (name) { blockers.push('Vận tải đích thiếu named range ' + name + '.'); });
    fundStructure.missingSheets.forEach(function (name) { blockers.push('Thu chi đích thiếu sheet ' + name + '.'); });
    fundStructure.missingNamedRanges.forEach(function (name) { blockers.push('Thu chi đích thiếu named range ' + name + '.'); });
    if (!transportStructure.sheetOrderMatches) blockers.push('Thứ tự sheet Vận tải đích không khớp năm nguồn.');
    if (!fundStructure.sheetOrderMatches) blockers.push('Thứ tự sheet Thu chi đích không khớp năm nguồn.');
    transportStructure.narrowedSheets.forEach(function (name) { blockers.push('Vận tải đích thiếu cột kỹ thuật so với nguồn: ' + name + '.'); });
    fundStructure.narrowedSheets.forEach(function (name) { blockers.push('Thu chi đích thiếu cột kỹ thuật so với nguồn: ' + name + '.'); });
    transportStructure.namedRangeDrift.forEach(function (name) { warnings.push('Named range Vận tải đổi vị trí: ' + name + '.'); });
    fundStructure.namedRangeDrift.forEach(function (name) { warnings.push('Named range Thu chi đổi vị trí: ' + name + '.'); });
    transportStructure.extraSheets.forEach(function (name) { warnings.push('Vận tải đích có sheet mới ngoài nguồn: ' + name + '.'); });
    fundStructure.extraSheets.forEach(function (name) { warnings.push('Thu chi đích có sheet mới ngoài nguồn: ' + name + '.'); });

    var transportHeaders = compareHeaderRows_(sourceTransport, targetTransport, transportHeaderSpecs_());
    var fundHeaders = compareHeaderRows_(sourceFund, targetFund, [
      { name: 'NHAP_THUCHI', row: 1 }, { name: 'NHAP_VAY', row: 1 }, { name: 'CAIDAT', row: 1 }
    ]);
    transportHeaders.mismatches.forEach(function (name) { blockers.push('Thứ tự/header Vận tải đích lệch nguồn: ' + name + '.'); });
    fundHeaders.mismatches.forEach(function (name) { blockers.push('Thứ tự/header Thu chi đích lệch nguồn: ' + name + '.'); });

    var formulaRisks = scanFormulaRisks_(targetTransport, targetFund, ids, years);
    formulaRisks.oldWorkbookReferences.forEach(function (item) { blockers.push('Công thức đích còn trỏ file cũ: ' + item); });
    formulaRisks.sourceYearReferences.forEach(function (item) { warnings.push('Công thức đích còn chứa năm nguồn: ' + item); });
    var staleInputs = scanSourceYearInputs_(targetTransport, targetFund, years.sourceYear);
    staleInputs.forEach(function (item) { warnings.push('Dữ liệu đích còn giá trị năm nguồn: ' + item); });

    var carryover = auditCarryover_(years, sourceTransport, targetTransport);
    if (carryover.fund.available && !carryover.fund.balanceMatches) blockers.push('Số dư Quỹ dự kiến tại ngày chuyển tiếp chưa khớp số dư hiện tại nguồn.');
    if (carryover.fund.available && !carryover.fund.loanOutstandingMatches) blockers.push('Dư nợ Quỹ đích chưa khớp dư nợ cuối kỳ nguồn.');
    if (carryover.fund.available && !carryover.fund.debtMatches) blockers.push('Công nợ Quỹ đích chưa khớp công nợ còn lại của năm nguồn.');
    if (!carryover.fund.available) warnings.push('Chưa kiểm tra được số dư/dư nợ chuyển tiếp Quỹ: ' + carryover.fund.error);
    if (!carryover.salary.matches) blockers.push('Số dư lương đích chưa khớp các khoản còn lại của năm nguồn.');

    var queues = queueAudit_(props, years.sourceYear);
    queues.errors.forEach(function (message) { blockers.push(message); });
    if (queues.pending.length) warnings.push('Hàng đợi năm nguồn chưa rỗng: ' + queues.pending.join(', ') + '.');
    return result_(years, ids, blockers, warnings, transportStructure, fundStructure, {
      formulaRisks: formulaRisks,
      transportHeaders: transportHeaders,
      fundHeaders: fundHeaders,
      staleInputs: staleInputs,
      carryover: carryover,
      queues: queues
    });
  }

  function auditSteps(sourceYear, targetYear) {
    var years = years_(sourceYear, targetYear);
    var ids = ids_(PropertiesService.getScriptProperties(), years.sourceYear, years.targetYear);
    var steps = AUDIT_BASE_STEPS.slice();
    appendFormulaSteps_(steps, 'formulaTransport', ids.targetTransport);
    appendFormulaSteps_(steps, 'formulaFund', ids.targetFund);
    return steps.concat(AUDIT_TAIL_STEPS);
  }

  function appendFormulaSteps_(steps, prefix, workbookId) {
    if (!workbookId) {
      steps.push(prefix + ':0:0');
      return;
    }
    var count = SpreadsheetApp.openById(workbookId).getSheets().length;
    if (!count) steps.push(prefix + ':0:0');
    for (var start = 0; start < count; start += FORMULA_SHEETS_PER_STEP) {
      steps.push(prefix + ':' + start + ':' + Math.min(count, start + FORMULA_SHEETS_PER_STEP));
    }
  }

  function auditStep(sourceYear, targetYear, stepName) {
    var years = years_(sourceYear, targetYear);
    var props = PropertiesService.getScriptProperties();
    var ids = ids_(props, years.sourceYear, years.targetYear);
    var step = String(stepName || '');
    var formulaMatch = step.match(/^(formulaTransport|formulaFund):(\d+):(\d+)$/);
    if (AUDIT_BASE_STEPS.concat(AUDIT_TAIL_STEPS).indexOf(step) < 0 && !formulaMatch) {
      throw new Error('Bước audit chuyển năm không hợp lệ: ' + step + '.');
    }
    var result = { step: step, blockers: [], warnings: [], transportStructure: null, fundStructure: null, details: {} };

    if (step === 'preflight') {
      Object.keys(ids).forEach(function (key) {
        if (!ids[key]) result.blockers.push('Thiếu Script Property cho ' + key + '.');
      });
      if (ids.sourceTransport && ids.sourceTransport === ids.targetTransport) result.blockers.push('Workbook Vận tải nguồn và đích phải khác nhau.');
      if (ids.sourceFund && ids.sourceFund === ids.targetFund) result.blockers.push('Workbook Thu chi nguồn và đích phải khác nhau.');
      return result;
    }

    Object.keys(ids).forEach(function (key) {
      if (!ids[key]) throw new Error('Thiếu Script Property cho ' + key + '.');
    });

    if (step === 'transportStructure') {
      result.transportStructure = compareStructure_(SpreadsheetApp.openById(ids.sourceTransport), SpreadsheetApp.openById(ids.targetTransport));
      result.transportStructure.missingSheets.forEach(function (name) { result.blockers.push('Vận tải đích thiếu sheet ' + name + '.'); });
      result.transportStructure.missingNamedRanges.forEach(function (name) { result.blockers.push('Vận tải đích thiếu named range ' + name + '.'); });
      if (!result.transportStructure.sheetOrderMatches) result.blockers.push('Thứ tự sheet Vận tải đích không khớp năm nguồn.');
      result.transportStructure.narrowedSheets.forEach(function (name) { result.blockers.push('Vận tải đích thiếu cột kỹ thuật so với nguồn: ' + name + '.'); });
      result.transportStructure.namedRangeDrift.forEach(function (name) { result.warnings.push('Named range Vận tải đổi vị trí: ' + name + '.'); });
      result.transportStructure.extraSheets.forEach(function (name) { result.warnings.push('Vận tải đích có sheet mới ngoài nguồn: ' + name + '.'); });
      return result;
    }

    if (step === 'fundStructure') {
      result.fundStructure = compareStructure_(SpreadsheetApp.openById(ids.sourceFund), SpreadsheetApp.openById(ids.targetFund));
      result.fundStructure.missingSheets.forEach(function (name) { result.blockers.push('Thu chi đích thiếu sheet ' + name + '.'); });
      result.fundStructure.missingNamedRanges.forEach(function (name) { result.blockers.push('Thu chi đích thiếu named range ' + name + '.'); });
      if (!result.fundStructure.sheetOrderMatches) result.blockers.push('Thứ tự sheet Thu chi đích không khớp năm nguồn.');
      result.fundStructure.narrowedSheets.forEach(function (name) { result.blockers.push('Thu chi đích thiếu cột kỹ thuật so với nguồn: ' + name + '.'); });
      result.fundStructure.namedRangeDrift.forEach(function (name) { result.warnings.push('Named range Thu chi đổi vị trí: ' + name + '.'); });
      result.fundStructure.extraSheets.forEach(function (name) { result.warnings.push('Thu chi đích có sheet mới ngoài nguồn: ' + name + '.'); });
      return result;
    }

    if (step === 'transportHeaders') {
      result.details.transportHeaders = compareHeaderRows_(
        SpreadsheetApp.openById(ids.sourceTransport),
        SpreadsheetApp.openById(ids.targetTransport),
        transportHeaderSpecs_()
      );
      result.details.transportHeaders.mismatches.forEach(function (name) { result.blockers.push('Thứ tự/header Vận tải đích lệch nguồn: ' + name + '.'); });
      return result;
    }

    if (step === 'fundHeaders') {
      result.details.fundHeaders = compareHeaderRows_(
        SpreadsheetApp.openById(ids.sourceFund),
        SpreadsheetApp.openById(ids.targetFund),
        [{ name: 'NHAP_THUCHI', row: 1 }, { name: 'NHAP_VAY', row: 1 }, { name: 'CAIDAT', row: 1 }]
      );
      result.details.fundHeaders.mismatches.forEach(function (name) { result.blockers.push('Thứ tự/header Thu chi đích lệch nguồn: ' + name + '.'); });
      return result;
    }

    if (formulaMatch) {
      var isTransportFormula = formulaMatch[1] === 'formulaTransport';
      var formulaBook = SpreadsheetApp.openById(isTransportFormula ? ids.targetTransport : ids.targetFund);
      var formulaSheets = formulaBook.getSheets().slice(Number(formulaMatch[2]), Number(formulaMatch[3]));
      result.details.formulaRisks = scanFormulaRisksSheets_(formulaSheets, formulaBook.getId(), ids, years);
      result.details.formulaRisks.oldWorkbookReferences.forEach(function (item) { result.blockers.push('Công thức đích còn trỏ file cũ: ' + item); });
      result.details.formulaRisks.sourceYearReferences.forEach(function (item) { result.warnings.push('Công thức đích còn chứa năm nguồn: ' + item); });
      return result;
    }

    if (step === 'staleTransport' || step === 'staleFund') {
      var staleTransport = step === 'staleTransport';
      var staleBook = SpreadsheetApp.openById(staleTransport ? ids.targetTransport : ids.targetFund);
      var staleNames = staleTransport
        ? ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh','NL_PhanCongLai']
        : ['NHAP_THUCHI','NHAP_VAY'];
      result.details.staleInputs = scanSourceYearInputsBooks_([staleBook], staleNames, years.sourceYear);
      result.details.staleInputs.forEach(function (item) { result.warnings.push('Dữ liệu đích còn giá trị năm nguồn: ' + item); });
      return result;
    }

    if (step === 'carryover') {
      result.details.carryover = auditCarryover_(
        years,
        SpreadsheetApp.openById(ids.sourceTransport),
        SpreadsheetApp.openById(ids.targetTransport)
      );
      if (result.details.carryover.fund.available && !result.details.carryover.fund.balanceMatches) result.blockers.push('Số dư Quỹ dự kiến tại ngày chuyển tiếp chưa khớp số dư hiện tại nguồn.');
      if (result.details.carryover.fund.available && !result.details.carryover.fund.loanOutstandingMatches) result.blockers.push('Dư nợ Quỹ đích chưa khớp dư nợ cuối kỳ nguồn.');
      if (result.details.carryover.fund.available && !result.details.carryover.fund.debtMatches) result.blockers.push('Công nợ Quỹ đích chưa khớp công nợ còn lại của năm nguồn.');
      if (!result.details.carryover.fund.available) result.warnings.push('Chưa kiểm tra được số dư/dư nợ chuyển tiếp Quỹ: ' + result.details.carryover.fund.error);
      if (!result.details.carryover.salary.matches) result.blockers.push('Số dư lương đích chưa khớp các khoản còn lại của năm nguồn.');
      return result;
    }

    result.details.queues = queueAudit_(props, years.sourceYear);
    result.details.queues.errors.forEach(function (message) { result.blockers.push(message); });
    if (result.details.queues.pending.length) result.warnings.push('Hàng đợi năm nguồn chưa rỗng: ' + result.details.queues.pending.join(', ') + '.');
    return result;
  }

  function combineAuditSteps(sourceYear, targetYear, stepResults) {
    var years = years_(sourceYear, targetYear);
    var ids = ids_(PropertiesService.getScriptProperties(), years.sourceYear, years.targetYear);
    var blockers = [];
    var warnings = [];
    var transportStructure = null;
    var fundStructure = null;
    var details = {
      formulaRisks: { oldWorkbookReferences: [], sourceYearReferences: [], allowedSourceYearReferences: [], skippedSheets: [] },
      transportHeaders: null,
      fundHeaders: null,
      staleInputs: [],
      carryover: null,
      queues: { pending: [], errors: [] }
    };
    (stepResults || []).forEach(function (partial) {
      if (!partial) return;
      blockers = blockers.concat(partial.blockers || []);
      warnings = warnings.concat(partial.warnings || []);
      if (partial.transportStructure) transportStructure = partial.transportStructure;
      if (partial.fundStructure) fundStructure = partial.fundStructure;
      var partialDetails = partial.details || {};
      var formulaRisks = partialDetails.formulaRisks;
      if (formulaRisks) {
        details.formulaRisks.oldWorkbookReferences = details.formulaRisks.oldWorkbookReferences.concat(formulaRisks.oldWorkbookReferences || []);
        details.formulaRisks.sourceYearReferences = details.formulaRisks.sourceYearReferences.concat(formulaRisks.sourceYearReferences || []);
        details.formulaRisks.allowedSourceYearReferences = details.formulaRisks.allowedSourceYearReferences.concat(formulaRisks.allowedSourceYearReferences || []);
        details.formulaRisks.skippedSheets = details.formulaRisks.skippedSheets.concat(formulaRisks.skippedSheets || []);
      }
      if (partialDetails.transportHeaders) details.transportHeaders = partialDetails.transportHeaders;
      if (partialDetails.fundHeaders) details.fundHeaders = partialDetails.fundHeaders;
      if (partialDetails.staleInputs) details.staleInputs = details.staleInputs.concat(partialDetails.staleInputs);
      if (partialDetails.carryover) details.carryover = partialDetails.carryover;
      if (partialDetails.queues) details.queues = partialDetails.queues;
    });
    return result_(years, ids, blockers, warnings, transportStructure, fundStructure, details);
  }

  function prepare(sourceYear, targetYear) {
    var report = audit(sourceYear, targetYear);
    report.activationReady = report.ok && report.details.queues.pending.length === 0;
    report.confirmationToken = token_(report);
    report.steps = [
      'Tạm dừng lệnh ghi và chờ hàng đợi năm nguồn rỗng.',
      'Khắc phục mọi blocker; xác nhận các cảnh báo công thức và số dư.',
      'Kích hoạt từ Cài đặt > Năm dữ liệu bằng confirmation token hiện tại.',
      'Chạy full sync cho năm mới, kiểm tra Preview rồi mới xin duyệt Production.'
    ];
    return report;
  }

  function activate(sourceYear, targetYear, confirmationToken, afterActivate) {
    var report = prepare(sourceYear, targetYear);
    if (!report.activationReady) throw new Error('Checkpoint chuyển năm chưa sẵn sàng; xem blockers/cảnh báo hàng đợi.');
    if (!confirmationToken || confirmationToken !== report.confirmationToken) throw new Error('Confirmation token chuyển năm không hợp lệ hoặc audit đã thay đổi.');
    var props = PropertiesService.getScriptProperties();
    if (String(props.getProperty('WRITE_QUEUE_PAUSED') || '').toLowerCase() !== 'true') {
      throw new Error('Phải đặt WRITE_QUEUE_PAUSED=true trước khi kích hoạt năm mới.');
    }
    var previous = {
      year: props.getProperty(ACTIVE_YEAR) || '',
      defaultYear: props.getProperty(DEFAULT_YEAR) || '',
      transport: props.getProperty(ACTIVE_TRANSPORT) || ''
    };
    try {
      props.setProperties((function () {
        var values = {};
        values[ACTIVE_YEAR] = report.targetYear;
        values[DEFAULT_YEAR] = report.targetYear;
        values[ACTIVE_TRANSPORT] = report.ids.targetTransport;
        return values;
      })(), false);
      AppConfig.activate({ year: report.targetYear, spreadsheetId: report.ids.targetTransport });
      SupabaseService.installTransportSheetSyncTrigger(report.ids.targetTransport);
      SupabaseService.installFundSheetSyncTrigger(report.ids.targetFund);
      SupabaseService.registerSheetTriggerBindings();
      props.setProperty('SUPABASE_REALTIME_SWEEP_NEXT_AT_' + report.targetYear, '0');
      if (typeof afterActivate === 'function') afterActivate(report);
      return { ok: true, activeYear: report.targetYear, previous: previous, auditToken: report.confirmationToken };
    } catch (error) {
      if (error && error.preserveActivationState === true) {
        throw new Error('Không xác định được trạng thái registry sau yêu cầu kích hoạt. Hệ thống giữ nguyên trạng thái kích hoạt và maintenance; cần đọc lại registry trước khi thao tác tiếp. ' + error.message);
      }
      restore_(props, previous);
      AppConfig.activate({ year: report.sourceYear, spreadsheetId: report.ids.sourceTransport });
      try {
        SupabaseService.installTransportSheetSyncTrigger(report.ids.sourceTransport);
        SupabaseService.installFundSheetSyncTrigger(report.ids.sourceFund);
        SupabaseService.registerSheetTriggerBindings();
      } catch (rollbackError) {
        throw new Error('Kích hoạt thất bại và rollback trigger cũng lỗi: ' + error.message + ' | ' + rollbackError.message);
      }
      throw error;
    }
  }

  function years_(sourceYear, targetYear) {
    var source = String(sourceYear || '').trim();
    var target = String(targetYear || '').trim();
    if (!YEAR.test(source) || !YEAR.test(target)) throw new Error('Năm nguồn/đích phải có dạng YYYY.');
    if (Number(target) !== Number(source) + 1) throw new Error('Checkpoint chỉ cho phép chuyển sang năm kế tiếp.');
    return { sourceYear: source, targetYear: target };
  }

  function ids_(props, sourceYear, targetYear) {
    function fund(year) { return String(props.getProperty(FUND_PREFIX + year) || props.getProperty(CASHFLOW_PREFIX + year) || '').trim(); }
    var sourceTransport = String(props.getProperty(TRANSPORT_PREFIX + sourceYear) || '').trim();
    var sourceFund = fund(sourceYear);
    if (String(sourceYear) === '2026') {
      sourceTransport = sourceTransport || String(
        props.getProperty(ACTIVE_TRANSPORT) ||
        props.getProperty('DEFAULT_SPREADSHEET_ID') ||
        APP_CONFIG.spreadsheetId || ''
      ).trim();
      sourceFund = sourceFund || String(props.getProperty('FUND_SPREADSHEET_ID') || '').trim();
      if (!sourceFund && typeof FundService !== 'undefined' && FundService.resolveFundSpreadsheetId) {
        sourceFund = String(FundService.resolveFundSpreadsheetId('2026') || '').trim();
      }
    }
    return {
      sourceTransport: sourceTransport,
      targetTransport: String(props.getProperty(TRANSPORT_PREFIX + targetYear) || '').trim(),
      sourceFund: sourceFund,
      targetFund: fund(targetYear)
    };
  }

  function compareStructure_(source, target) {
    var sourceSheets = source.getSheets().map(function (sheet) { return sheet.getName(); });
    var targetSheets = target.getSheets().map(function (sheet) { return sheet.getName(); });
    var sourceRanges = source.getNamedRanges().map(function (range) { return range.getName(); });
    var targetRanges = target.getNamedRanges().map(function (range) { return range.getName(); });
    var sourceRangeMap = namedRangeMap_(source);
    var targetRangeMap = namedRangeMap_(target);
    return {
      missingSheets: sourceSheets.filter(function (name) { return targetSheets.indexOf(name) < 0; }),
      extraSheets: targetSheets.filter(function (name) { return sourceSheets.indexOf(name) < 0; }),
      missingNamedRanges: sourceRanges.filter(function (name) { return targetRanges.indexOf(name) < 0; }),
      extraNamedRanges: targetRanges.filter(function (name) { return sourceRanges.indexOf(name) < 0; }),
      sheetOrderMatches: JSON.stringify(sourceSheets) === JSON.stringify(targetSheets),
      narrowedSheets: source.getSheets().filter(function (sheet) {
        var targetSheet = target.getSheetByName(sheet.getName());
        return targetSheet && targetSheet.getMaxColumns() < sheet.getMaxColumns();
      }).map(function (sheet) { return sheet.getName(); }),
      namedRangeDrift: sourceRanges.filter(function (name) {
        return targetRangeMap[name] && sourceRangeMap[name] !== targetRangeMap[name];
      })
    };
  }

  function namedRangeMap_(book) {
    var result = {};
    book.getNamedRanges().forEach(function (namedRange) {
      var range = namedRange.getRange();
      result[namedRange.getName()] = range.getSheet().getName() + '!' + range.getA1Notation();
    });
    return result;
  }

  function transportHeaderSpecs_() {
    var result = [];
    Object.keys(APP_CONFIG.sheets || {}).forEach(function (key) {
      var spec = APP_CONFIG.sheets[key];
      result.push({ name: spec.name, row: spec.headerRow || 1, columns: spec.columns || 0 });
    });
    result.push({ name: 'NL_SoDuLuong', row: 1 });
    return result;
  }

  function compareHeaderRows_(source, target, specs) {
    var mismatches = [];
    var checked = [];
    (specs || []).forEach(function (spec) {
      var sourceSheet = source.getSheetByName(spec.name);
      var targetSheet = target.getSheetByName(spec.name);
      if (!sourceSheet || !targetSheet) return;
      var columns = Math.max(Number(spec.columns || 0), sourceSheet.getLastColumn(), targetSheet.getLastColumn());
      if (!columns) return;
      var sourceHeader = sourceSheet.getRange(spec.row, 1, 1, columns).getDisplayValues()[0].map(normalizeHeader_);
      var targetHeader = targetSheet.getRange(spec.row, 1, 1, columns).getDisplayValues()[0].map(normalizeHeader_);
      checked.push(spec.name + '!' + spec.row);
      if (JSON.stringify(sourceHeader) !== JSON.stringify(targetHeader)) mismatches.push(spec.name + '!' + spec.row);
    });
    return { checked: checked, mismatches: mismatches };
  }

  function normalizeHeader_(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function scanFormulaRisks_(targetTransport, targetFund, ids, years) {
    return scanFormulaRisksBooks_([targetTransport, targetFund], ids, years);
  }

  function scanFormulaRisksBooks_(books, ids, years) {
    var result = { oldWorkbookReferences: [], sourceYearReferences: [], allowedSourceYearReferences: [], skippedSheets: [] };
    (books || []).filter(Boolean).forEach(function (book) {
      var partial = scanFormulaRisksSheets_(book.getSheets(), book.getId(), ids, years);
      result.oldWorkbookReferences = result.oldWorkbookReferences.concat(partial.oldWorkbookReferences);
      result.sourceYearReferences = result.sourceYearReferences.concat(partial.sourceYearReferences);
      result.allowedSourceYearReferences = result.allowedSourceYearReferences.concat(partial.allowedSourceYearReferences || []);
      result.skippedSheets = result.skippedSheets.concat(partial.skippedSheets);
    });
    return result;
  }

  function scanFormulaRisksSheets_(sheets, workbookId, ids, years) {
    var oldIds = [ids.sourceTransport, ids.sourceFund].filter(Boolean);
    var result = { oldWorkbookReferences: [], sourceYearReferences: [], allowedSourceYearReferences: [], skippedSheets: [] };
    (sheets || []).forEach(function (sheet) {
      var range = sheet.getDataRange();
      var cells = range.getNumRows() * range.getNumColumns();
      if (cells > MAX_SCAN_CELLS) { result.skippedSheets.push(workbookId + ':' + sheet.getName()); return; }
      range.getFormulas().forEach(function (row, rowIndex) { row.forEach(function (formula, columnIndex) {
        if (!formula) return;
        var where = sheet.getName() + '!' + sheet.getRange(rowIndex + 1, columnIndex + 1).getA1Notation();
        if (oldIds.some(function (id) { return formula.indexOf(id) >= 0; })) result.oldWorkbookReferences.push(where);
        if (formula.indexOf(years.sourceYear) >= 0) {
          if (isAllowedSourceYearFormula_(workbookId, sheet.getName(), sheet.getRange(rowIndex + 1, columnIndex + 1).getA1Notation(), ids, years)) {
            result.allowedSourceYearReferences.push(where);
          } else {
            result.sourceYearReferences.push(where);
          }
        }
      }); });
    });
    return result;
  }

  function scanSourceYearInputs_(transport, fund, sourceYear) {
    var names = ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh','NL_PhanCongLai','NHAP_THUCHI','NHAP_VAY'];
    return scanSourceYearInputsBooks_([transport, fund], names, sourceYear);
  }

  function scanSourceYearInputsBooks_(books, names, sourceYear) {
    var hits = [];
    (books || []).filter(Boolean).forEach(function (book) { names.forEach(function (name) {
      var sheet = book.getSheetByName(name); if (!sheet) return;
      var range = sheet.getDataRange(); if (range.getNumRows() * range.getNumColumns() > MAX_SCAN_CELLS) return;
      var values = range.getValues(); var formulas = range.getFormulas();
      values.forEach(function (row, r) { row.forEach(function (value, c) {
        if (formulas[r][c] || hits.length >= 100 || isGeneratedCarryoverNote_(value, sourceYear)) return;
        var year = Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime()) ? value.getFullYear() : null;
        if (year === Number(sourceYear) || (typeof value === 'string' && value.indexOf(sourceYear) >= 0)) hits.push(name + '!' + sheet.getRange(r + 1, c + 1).getA1Notation());
      }); });
    }); });
    return hits;
  }

  function auditCarryover_(years, sourceTransport, targetTransport) {
    var fund = { available: false, error: '', sourceBalance: null, targetBalance: null, targetOpening: null, targetFundLoanNet: null, targetProjectedBalance: null, balanceMatches: false, sourceLoanOutstanding: null, targetLoanOutstanding: null, loanOutstandingMatches: false, sourceDebt: null, targetDebt: null, debtMatches: false };
    try {
      var sourceOverview = FundService.getFundOverview(years.sourceYear, { forceRefresh: true });
      var targetOverview = FundService.getFundOverview(years.targetYear, { forceRefresh: true });
      var targetOptions = FundService.getFundFormOptions(years.targetYear, true);
      var sourceLoans = FundService.getFundLoanOverview(years.sourceYear, { forceRefresh: true });
      var targetLoans = FundService.getFundLoanOverview(years.targetYear, { forceRefresh: true });
      var sourceFundBook = FundService.getFundSpreadsheet_(years.sourceYear);
      var targetFundBook = FundService.getFundSpreadsheet_(years.targetYear);
      fund.sourceBalance = metric_(sourceOverview.metrics, 'currentBalance');
      fund.targetBalance = metric_(targetOverview.metrics, 'currentBalance');
      fund.targetOpening = Number(targetOptions.settings.cashOpening || 0) + Number(targetOptions.settings.bankOpening || 0);
      fund.sourceLoanOutstanding = metric_(sourceLoans.metrics, 'outstanding');
      fund.targetLoanOutstanding = metric_(targetLoans.metrics, 'outstanding');
      fund.targetFundLoanNet = fundLoanNet_(targetLoans.recentRows || []);
      fund.targetProjectedBalance = fund.targetOpening + fund.targetFundLoanNet;
      fund.sourceDebt = YearRolloverSnapshotService.debtSummary(sourceFundBook);
      fund.targetDebt = YearRolloverSnapshotService.debtSummary(targetFundBook);
      fund.balanceMatches = nearlyEqual_(fund.sourceBalance, fund.targetProjectedBalance);
      fund.loanOutstandingMatches = nearlyEqual_(fund.sourceLoanOutstanding, fund.targetLoanOutstanding);
      fund.debtMatches = debtMatches_(fund.sourceDebt, fund.targetDebt);
      fund.available = true;
    } catch (error) {
      fund.error = error && error.message ? error.message : String(error);
      throw new Error('Không kiểm tra được số dư/dư nợ chuyển tiếp Quỹ: ' + fund.error);
    }
    var sourceSalary = YearRolloverSnapshotService.salarySummary(sourceTransport);
    var targetSalary = YearRolloverSnapshotService.salarySummary(targetTransport);
    return {
      fund: fund,
      salary: {
        sourceRows: dataRows_(sourceTransport.getSheetByName('NL_SoDuLuong')),
        targetRows: dataRows_(targetTransport.getSheetByName('NL_SoDuLuong')),
        sourceOutstanding: sourceSalary,
        targetOutstanding: targetSalary,
        matches: JSON.stringify(sourceSalary.balances) === JSON.stringify(targetSalary.balances)
      }
    };
  }

  function metric_(metrics, key) {
    var row = (metrics || []).filter(function (item) { return item.key === key; })[0];
    return Number(row && row.value || 0);
  }
  function fundLoanNet_(rows) {
    return (rows || []).reduce(function (total, row) {
      if (!row || row.nonFund === true) return total;
      var amount = Number(row.amount || 0);
      if (row.type === 'Vay') return total + amount;
      if (row.type === 'Trả nợ' || row.type === 'Trả lãi') return total - amount;
      return total;
    }, 0);
  }
  function isAllowedSourceYearFormula_(workbookId, sheetName, a1, ids, years) {
    if (typeof YearRolloverManifestCatalog === 'undefined' || typeof YearRolloverManifestCatalog.get !== 'function') return false;
    var moduleName = String(workbookId || '') === String(ids.targetTransport || '') ? 'transport'
      : String(workbookId || '') === String(ids.targetFund || '') ? 'cashflow' : '';
    if (!moduleName) return false;
    var manifest = YearRolloverManifestCatalog.get(years.targetYear);
    var allowed = manifest && manifest.audit && manifest.audit.sourceYearFormulaAllowlist || [];
    return allowed.some(function (item) {
      return String(item.module || '') === moduleName && String(item.sheet || '') === String(sheetName || '') && String(item.range || '') === String(a1 || '');
    });
  }
  function isGeneratedCarryoverNote_(value, sourceYear) {
    if (typeof value !== 'string') return false;
    var text = value.replace(/\s+/g, ' ').trim();
    return text.indexOf('Chuyển tiếp công nợ từ ' + sourceYear) === 0 ||
      text.indexOf('Chuyển tiếp dư nợ từ ' + sourceYear) === 0 ||
      text.indexOf('Chuyển tiếp từ ' + sourceYear) === 0;
  }
  function nearlyEqual_(left, right) { return Math.abs(Number(left || 0) - Number(right || 0)) < 0.5; }
  function debtMatches_(left, right) {
    return Number(left && left.count || 0) === Number(right && right.count || 0) &&
      nearlyEqual_(left && left.receivable, right && right.receivable) &&
      nearlyEqual_(left && left.payable, right && right.payable);
  }
  function dataRows_(sheet) { return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0; }
  function queueAudit_(props, sourceYear) {
    var bases = ['SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_', 'SUPABASE_PENDING_FUND_SYNC_'];
    var pending = [];
    var errors = [];
    bases.forEach(function (base) { [base + sourceYear, base + sourceYear + '_LEASE'].forEach(function (key) { if (props.getProperty(key)) pending.push(key); }); });
    ['TRANSPORT', 'FUND'].forEach(function (module) {
      var signalKey = 'SUPABASE_SHEET_SIGNAL_' + module + '_' + sourceYear;
      var raw = props.getProperty(signalKey);
      if (!raw) return;
      try {
        var signal = JSON.parse(raw);
        if (signal.token && String(signal.token) !== String(props.getProperty(signalKey + '_CONSUMED') || '')) pending.push(signalKey);
      } catch (error) { pending.push(signalKey + ':malformed'); }
    });
    var runningKey = 'SUPABASE_REALTIME_TICK_RUNNING_' + sourceYear;
    var runningRaw = props.getProperty(runningKey);
    if (runningRaw) {
      try { if (Number(JSON.parse(runningRaw).expiresAt || 0) > new Date().getTime()) pending.push(runningKey); }
      catch (error) { pending.push(runningKey + ':malformed'); }
    }
    try {
      WriteJobRepository.listActiveForRollover(sourceYear, 101).forEach(function (job) {
        pending.push('write_jobs:' + job.jobId + ':' + job.status);
      });
    } catch (error) {
      errors.push('Không kiểm tra được write_jobs trước chuyển năm: ' + (error && error.message ? error.message : String(error)));
    }
    return { pending: pending, errors: errors };
  }
  function result_(years, ids, blockers, warnings, transport, fund, details) {
    return { ok: blockers.length === 0, sourceYear: years.sourceYear, targetYear: years.targetYear, ids: ids, blockers: blockers, warnings: warnings, transportStructure: transport, fundStructure: fund, details: details || { queues: { pending: [], errors: [] } } };
  }
  function token_(report) {
    var stable = JSON.stringify({ sourceYear: report.sourceYear, targetYear: report.targetYear, ids: report.ids, blockers: report.blockers, warnings: report.warnings, details: report.details });
    return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, stable)).replace(/=+$/, '');
  }
  function restore_(props, previous) {
    var values = {}; values[ACTIVE_YEAR] = previous.year; values[DEFAULT_YEAR] = previous.defaultYear; values[ACTIVE_TRANSPORT] = previous.transport;
    Object.keys(values).forEach(function (key) { if (values[key]) props.setProperty(key, values[key]); else props.deleteProperty(key); });
  }
  return { audit: audit, auditSteps: auditSteps, auditStep: auditStep, combineAuditSteps: combineAuditSteps, prepare: prepare, activate: activate };
})();

function auditYearRollover(sourceYear, targetYear) { return YearRolloverMigration.audit(sourceYear, targetYear); }
function prepareYearRollover(sourceYear, targetYear) { return YearRolloverMigration.prepare(sourceYear, targetYear); }
function activateYearRollover() { throw new Error('Kích hoạt trực tiếp đã tắt; hãy dùng Cài đặt > Năm dữ liệu để cập nhật đồng thời Apps Script và registry.'); }
