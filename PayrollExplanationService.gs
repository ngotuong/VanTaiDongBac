/** Builds read-only payroll evidence. It never writes to Google Sheets. */
var PayrollExplanationService = (function () {
  var CONTRACT_VERSION = 'payroll-explanation-v6';
  var SOURCE_SHEETS = [
    'BC_BangLuong', 'XL_LuongNhanSu', 'XL_LuongTheoXe', 'NL_ChamCong',
    'NL_TaiXe', 'SYS_AggTaiXeNgay', 'DM_LuongChuyen', 'DM_DuAn', 'DM_NhanSu',
    'DM_ThamSo', 'XL_ThuongQuanLy', 'DM_ThuongQuanLy', 'DM_LichSuNhanSu', 'SYS_AggThuongTuyen'
  ];
  var TOLERANCE = 0.5;

  function buildMonth(spreadsheet, month, options) {
    var context = options || {};
    var normalizedMonth = normalizeMonth_(month);
    if (!normalizedMonth) throw new Error('Tháng giải trình phải có dạng MM/YYYY.');

    var finalRows = readRecords_(spreadsheet, 'BC_BangLuong', 2).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === normalizedMonth && !isTotalEmployee_(value_(record, ['Nhân sự']));
    });
    var personnelRows = readRecords_(spreadsheet, 'XL_LuongNhanSu', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === normalizedMonth;
    });
    var salaryRows = readRecords_(spreadsheet, 'XL_LuongTheoXe', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === normalizedMonth;
    });
    var attendanceRows = readRecords_(spreadsheet, 'NL_ChamCong', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === normalizedMonth;
    });
    var employeeSourceRows = readOptionalRecords_(spreadsheet, 'DM_NhanSu', 1);
    var recruitmentRows = readRecords_(spreadsheet, 'DM_LichSuNhanSu', 1);
    var recruitmentTotals = readRecords_(spreadsheet, 'SYS_AggThuongTuyen', 1);
    var managementBonusRows = readOptionalRecords_(spreadsheet, 'XL_ThuongQuanLy', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === normalizedMonth;
    });
    var managementRuleRows = readRecords_(spreadsheet, 'DM_ThuongQuanLy', 1);
    var dailyContext = createDailyContext_(normalizedMonth, {
      driverRows: readOptionalRecords_(spreadsheet, 'NL_TaiXe', 1),
      aggregateRows: readOptionalRecords_(spreadsheet, 'SYS_AggTaiXeNgay', 1),
      rateRows: readOptionalRecords_(spreadsheet, 'DM_LuongChuyen', 1),
      projectRows: readOptionalRecords_(spreadsheet, 'DM_DuAn', 1),
      employeeRows: employeeSourceRows,
      parameterRows: readOptionalRecords_(spreadsheet, 'DM_ThamSo', 1)
    });

    var employeeRows = finalRows.concat(personnelRows);
    var collisions = collisionKeys_(employeeRows);
    var employees = [];
    var employeeSeen = {};
    employeeRows.forEach(function (record) {
      var employeeName = clean_(value_(record, ['Nhân sự']));
      var employeeKey = employeeKey_(employeeName);
      if (!employeeKey || employeeSeen[employeeKey]) return;
      employeeSeen[employeeKey] = true;
      employees.push({ key: employeeKey, name: employeeName });
    });
    var syncedAt = context.syncedAt || new Date().toISOString();
    var sourceDataVersion = String(context.sourceDataVersion || '').trim() || syncedAt;
    return employees.map(function (employee) {
      var employeeName = employee.name;
      var employeeKey = employee.key;
      var matchingPersonnel = matchingEmployeeRows_(personnelRows, employeeKey);
      var matchingSalary = matchingEmployeeRows_(salaryRows, employeeKey);
      var matchingAttendance = matchingEmployeeRows_(attendanceRows, employeeKey);
      return buildEmployeeBundle_({
        month: normalizedMonth,
        employeeName: employeeName,
        employeeKey: employeeKey,
        finalRows: matchingEmployeeRows_(finalRows, employeeKey),
        personnelRows: matchingPersonnel,
        salaryRows: matchingSalary,
        attendanceRows: matchingAttendance,
        dailyContext: dailyContext,
        employeeSourceRows: recruitmentRows,
        recruitmentTotals: recruitmentTotals,
        managementBonusRows: managementBonusRows,
        managementRuleRows: managementRuleRows,
        keyCollision: Boolean(collisions[employeeKey]),
        sourceDataVersion: sourceDataVersion,
        syncedAt: syncedAt
      });
    });
  }

  function buildEmployeeBundle_(input) {
    var warnings = [];
    if (input.keyCollision) warnings.push('Khóa nhân sự bị trùng sau khi chuẩn hóa tên.');
    if (input.finalRows.length !== 1) warnings.push('Cần đúng một dòng BC_BangLuong cho nhân sự trong tháng.');
    if (input.personnelRows.length !== 1) warnings.push('Cần đúng một dòng XL_LuongNhanSu cho nhân sự trong tháng.');

    var finalPayroll = input.finalRows.length ? mapFinalPayroll_(input.finalRows[0]) : null;
    var personnelCalculation = input.personnelRows.length ? mapPersonnel_(input.personnelRows[0]) : null;
    var salaryLines = input.salaryRows.map(function (record) {
      return buildSalaryLine_(record, input.employeeKey, input.month, input.dailyContext, warnings);
    });
    var attendance = input.attendanceRows.map(mapAttendance_);
    var roleEvidence = buildRoleEvidence_(
      (finalPayroll && finalPayroll.role) || (personnelCalculation && personnelCalculation.role) || '',
      input.employeeKey,
      input.month,
      input.employeeSourceRows,
      input.managementBonusRows,
      input.managementRuleRows,
      input.recruitmentTotals,
      finalPayroll ? finalPayroll.reward : 0,
      warnings
    );
    var reconciliation = [];

    if (finalPayroll && personnelCalculation) {
      compare_(reconciliation, warnings, 'tripCount', personnelCalculation.tripCount, finalPayroll.tripCount, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'tripSalary', personnelCalculation.tripSalary, finalPayroll.tripSalary, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'fixedSalaryActual', personnelCalculation.fixedSalaryActual, finalPayroll.fixedSalaryActual, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'paidLeaveDays', personnelCalculation.paidLeaveDays, finalPayroll.paidLeaveDays, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'deductedDays', personnelCalculation.deductedDays, finalPayroll.deductedDays, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'reward', personnelCalculation.reward, finalPayroll.reward, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'grossSalary', personnelCalculation.grossSalary, finalPayroll.grossSalary, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'advance', personnelCalculation.advance, finalPayroll.advance, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'penalty', personnelCalculation.penalty, finalPayroll.penalty, 'XL_LuongNhanSu', 'BC_BangLuong');
      compare_(reconciliation, warnings, 'netSalary', personnelCalculation.netSalary, finalPayroll.netSalary, 'XL_LuongNhanSu', 'BC_BangLuong');
    }

    if (finalPayroll) {
      var explainedTripSalary = salaryLines.reduce(function (total, line) { return total + line.finalTripSalary; }, 0);
      compare_(reconciliation, warnings, 'salaryLineTotal', explainedTripSalary, finalPayroll.tripSalary, 'XL_LuongTheoXe', 'BC_BangLuong');
    }

    var status = !finalPayroll ? 'pending' : warnings.length ? 'needs_review' : 'matched';
    return {
      contractVersion: CONTRACT_VERSION,
      month: input.month,
      employeeKey: input.employeeKey,
      employeeName: input.employeeName,
      status: status,
      warnings: unique_(warnings),
      sourceDataVersion: input.sourceDataVersion,
      syncedAt: input.syncedAt,
      finalPayroll: finalPayroll,
      personnelCalculation: personnelCalculation,
      salaryLines: salaryLines,
      attendance: attendance,
      roleEvidence: roleEvidence,
      reconciliation: reconciliation,
      sourceContract: {
        authoritativeResult: 'BC_BangLuong',
        officialAttendance: 'NL_ChamCong',
        kpiAdjustment: 'NL_NghiVanHanh via XL_LuongTheoXe',
        dailyMixedEvidence: 'NL_TaiXe + SYS_AggTaiXeNgay + DM_LuongChuyen',
        dailyClassificationEffectiveFrom: dateKey_(input.dailyContext.dailyEffectiveFrom),
        sheetsRead: SOURCE_SHEETS.slice()
      }
    };
  }

  function buildRoleEvidence_(role, employeeKey, month, employeeRows, managementRows, ruleRows, recruitmentTotals, reportedReward, warnings) {
    var normalizedRole = normalizeText_(role);
    var isManager = normalizedRole === normalizeText_('Quản lý');
    var isRecruiter = normalizedRole === normalizeText_('Người tuyển');

    var rules = ruleRows.map(function (record) {
      return {
        code: clean_(value_(record, ['Mã', 'Mã thưởng', 'Mã quy tắc', 'Mã loại thưởng'])),
        condition: clean_(value_(record, ['Điều kiện', 'Tên thưởng', 'Diễn giải', 'Nội dung'])),
        amount: number_(value_(record, ['Số tiền/xe', 'Số tiền', 'Mức thưởng', 'Giá trị', 'Đơn giá'])),
        effectiveFrom: serialize_(value_(record, ['Hiệu lực từ', 'Từ ngày'])),
        effectiveTo: serialize_(value_(record, ['Hiệu lực đến', 'Đến ngày']))
      };
    }).filter(function (rule) { return rule.code || rule.condition || rule.amount; });

    var managerRows = managementRows.map(function (record) {
      return {
        vehicle: clean_(value_(record, ['Biển số xe', 'Biển số'])),
        project: clean_(value_(record, ['Dự án', 'Nhóm vận hành'])),
        totalTrips: number_(value_(record, ['Tổng chuyến'])),
        recruitmentBonus: number_(value_(record, ['Thưởng tuyển lái'])),
        milestone112: number_(value_(record, ['Mốc 0-112', 'Thưởng mốc 0-112', 'Thưởng mốc 112'])),
        milestone140: number_(value_(record, ['Mốc 113-140', 'Thưởng mốc 113-140', 'Thưởng mốc 140'])),
        milestone168: number_(value_(record, ['Mốc 141-168', 'Thưởng mốc 141-168', 'Thưởng mốc 168'])),
        managementBonus: number_(value_(record, ['Tổng thưởng', 'Tổng thưởng mốc QL', 'Tổng thưởng quản lý'])),
        managementDays: number_(value_(record, ['Tổng ngày QL', 'Tổng ngày quản lý']))
      };
    }).filter(function (row) {
      return row.vehicle || row.totalTrips || row.recruitmentBonus || row.managementBonus;
    });

    var bounds = monthBounds_(month);
    var rate = recruitmentRate_(ruleRows, bounds.start);
    var recruitedPeople = recruitmentEvidence_(employeeRows, employeeKey, bounds, rate);
    var recruitmentBonusTotal = Math.round(recruitedPeople.reduce(function (sum, row) { return sum + row.rawBonus; }, 0) / 1000) * 1000;
    var authoritative = recruitmentTotals.filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === month && employeeKey_(value_(record, ['Người tuyển'])) === employeeKey;
    });
    if (authoritative.length > 1 || (authoritative.length === 1 && Math.abs(number_(value_(authoritative[0], ['Thưởng tuyển'])) - recruitmentBonusTotal) > TOLERANCE) ||
        (recruitedPeople.length && authoritative.length !== 1)) warnings.push('Thưởng tuyển chưa khớp SYS_AggThuongTuyen; cần kiểm tra lịch sử đợt và quy tắc hiệu lực.');
    recruitedPeople = recruitedPeople.map(function (row) { delete row.rawBonus; return row; });
    if (!isManager && !isRecruiter && !recruitedPeople.length) return null;
    var managementBonusTotal = managerRows.reduce(function (sum, row) { return sum + row.managementBonus; }, 0);
    var explainedRewardTotal = managementBonusTotal + recruitmentBonusTotal;
    if (isManager && reportedReward && !managerRows.length) warnings.push('Thiếu dữ liệu XL_ThuongQuanLy để giải thích thưởng quản lý.');
    if (isManager && Math.abs(number_(reportedReward) - explainedRewardTotal) > TOLERANCE) {
      warnings.push('Thưởng quản lý trên bảng lương chưa khớp tổng thưởng KPI xe và tuyển người: ' + (number_(reportedReward) - explainedRewardTotal) + '.');
    }
    if (isRecruiter && reportedReward && !recruitedPeople.length && !recruitmentBonusTotal) warnings.push('Thiếu dữ liệu tuyển dụng để giải thích thưởng người tuyển.');
    if (isRecruiter && Math.abs(number_(reportedReward) - recruitmentBonusTotal) > TOLERANCE) {
      warnings.push('Thưởng người tuyển trên bảng lương chưa khớp số tiền thưởng tuyển dụng từ nguồn: ' + (number_(reportedReward) - recruitmentBonusTotal) + '.');
    }
    var explainedForRole = isManager ? explainedRewardTotal : recruitmentBonusTotal;
    return {
      kind: isManager ? 'manager' : (isRecruiter ? 'recruiter' : 'employee'),
      reportedReward: number_(reportedReward),
      managementBonusTotal: managementBonusTotal,
      recruitmentBonusTotal: recruitmentBonusTotal,
      explainedRewardTotal: explainedForRole,
      otherReward: number_(reportedReward) - explainedForRole,
      managerRows: isManager ? managerRows : [],
      recruitedPeople: recruitedPeople,
      rules: rules,
      recruitmentRule: {
        amountPerMonth: rate,
        daysInMonth: bounds.end.getDate(),
        roundingUnit: 1000
      },
      source: isManager ? 'XL_ThuongQuanLy + DM_ThuongQuanLy + DM_LichSuNhanSu + SYS_AggThuongTuyen' : 'DM_LichSuNhanSu + SYS_AggThuongTuyen'
    };
  }

  function recruitmentRate_(records, monthStart) {
    var candidates = records.filter(function (record) {
      var from = date_(value_(record, ['Hiệu lực từ', 'Từ ngày']));
      var to = date_(value_(record, ['Hiệu lực đến', 'Đến ngày']));
      return clean_(value_(record, ['Mã', 'Mã thưởng'])) === 'TUYEN_DU_2_LAI' && from &&
        compareDates_(from, monthStart) <= 0 && (!to || compareDates_(to, monthStart) >= 0);
    }).sort(function (a, b) { return compareDates_(date_(value_(b, ['Hiệu lực từ', 'Từ ngày'])), date_(value_(a, ['Hiệu lực từ', 'Từ ngày']))); });
    if (!candidates.length) return 0;
    if (candidates.length > 1 && compareDates_(date_(value_(candidates[0], ['Hiệu lực từ', 'Từ ngày'])), date_(value_(candidates[1], ['Hiệu lực từ', 'Từ ngày']))) === 0) {
      throw new Error('Quy tắc thưởng tuyển trùng ngày hiệu lực.');
    }
    var raw = value_(candidates[0], ['Số tiền/xe', 'Số tiền', 'Mức thưởng', 'Giá trị', 'Đơn giá']);
    if (typeof raw !== 'number' || !isFinite(raw) || raw < 0) throw new Error('Mức thưởng tuyển không phải số hợp lệ.');
    return raw / 2;
  }

  function recruitmentEvidence_(records, recruiterKey, bounds, rate) {
    return records.filter(function (record) {
      return employeeKey_(value_(record, ['Người tuyển'])) === recruiterKey && clean_(value_(record, ['Điều kiện thưởng'])) === 'ĐỦ';
    }).map(function (record) {
      var start = bounds.start, end = bounds.end;
      ['Tính thưởng từ', 'Ngày vào'].forEach(function (name) { var d = date_(value_(record, [name])); if (d && compareDates_(d, start) > 0) start = d; });
      ['Dừng thưởng', 'Ngày nghỉ'].forEach(function (name) { var d = date_(value_(record, [name])); if (d && compareDates_(d, end) < 0) end = d; });
      var days = compareDates_(start, end) <= 0 ? inclusiveDays_(start, end) : 0;
      var raw = days * rate / bounds.end.getDate();
      return { employeeName: clean_(value_(record, ['Nhân sự'])), joinedDate: serialize_(value_(record, ['Ngày vào'])),
        rewardFrom: dateKey_(start), rewardTo: dateKey_(end), company: clean_(value_(record, ['Công ty'])),
        employmentPeriod: clean_(value_(record, ['Đợt'])), eligibleDays: days, rawBonus: raw, bonus: Math.round(raw / 1000) * 1000 };
    }).filter(function (row) { return row.employeeName && row.rawBonus > 0; });
  }

  function mapFinalPayroll_(record) {
    return {
      role: clean_(value_(record, ['Chức vụ'])),
      tripCount: number_(value_(record, ['Số chuyến'])),
      tripSalary: number_(value_(record, ['Lương chuyến'])),
      fixedSalaryActual: number_(value_(record, ['Lương cứng / khoán', 'Lương cứng thực', 'Lương cứng thực tính'])),
      paidLeaveDays: number_(value_(record, ['Nghỉ phép'])),
      deductedDays: number_(value_(record, ['Ngày bị trừ', 'Ngày trừ lương'])),
      reward: number_(value_(record, ['Thưởng'])),
      grossSalary: number_(value_(record, ['Tổng lương'])),
      advance: number_(value_(record, ['Ứng lương'])),
      penalty: number_(value_(record, ['Phạt'])),
      bhxh: number_(value_(record, ['BHXH'])),
      netSalary: number_(value_(record, ['Thực nhận'])),
      company: clean_(value_(record, ['Công ty'])),
      note: clean_(value_(record, ['Ghi chú']))
    };
  }

  function mapPersonnel_(record) {
    return {
      role: clean_(value_(record, ['Chức vụ'])),
      tripCount: number_(value_(record, ['Số chuyến'])),
      tripSalary: number_(value_(record, ['Lương chuyến'])),
      fixedSalary: number_(value_(record, ['Lương cứng'])),
      paidLeaveDays: number_(value_(record, ['Nghỉ phép'])),
      overLimitLeaveDays: number_(value_(record, ['Vượt phép', 'Nghỉ vượt phép'])),
      unpaidLeaveDays: number_(value_(record, ['Nghỉ trừ lương'])),
      deductedDays: number_(value_(record, ['Ngày trừ lương'])),
      fixedSalaryPerDay: number_(value_(record, ['Lương cứng/ngày'])),
      fixedSalaryActual: number_(value_(record, ['Lương cứng / khoán', 'Lương cứng thực tính', 'Lương cứng thực'])),
      reward: number_(value_(record, ['Thưởng'])),
      advance: number_(value_(record, ['Ứng lương'])),
      penalty: number_(value_(record, ['Phạt'])),
      grossSalary: number_(value_(record, ['Tổng lương'])),
      netSalary: number_(value_(record, ['Thực nhận cuối', 'Thực nhận']))
    };
  }

  function mapSalaryLine_(record) {
    var sourceRate = value_(record, ['Đơn giá']);
    return {
      vehicle: clean_(value_(record, ['Biển số xe', 'Biển số'])),
      operationsGroup: clean_(value_(record, ['Nhóm vận hành', 'Dự án'])),
      calculationType: clean_(value_(record, ['Loại tính'])),
      individualTrips: number_(value_(record, ['Cá nhân'])),
      vehicleTrips: number_(value_(record, ['Tổng xe', 'Tổng của xe'])),
      driverCount: number_(value_(record, ['Số lái tháng', 'Số lái'])),
      rate: sourceRate === '' || sourceRate === null ? null : number_(sourceRate),
      tripSalary: number_(value_(record, ['Lương chuyến'])),
      operationsKpiAdjustment: number_(value_(record, ['Trừ KPI', 'Nghỉ tính chỉ tiêu'])),
      targetAfterAdjustment: number_(value_(record, ['KPI sau nghỉ', 'Chỉ tiêu sau nghỉ'])),
      finalTripSalary: number_(value_(record, ['Lương chuyến thực', 'Lương chuyến cuối', 'Lương chuyến'])),
      kpiSource: 'NL_NghiVanHanh via XL_LuongTheoXe',
      dailyEvidenceStatus: 'not_applicable',
      rateBasis: null,
      dailyEvidence: [],
      breakdown: null,
      evidenceWarnings: []
    };
  }

  function buildSalaryLine_(record, employeeKey, month, context, bundleWarnings) {
    var line = mapSalaryLine_(record);
    if (normalizeText_(line.calculationType) !== normalizeText_('HỖN_HỢP')) return line;
    if (!context || compareDates_(context.monthStart, context.dailyEffectiveFrom) < 0) return line;

    var lineWarnings = [];
    var terminationDate = context.terminationByEmployee[employeeKey] || null;
    var vehicleTripsAfterCutoff = line.vehicleTrips;
    if (terminationDate && compareDates_(terminationDate, context.monthStart) >= 0 && compareDates_(terminationDate, context.monthEnd) <= 0) {
      vehicleTripsAfterCutoff = context.driverRows.reduce(function (total, sourceRow) {
        if (normalizeMonth_(value_(sourceRow, ['Tháng'])) !== month) return total;
        if (clean_(value_(sourceRow, ['Biển số'])) !== line.vehicle) return total;
        if (normalizeText_(normalizedOperationsGroup_(value_(sourceRow, ['Nhóm vận hành', 'Dự án']), context.projectGroupByProject)) !== normalizeText_(line.operationsGroup)) return total;
        var sourceDate = date_(value_(sourceRow, ['Ngày']));
        return sourceDate && compareDates_(sourceDate, terminationDate) <= 0
          ? total + number_(value_(sourceRow, ['Số chuyến'])) : total;
      }, 0);
    }

    var threshold = vehicleTripsAfterCutoff + line.operationsKpiAdjustment;
    var oneRateResult = selectRate_('1_LAI', line.operationsGroup, threshold, context);
    var multiRateResult = selectRate_('NHIEU_LAI', line.operationsGroup, threshold, context);
    collectRateWarnings_(oneRateResult, '1_LAI', line, lineWarnings);
    collectRateWarnings_(multiRateResult, 'NHIEU_LAI', line, lineWarnings);

    var dailyByDate = {};
    context.driverRows.forEach(function (sourceRow) {
      if (normalizeMonth_(value_(sourceRow, ['Tháng'])) !== month) return;
      if (clean_(value_(sourceRow, ['Biển số'])) !== line.vehicle) return;
      if (employeeKey_(value_(sourceRow, ['Tài xế', 'Nhân sự'])) !== employeeKey) return;
      var operationsGroup = normalizedOperationsGroup_(value_(sourceRow, ['Nhóm vận hành', 'Dự án']), context.projectGroupByProject);
      if (normalizeText_(operationsGroup) !== normalizeText_(line.operationsGroup)) return;
      var sourceDate = date_(value_(sourceRow, ['Ngày']));
      var dateKey = dateKey_(sourceDate);
      if (!dateKey) {
        addEvidenceWarning_(lineWarnings, 'DAILY_DATE_MISSING', 'Thiếu ngày hợp lệ trong NL_TaiXe.', '');
        return;
      }
      var item = dailyByDate[dateKey] || {
        date: dateKey,
        vehicle: line.vehicle,
        operationsGroup: line.operationsGroup,
        individualTrips: 0,
        sourceRowCount: 0,
        sourceCheck: 'OK'
      };
      item.individualTrips += number_(value_(sourceRow, ['Số chuyến']));
      item.sourceRowCount += 1;
      if (boolean_(value_(sourceRow, ['_SYS_DUPLICATE'])) || normalizeText_(value_(sourceRow, ['_SYS_CHECK'])) !== 'ok') {
        item.sourceCheck = clean_(value_(sourceRow, ['_SYS_CHECK'])) || 'DUPLICATE';
        addEvidenceWarning_(lineWarnings, 'DAILY_SOURCE_INVALID', 'Dòng NL_TaiXe bị trùng hoặc chưa đạt kiểm tra.', dateKey);
      }
      dailyByDate[dateKey] = item;
    });

    var dailyEvidence = Object.keys(dailyByDate).sort().map(function (dateKey) {
      var item = dailyByDate[dateKey];
      var aggregateKey = aggregateKey_(dateKey, line.vehicle, line.operationsGroup);
      var aggregateMatches = context.aggregateByKey[aggregateKey] || [];
      var aggregate = aggregateMatches.length === 1 ? aggregateMatches[0] : null;
      if (!aggregate) {
        addEvidenceWarning_(lineWarnings, aggregateMatches.length > 1 ? 'DAILY_AGGREGATE_AMBIGUOUS' : 'DAILY_AGGREGATE_MISSING',
          aggregateMatches.length > 1 ? 'Có nhiều dòng tổng hợp số lái cho cùng ngày/xe/nhóm.' : 'Thiếu dòng tổng hợp số lái cho ngày/xe/nhóm.', dateKey);
      }
      var driverCount = aggregate ? number_(value_(aggregate, ['Số lái'])) : 0;
      var calculationType = driverCount === 1 ? '1_LAI' : driverCount > 1 ? 'NHIEU_LAI' : '';
      if (!calculationType) addEvidenceWarning_(lineWarnings, 'DAILY_DRIVER_COUNT_INVALID', 'Số lái theo ngày phải lớn hơn hoặc bằng 1.', dateKey);
      var selectedRate = calculationType === '1_LAI' ? oneRateResult.rate : calculationType === 'NHIEU_LAI' ? multiRateResult.rate : null;
      if (calculationType && selectedRate === null) addEvidenceWarning_(lineWarnings, 'DAILY_RATE_MISSING', 'Không có đơn giá hợp lệ cho loại ' + calculationType + '.', dateKey);
      return {
        date: dateKey,
        vehicle: line.vehicle,
        operationsGroup: line.operationsGroup,
        individualTrips: item.individualTrips,
        vehicleTrips: aggregate ? number_(value_(aggregate, ['Tổng chuyến'])) : 0,
        driverCount: driverCount,
        calculationType: calculationType,
        rate: selectedRate,
        amount: selectedRate === null ? null : item.individualTrips * selectedRate,
        aggregateKey: aggregateKey,
        keyStatus: aggregate && calculationType ? 'matched' : 'needs_review',
        sourceRowCount: item.sourceRowCount,
        sourceCheck: item.sourceCheck
      };
    });

    if (!dailyEvidence.length) addEvidenceWarning_(lineWarnings, 'DAILY_EVIDENCE_EMPTY', 'Không có dòng NL_TaiXe để giải thích lương hỗn hợp.', '');
    var breakdown = buildDailyBreakdown_(dailyEvidence, line);
    if (!breakdown.tripCountMatched) addEvidenceWarning_(lineWarnings, 'DAILY_TRIP_TOTAL_MISMATCH', 'Tổng chuyến theo ngày lệch XL_LuongTheoXe.Cá nhân: ' + breakdown.tripDifference + '.', '');
    if (!breakdown.salaryMatched) addEvidenceWarning_(lineWarnings, 'DAILY_SALARY_TOTAL_MISMATCH', 'Tổng tiền theo ngày lệch XL_LuongTheoXe.Lương chuyến: ' + breakdown.salaryDifference + '.', '');

    line.rateBasis = {
      vehicleTripsReported: line.vehicleTrips,
      vehicleTripsAfterTerminationCutoff: vehicleTripsAfterCutoff,
      operationsKpiAdjustment: line.operationsKpiAdjustment,
      threshold: threshold,
      terminationCutoffDate: terminationDate ? dateKey_(terminationDate) : '',
      oneDriverRate: oneRateResult.rate,
      multiDriverRate: multiRateResult.rate,
      source: 'XL_LuongTheoXe + DM_NhanSu + NL_TaiXe + DM_LuongChuyen'
    };
    line.dailyEvidence = dailyEvidence;
    line.breakdown = breakdown;
    line.evidenceWarnings = lineWarnings.map(function (warning) {
      return { code: warning.code, message: warning.message, date: warning.date };
    });
    line.dailyEvidenceStatus = lineWarnings.length ? 'needs_review' : 'matched';
    lineWarnings.forEach(function (warning) {
      bundleWarnings.push('[' + warning.code + '] ' + warning.message + (warning.date ? ' (' + warning.date + ')' : ''));
    });
    return line;
  }

  function resolveDailyTripSalary(spreadsheet, targetDateKey, options) {
    var targetDate = date_(targetDateKey);
    var transportTrips = number_((options || {}).transportTrips);
    if (!targetDate) return { available: false, value: 0, matchedRows: 0, unmatchedRows: 0, reasonCounts: { INVALID_DATE: 1 } };

    var month = normalizeMonth_(targetDate);
    var driverRows = readRecords_(spreadsheet, 'NL_TaiXe', 1);
    var salaryRows = readRecords_(spreadsheet, 'XL_LuongTheoXe', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === month;
    });
    var context = createDailyContext_(month, {
      driverRows: driverRows,
      aggregateRows: readOptionalRecords_(spreadsheet, 'SYS_AggTaiXeNgay', 1),
      rateRows: readOptionalRecords_(spreadsheet, 'DM_LuongChuyen', 1),
      projectRows: readOptionalRecords_(spreadsheet, 'DM_DuAn', 1),
      employeeRows: readOptionalRecords_(spreadsheet, 'DM_NhanSu', 1),
      parameterRows: readOptionalRecords_(spreadsheet, 'DM_ThamSo', 1)
    });
    var linesByEmployeeVehicle = {};
    salaryRows.forEach(function (record) {
      var employeeKey = employeeKey_(value_(record, ['Tài xế', 'Nhân sự']));
      var line = buildSalaryLine_(record, employeeKey, month, context, []);
      var key = employeeKey + '|' + normalizeText_(line.vehicle);
      if (!employeeKey || !line.vehicle) return;
      linesByEmployeeVehicle[key] = linesByEmployeeVehicle[key] || [];
      linesByEmployeeVehicle[key].push(line);
    });

    var groups = {};
    driverRows.forEach(function (record) {
      if (normalizeMonth_(value_(record, ['Tháng'])) !== month) return;
      if (dateKey_(date_(value_(record, ['Ngày']))) !== targetDateKey) return;
      var trips = number_(value_(record, ['Số chuyến']));
      if (!trips) return;
      var employeeKey = employeeKey_(value_(record, ['Tài xế', 'Nhân sự']));
      var vehicle = clean_(value_(record, ['Biển số', 'Biển số xe']));
      var operationsGroup = normalizedOperationsGroup_(value_(record, ['Nhóm vận hành', 'Dự án']), context.projectGroupByProject);
      var key = employeeKey + '|' + normalizeText_(vehicle) + '|' + normalizeText_(operationsGroup);
      var group = groups[key] || {
        employeeKey: employeeKey,
        vehicle: vehicle,
        operationsGroup: operationsGroup,
        trips: 0,
        sourceRows: 0,
        sourceValid: true
      };
      group.trips += trips;
      group.sourceRows += 1;
      if (boolean_(value_(record, ['_SYS_DUPLICATE'])) || normalizeText_(value_(record, ['_SYS_CHECK'])) !== 'ok') group.sourceValid = false;
      groups[key] = group;
    });

    var value = 0;
    var matchedRows = 0;
    var unmatchedRows = 0;
    var reasonCounts = {};
    function reject_(group, reason) {
      unmatchedRows += group.sourceRows || 1;
      reasonCounts[reason] = (reasonCounts[reason] || 0) + (group.sourceRows || 1);
    }
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (!group.sourceValid) {
        reject_(group, 'DAILY_SOURCE_INVALID');
        return;
      }
      var baseKey = group.employeeKey + '|' + normalizeText_(group.vehicle);
      var candidates = linesByEmployeeVehicle[baseKey] || [];
      var exact = candidates.filter(function (line) {
        return normalizeText_(line.operationsGroup) && normalizeText_(line.operationsGroup) === normalizeText_(group.operationsGroup);
      });
      if (exact.length) candidates = exact;
      else candidates = candidates.filter(function (line) { return !normalizeText_(line.operationsGroup); });
      if (candidates.length !== 1) {
        reject_(group, candidates.length ? 'SALARY_LINE_AMBIGUOUS' : 'SALARY_LINE_MISSING');
        return;
      }

      var line = candidates[0];
      var mixed = normalizeText_(line.calculationType) === normalizeText_('HỖN_HỢP');
      var rate = line.rate;
      if (mixed) {
        var dailyMatches = line.dailyEvidence.filter(function (item) { return item.date === targetDateKey; });
        var daily = dailyMatches.length === 1 ? dailyMatches[0] : null;
        var evidenceMatched = line.dailyEvidenceStatus === 'matched' && daily && daily.keyStatus === 'matched' && normalizeText_(daily.sourceCheck) === 'ok';
        var tripsMatched = daily && Math.abs(number_(daily.individualTrips) - group.trips) <= TOLERANCE;
        rate = daily ? daily.rate : null;
        if (!evidenceMatched || !tripsMatched || !(rate > 0)) {
          reject_(group, !daily ? 'DAILY_EVIDENCE_MISSING' : !tripsMatched ? 'DAILY_TRIPS_MISMATCH' : 'DAILY_EVIDENCE_INVALID');
          return;
        }
      } else if (!(rate > 0) && line.individualTrips > 0) {
        rate = line.finalTripSalary / line.individualTrips;
      }
      if (!(rate > 0) || !isFinite(rate)) {
        reject_(group, 'DAILY_RATE_MISSING');
        return;
      }
      matchedRows += group.sourceRows;
      value += group.trips * rate;
    });

    if (!Object.keys(groups).length && transportTrips > 0) reasonCounts.DAILY_SOURCE_EMPTY = 1;
    var available = unmatchedRows === 0 && (matchedRows > 0 || !(transportTrips > 0));
    return { available: available, value: value, matchedRows: matchedRows, unmatchedRows: unmatchedRows, reasonCounts: reasonCounts };
  }

  function resolveDailyDriverLabor(spreadsheet, targetDateKey, options) {
    var targetDate = date_(targetDateKey);
    if (!targetDate) {
      return {
        available: false, value: 0, tripSalary: 0, fixedSalary: 0, recruitmentBonus: 0,
        matchedRows: 0, unmatchedRows: 0, reasonCounts: { INVALID_DATE: 1 }
      };
    }

    var trip = resolveDailyTripSalary(spreadsheet, targetDateKey, options);
    var month = normalizeMonth_(targetDate);
    var personnelRows = readRecords_(spreadsheet, 'XL_LuongNhanSu', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === month
        && normalizeText_(value_(record, ['Chức vụ'])) === normalizeText_('Tài xế');
    });
    var attendanceRows = readRecords_(spreadsheet, 'NL_ChamCong', 1).filter(function (record) {
      return normalizeMonth_(value_(record, ['Tháng'])) === month;
    });
    var employeeRows = readRecords_(spreadsheet, 'DM_LichSuNhanSu', 1);
    var recruitmentRules = readRecords_(spreadsheet, 'DM_ThuongQuanLy', 1);
    var reasonCounts = {};
    Object.keys(trip.reasonCounts || {}).forEach(function (reason) { reasonCounts[reason] = trip.reasonCounts[reason]; });
    function reject_(reason, count) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + (count || 1);
    }

    var personnelByEmployee = {};
    personnelRows.forEach(function (record) {
      var key = employeeKey_(value_(record, ['Nhân sự', 'Tài xế']));
      if (!key) return;
      personnelByEmployee[key] = personnelByEmployee[key] || [];
      personnelByEmployee[key].push(record);
    });

    var activeDriverKeys = {};
    var fixedSalary = 0;
    var fixedMatchedRows = 0;
    var fixedUnmatchedRows = 0;
    Object.keys(personnelByEmployee).forEach(function (employeeKey) {
      var records = personnelByEmployee[employeeKey];
      if (records.length !== 1) {
        fixedUnmatchedRows += records.length;
        reject_('PERSONNEL_ROW_AMBIGUOUS', records.length);
        return;
      }
      var record = records[0];
      var joinedDate = date_(value_(record, ['Ngày vào', 'Ngày vào làm']));
      var terminationDate = date_(value_(record, ['Ngày nghỉ', 'Ngày nghỉ việc']));
      if (joinedDate && compareDates_(targetDate, joinedDate) < 0) return;
      if (terminationDate && compareDates_(targetDate, terminationDate) > 0) return;
      activeDriverKeys[employeeKey] = true;

      var overlappingAttendance = attendanceRows.filter(function (attendance) {
        if (employeeKey_(value_(attendance, ['Nhân sự', 'Tài xế'])) !== employeeKey) return false;
        var fromDate = date_(value_(attendance, ['Từ ngày']));
        var toDate = date_(value_(attendance, ['Đến ngày'])) || fromDate;
        return fromDate && compareDates_(targetDate, fromDate) >= 0 && compareDates_(targetDate, toDate) <= 0;
      });
      var treatments = {};
      overlappingAttendance.forEach(function (attendance) {
        var treatment = normalizeText_(value_(attendance, ['Tính lương cứng']));
        if (treatment) treatments[treatment] = true;
      });
      if (Object.keys(treatments).length > 1 || overlappingAttendance.some(function (attendance) {
        var treatment = normalizeText_(value_(attendance, ['Tính lương cứng']));
        return treatment !== 'co' && treatment !== 'khong';
      })) {
        fixedUnmatchedRows += 1;
        reject_('ATTENDANCE_TREATMENT_AMBIGUOUS', 1);
        return;
      }
      if (treatments.khong) {
        fixedMatchedRows += 1;
        return;
      }

      var dailyRate = number_(value_(record, ['Lương cứng/ngày']));
      var fixedMonthly = number_(value_(record, ['Lương cứng']));
      var fixedActual = number_(value_(record, ['Lương cứng / khoán', 'Lương cứng thực tính', 'Lương cứng thực']));
      if (!(dailyRate > 0) && (fixedMonthly > 0 || fixedActual > 0)) {
        fixedUnmatchedRows += 1;
        reject_('FIXED_DAILY_RATE_MISSING', 1);
        return;
      }
      fixedSalary += dailyRate > 0 ? dailyRate : 0;
      fixedMatchedRows += 1;
    });

    var recruitmentBonus = 0;
    var recruitmentMatchedRows = 0;
    var bounds = monthBounds_(month);
    var rate = recruitmentRate_(recruitmentRules, bounds.start);
    Object.keys(activeDriverKeys).forEach(function (recruiterKey) {
      recruitmentEvidence_(employeeRows, recruiterKey, bounds, rate).forEach(function (evidence) {
        if (targetDateKey < evidence.rewardFrom || targetDateKey > evidence.rewardTo) return;
        recruitmentBonus += rate / bounds.end.getDate();
        recruitmentMatchedRows += 1;
      });
    });

    var fixedAvailable = fixedUnmatchedRows === 0;
    var available = trip.available === true && fixedAvailable;
    return {
      available: available,
      value: available ? trip.value + fixedSalary + recruitmentBonus : 0,
      tripSalary: trip.value,
      fixedSalary: fixedSalary,
      recruitmentBonus: recruitmentBonus,
      matchedRows: (trip.matchedRows || 0) + fixedMatchedRows + recruitmentMatchedRows,
      unmatchedRows: (trip.unmatchedRows || 0) + fixedUnmatchedRows,
      reasonCounts: reasonCounts
    };
  }

  function buildDailyBreakdown_(dailyEvidence, line) {
    var one = dailyEvidence.filter(function (item) { return item.calculationType === '1_LAI'; });
    var multi = dailyEvidence.filter(function (item) { return item.calculationType === 'NHIEU_LAI'; });
    var sumTrips = function (items) { return items.reduce(function (total, item) { return total + item.individualTrips; }, 0); };
    var sumAmount = function (items) {
      return items.reduce(function (total, item) { return item.amount === null ? total : total + item.amount; }, 0);
    };
    var oneTrips = sumTrips(one);
    var multiTrips = sumTrips(multi);
    var totalTrips = dailyEvidence.reduce(function (total, item) { return total + item.individualTrips; }, 0);
    var oneSalary = sumAmount(one);
    var multiSalary = sumAmount(multi);
    var totalSalary = oneSalary + multiSalary;
    var tripDifference = totalTrips - line.individualTrips;
    var salaryDifference = totalSalary - line.tripSalary;
    return {
      oneDriver: { days: one.length, trips: oneTrips, rate: commonRate_(one), salary: oneSalary },
      multiDriver: { days: multi.length, trips: multiTrips, rate: commonRate_(multi), salary: multiSalary },
      totalTrips: totalTrips,
      reportedTrips: line.individualTrips,
      tripDifference: tripDifference,
      tripCountMatched: Math.abs(tripDifference) <= TOLERANCE,
      totalSalary: totalSalary,
      authoritativeTripSalary: line.tripSalary,
      salaryDifference: salaryDifference,
      salaryMatched: dailyEvidence.every(function (item) { return item.amount !== null; }) && Math.abs(salaryDifference) <= TOLERANCE
    };
  }

  function commonRate_(items) {
    if (!items.length) return null;
    var rate = items[0].rate;
    return items.every(function (item) { return item.rate === rate; }) ? rate : null;
  }

  function collectRateWarnings_(result, type, line, warnings) {
    if (result.rate === null) addEvidenceWarning_(warnings, 'RATE_MISSING', 'Thiếu đơn giá ' + type + ' cho ' + line.operationsGroup + '.', '');
    if (result.ambiguous) addEvidenceWarning_(warnings, 'RATE_AMBIGUOUS', 'Có nhiều đơn giá ' + type + ' cùng bậc và hiệu lực.', '');
    if (result.outsideDeclaredUpperBound) addEvidenceWarning_(warnings, 'RATE_RANGE_GAP', 'Ngưỡng đơn giá vượt cột Đến của bậc ' + type + ' được workbook chọn.', '');
  }

  function selectRate_(type, operationsGroup, threshold, context) {
    var candidates = context.rateRows.filter(function (record) {
      var effectiveFrom = date_(value_(record, ['Hiệu lực từ']));
      var effectiveTo = date_(value_(record, ['Hiệu lực đến']));
      return normalizeText_(value_(record, ['Mã loại tính'])) === normalizeText_(type)
        && normalizeText_(value_(record, ['Nhóm vận hành'])) === normalizeText_(operationsGroup)
        && number_(value_(record, ['Từ'])) <= threshold
        && (!effectiveFrom || compareDates_(effectiveFrom, context.monthEnd) <= 0)
        && (!effectiveTo || compareDates_(effectiveTo, context.monthStart) >= 0);
    }).sort(function (left, right) {
      return number_(value_(right, ['Từ'])) - number_(value_(left, ['Từ']));
    });
    if (!candidates.length) return { rate: null, ambiguous: false, outsideDeclaredUpperBound: false };
    var selected = candidates[0];
    var selectedFrom = number_(value_(selected, ['Từ']));
    var tied = candidates.filter(function (record) { return number_(value_(record, ['Từ'])) === selectedFrom; });
    var declaredUpperBound = value_(selected, ['Đến', 'Đến ']);
    return {
      rate: number_(value_(selected, ['Đơn giá'])),
      ambiguous: tied.length > 1,
      outsideDeclaredUpperBound: declaredUpperBound !== '' && threshold > number_(declaredUpperBound)
    };
  }

  function addEvidenceWarning_(warnings, code, message, dateValue) {
    var key = code + '|' + (dateValue || '') + '|' + message;
    if (warnings.some(function (item) { return item._key === key; })) return;
    warnings.push({ _key: key, code: code, message: message, date: dateValue || '' });
  }

  function createDailyContext_(month, input) {
    var bounds = monthBounds_(month);
    var projectGroupByProject = {};
    input.projectRows.forEach(function (record) {
      var project = normalizeText_(value_(record, ['Dự Án', 'Dự án']));
      if (project) projectGroupByProject[project] = clean_(value_(record, ['Nhóm vận hành'])) || clean_(value_(record, ['Dự Án', 'Dự án']));
    });
    var aggregateByKey = {};
    input.aggregateRows.forEach(function (record) {
      var key = aggregateKey_(dateKey_(date_(value_(record, ['Ngày']))), value_(record, ['Biển số']), value_(record, ['Nhóm vận hành']));
      if (!key) return;
      aggregateByKey[key] = aggregateByKey[key] || [];
      aggregateByKey[key].push(record);
    });
    var terminationByEmployee = {};
    input.employeeRows.forEach(function (record) {
      var key = employeeKey_(value_(record, ['Nhân sự', 'Tài xế']));
      var termination = date_(value_(record, ['Ngày nghỉ', 'Ngày nghỉ việc']));
      if (key && termination) terminationByEmployee[key] = termination;
    });
    var effectiveValue = '';
    input.parameterRows.some(function (record) {
      if (normalizeText_(value_(record, ['Mã tham số'])) !== normalizeText_('NGAY_BAT_DAU_LOAI_LAI_THEO_NGAY')) return false;
      effectiveValue = value_(record, ['Giá trị']);
      return true;
    });
    return {
      monthStart: bounds.start,
      monthEnd: bounds.end,
      dailyEffectiveFrom: date_(effectiveValue) || new Date(2026, 8, 1),
      driverRows: input.driverRows,
      rateRows: input.rateRows,
      projectGroupByProject: projectGroupByProject,
      aggregateByKey: aggregateByKey,
      terminationByEmployee: terminationByEmployee
    };
  }

  function normalizedOperationsGroup_(value, projectGroupByProject) {
    var raw = clean_(value);
    return projectGroupByProject[normalizeText_(raw)] || raw;
  }

  function aggregateKey_(dateValue, vehicle, operationsGroup) {
    if (!dateValue) return '';
    return dateValue + '|' + normalizeText_(vehicle) + '|' + normalizeText_(operationsGroup);
  }

  function mapAttendance_(record) {
    return {
      fromDate: serialize_(value_(record, ['Từ ngày'])),
      toDate: serialize_(value_(record, ['Đến ngày'])),
      attendanceType: clean_(value_(record, ['Hình thức'])),
      days: number_(value_(record, ['Số ngày'])),
      fixedSalaryTreatment: clean_(value_(record, ['Tính lương cứng'])),
      processingGroup: clean_(value_(record, ['Nhóm xử lý'])),
      validDayType: clean_(value_(record, ['Loại ngày công hợp lệ'])),
      warning: clean_(value_(record, ['Lưu ý'])),
      note: clean_(value_(record, ['Ghi chú'])),
      sourceSheet: 'NL_ChamCong'
    };
  }

  function compare_(items, warnings, field, calculated, reported, calculatedSource, reportedSource) {
    var difference = number_(calculated) - number_(reported);
    var matched = Math.abs(difference) <= TOLERANCE;
    items.push({
      field: field,
      calculated: number_(calculated),
      reported: number_(reported),
      difference: difference,
      matched: matched,
      calculatedSource: calculatedSource,
      reportedSource: reportedSource
    });
    if (!matched) warnings.push('Sai lệch ' + field + ': ' + difference + '.');
  }

  function readRecords_(spreadsheet, sheetName, headerRow) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error('Không tìm thấy sheet ' + sheetName + '.');
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    if (lastRow < headerRow || lastColumn < 1) return [];
    var matrix = sheet.getRange(headerRow, 1, lastRow - headerRow + 1, lastColumn).getValues();
    if (!matrix.length) return [];
    matrix.slice(1).forEach(function (row, index) { row.forEach(function (cell) {
      if (typeof cell === 'string' && /^#(?:REF!|VALUE!|N\/A|DIV\/0!|NUM!|NAME\?|ERROR!)/.test(cell)) throw new Error(sheetName + ' dòng ' + (headerRow + index + 1) + ': lỗi công thức ' + cell);
    }); });
    var headers = matrix[0].map(normalizeHeader_);
    return matrix.slice(1).filter(function (row) {
      return row.some(function (cell) { return clean_(cell); });
    }).map(function (row) {
      var record = {};
      headers.forEach(function (header, index) {
        if (header && record[header] === undefined) record[header] = row[index];
      });
      return record;
    });
  }

  function readOptionalRecords_(spreadsheet, sheetName, headerRow) {
    return spreadsheet.getSheetByName(sheetName) ? readRecords_(spreadsheet, sheetName, headerRow) : [];
  }

  function value_(record, aliases) {
    for (var index = 0; index < aliases.length; index += 1) {
      var key = normalizeHeader_(aliases[index]);
      if (record && record[key] !== undefined) return record[key];
    }
    return '';
  }

  function matchingEmployeeRows_(records, key) {
    return records.filter(function (record) {
      return employeeKey_(value_(record, ['Nhân sự', 'Tài xế'])) === key;
    });
  }

  function collisionKeys_(records) {
    var namesByKey = {};
    records.forEach(function (record) {
      var name = clean_(value_(record, ['Nhân sự']));
      var key = employeeKey_(name);
      if (!key) return;
      namesByKey[key] = namesByKey[key] || {};
      namesByKey[key][name] = true;
    });
    var collisions = {};
    Object.keys(namesByKey).forEach(function (key) {
      if (Object.keys(namesByKey[key]).length > 1) collisions[key] = true;
    });
    return collisions;
  }

  function employeeKey_(value) {
    return normalizeText_(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
  }

  function normalizeHeader_(value) {
    return normalizeText_(value).replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeText_(value) {
    var text = clean_(value).toLowerCase().replace(/đ/g, 'd');
    if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text;
  }

  function normalizeMonth_(value) {
    if (typeof value === 'number') {
      var serialDate = sheetSerialDate_(value);
      return serialDate ? ('0' + (serialDate.getMonth() + 1)).slice(-2) + '/' + serialDate.getFullYear() : '';
    }
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return ('0' + (value.getMonth() + 1)).slice(-2) + '/' + value.getFullYear();
    }
    var text = clean_(value);
    var match = text.match(/^(\d{1,2})[\/-](20\d{2})$/);
    if (match) return ('0' + Number(match[1])).slice(-2) + '/' + match[2];
    var iso = text.match(/^(20\d{2})-(\d{1,2})/);
    return iso ? ('0' + Number(iso[2])).slice(-2) + '/' + iso[1] : '';
  }

  function number_(value) {
    if (typeof value === 'number') { if (!isFinite(value)) throw new Error('Số liệu không hữu hạn.'); return value; }
    var text = clean_(value).replace(/\s/g, '');
    if (!text) return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+(,\d+)$/.test(text)) text = text.replace(',', '.');
    else text = text.replace(/,/g, '');
    var parsed = Number(text);
    if (!isFinite(parsed)) throw new Error('Số liệu không hợp lệ: ' + clean_(value));
    return parsed;
  }

  function boolean_(value) {
    if (value === true) return true;
    return normalizeText_(value) === 'true' || clean_(value) === '1';
  }

  function date_(value) {
    if (typeof value === 'number') return sheetSerialDate_(value);
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var text = clean_(value);
    var local = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})$/);
    if (local) return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
    var iso = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return null;
  }

  function sheetSerialDate_(value) {
    // Unformatted formula outputs (including SYS_AggThuongTuyen!Tháng)
    // expose Sheets serial numbers. Build local calendar parts from UTC so
    // the spreadsheet day does not move with the runtime timezone.
    if (!isFinite(value) || value < 36526 || value >= 73416) return null;
    var utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }

  function monthBounds_(month) {
    var parts = month.split('/').map(Number);
    return {
      start: new Date(parts[1], parts[0] - 1, 1),
      end: new Date(parts[1], parts[0], 0)
    };
  }

  function compareDates_(left, right) {
    return dateNumber_(left) - dateNumber_(right);
  }

  function inclusiveDays_(fromDate, toDate) {
    return Math.floor((dateNumber_(toDate) - dateNumber_(fromDate)) / 86400000) + 1;
  }

  function dateNumber_(value) {
    return value ? new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime() : 0;
  }

  function dateKey_(value) {
    if (!value) return '';
    return value.getFullYear() + '-' + ('0' + (value.getMonth() + 1)).slice(-2) + '-' + ('0' + value.getDate()).slice(-2);
  }

  function serialize_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value.toISOString();
    return clean_(value);
  }

  function isTotalEmployee_(value) {
    var normalized = normalizeText_(value);
    return !normalized || normalized === 'tong cong' || normalized === 'tong';
  }

  function unique_(values) {
    var seen = {};
    return values.filter(function (value) {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function clean_(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  return {
    buildMonth: buildMonth,
    resolveDailyTripSalary: resolveDailyTripSalary,
    resolveDailyDriverLabor: resolveDailyDriverLabor,
    employeeKey: employeeKey_,
    normalizeMonth: normalizeMonth_,
    getContractVersion: function () { return CONTRACT_VERSION; }
  };
})();
