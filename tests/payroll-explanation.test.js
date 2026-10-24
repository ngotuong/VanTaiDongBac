const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/payroll-explanation-mixed-salary.json'));
const plain = (value) => JSON.parse(JSON.stringify(value));

class FakeSheet {
  constructor(definition) {
    this.definition = definition;
    this.matrix = Array.from({ length: definition.headerRow - 1 }, () => []);
    this.matrix.push(definition.headers, ...definition.rows);
  }
  getLastRow() { return this.matrix.length; }
  getLastColumn() { return this.definition.headers.length; }
  getRange(row, column, rowCount, columnCount) {
    const values = Array.from({ length: rowCount }, (_, rowOffset) =>
      Array.from({ length: columnCount }, (_, columnOffset) => this.matrix[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''));
    return { getValues: () => values };
  }
}

function loadDomain(customFixture = fixture) {
  const requestedSheets = [];
  const sheets = Object.fromEntries(Object.entries(customFixture.sheets).map(([name, definition]) => [name, new FakeSheet(definition)]));
  const sandbox = vm.createContext({ Date });
  new vm.Script(read('PayrollExplanationService.gs'), { filename: 'PayrollExplanationService.gs#test' }).runInContext(sandbox);
  return {
    service: sandbox.PayrollExplanationService,
    spreadsheet: {
      getSheetByName(name) {
        requestedSheets.push(name);
        return sheets[name] || null;
      }
    },
    requestedSheets
  };
}

function qualifyHistory(input) {
  const sheet = input.sheets.DM_LichSuNhanSu;
  if (sheet && !sheet.headers.includes('Điều kiện thưởng')) {
    sheet.headers.push('Điều kiện thưởng');
    sheet.rows.forEach((row) => row.push('ĐỦ'));
  }
}
function recruitmentTotal(input, recruiter, total) {
  input.sheets.SYS_AggThuongTuyen = { headerRow: 1, headers: ['Tháng', 'Người tuyển', 'Thưởng tuyển'], rows: [[input.month, recruiter, total]] };
}

function dailySalaryFixture() {
  return {
    sheets: {
      NL_TaiXe: {
        headerRow: 1,
        headers: ['Ngày', 'Tháng', 'Biển số', 'Nhóm vận hành', 'Tài xế', 'Số chuyến', 'Ghi chú', '_SYS_DUPLICATE', '_SYS_CHECK'],
        rows: [
          ['25/09/2026', '09/2026', '20H-001', 'Tràng Duệ', 'Chu Đức Mười', 3, '', false, 'OK'],
          ['25/09/2026', '09/2026', '20H-002', 'Tràng Duệ', 'Bình', 2, '', false, 'OK']
        ]
      },
      XL_LuongTheoXe: {
        headerRow: 1,
        headers: ['Tháng', 'Tài xế', 'Biển số', 'Nhóm vận hành', 'Cá nhân', 'Tổng xe', 'Số lái tháng', 'Loại tính', 'Đơn giá', 'Lương chuyến', 'Trừ KPI', 'KPI sau nghỉ', 'Lương chuyến thực'],
        rows: [
          ['09/2026', 'Chu Đức Mười', '20H-001', 'Tràng Duệ', 3, 50, 1, 'HỖN_HỢP', '', 750000, 0, 50, 750000],
          ['09/2026', 'Bình', '20H-002', '', 10, 40, 1, '1_LAI', 300000, 3000000, 0, 40, 3000000]
        ]
      },
      SYS_AggTaiXeNgay: {
        headerRow: 1,
        headers: ['Ngày', 'Tháng', 'Biển số', 'Nhóm vận hành', 'Tổng chuyến', 'Số lái', 'Key'],
        rows: [['25/09/2026', '09/2026', '20H-001', 'Tràng Duệ', 3, 1, '2026-09-25|20H-001|Tràng Duệ']]
      },
      DM_LuongChuyen: {
        headerRow: 1,
        headers: ['Mã loại tính', 'Diễn giải', 'Từ', 'Đến ', 'Đơn giá', 'Hiệu lực từ', 'Hiệu lực đến', 'Nhóm vận hành'],
        rows: [
          ['1_LAI', 'Một lái', 0, 999, 250000, '01/05/2026', '', 'Tràng Duệ'],
          ['NHIEU_LAI', 'Nhiều lái', 0, 999, 200000, '01/05/2026', '', 'Tràng Duệ']
        ]
      },
      DM_DuAn: { headerRow: 1, headers: ['Dự Án', 'Nhóm vận hành'], rows: [['Tràng Duệ', 'Tràng Duệ']] },
      DM_NhanSu: { headerRow: 1, headers: ['Nhân sự', 'Ngày nghỉ'], rows: [['Chu Đức Mười', ''], ['Bình', '']] },
      DM_LichSuNhanSu: { headerRow: 1, headers: ['Nhân sự', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng', 'Ngày vào', 'Ngày nghỉ', 'Điều kiện thưởng'], rows: [] },
      SYS_AggThuongTuyen: { headerRow: 1, headers: ['Tháng', 'Người tuyển', 'Thưởng tuyển'], rows: [] },
      DM_ThuongQuanLy: { headerRow: 1, headers: ['Mã thưởng', 'Số tiền/xe', 'Hiệu lực từ'], rows: [['TUYEN_DU_2_LAI', 2000000, '01/01/2026']] },
      DM_ThamSo: { headerRow: 1, headers: ['Mã tham số', 'Giá trị'], rows: [['NGAY_BAT_DAU_LOAI_LAI_THEO_NGAY', '01/08/2026']] }
    }
  };
}

test('daily salary resolver combines authoritative mixed evidence and direct rates', () => {
  const { service, spreadsheet } = loadDomain(dailySalaryFixture());
  const result = plain(service.resolveDailyTripSalary(spreadsheet, '2026-09-25', { transportTrips: 5 }));
  assert.deepEqual(result, {
    available: true,
    value: 1350000,
    matchedRows: 2,
    unmatchedRows: 0,
    reasonCounts: {}
  });
});

test('daily driver labor combines trip pay, fixed daily pay and dated recruitment accrual', () => {
  const changed = dailySalaryFixture();
  changed.sheets.XL_LuongNhanSu = {
    headerRow: 1,
    headers: ['Tháng', 'Nhân sự', 'Chức vụ', 'Lương cứng', 'Ngày vào', 'Ngày nghỉ', 'Lương cứng/ngày', 'Lương cứng / khoán', 'Thưởng'],
    rows: [
      ['09/2026', 'Chu Đức Mười', 'Tài xế', 10000000, '01/01/2026', '', 333333, 10000000, 500000],
      ['09/2026', 'Bình', 'Tài xế', 0, '01/01/2026', '', 0, 0, 0]
    ]
  };
  changed.sheets.NL_ChamCong = {
    headerRow: 1,
    headers: ['Từ ngày', 'Đến ngày', 'Tháng', 'Nhân sự', 'Hình thức', 'Tính lương cứng'],
    rows: [['25/09/2026', '25/09/2026', '09/2026', 'Chu Đức Mười', 'Nghỉ phép', 'Có']]
  };
  changed.sheets.DM_LichSuNhanSu = {
    headerRow: 1,
    headers: ['Nhân sự', 'Ngày nghỉ', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng'],
    rows: [
      ['Chu Đức Mười', '', '', '', ''],
      ['Bình', '', '', '', ''],
      ['Tài xế mới', '', 'Chu Đức Mười', '10/09/2026', '09/10/2026']
    ]
  };
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const result = plain(service.resolveDailyDriverLabor(spreadsheet, '2026-09-25', { transportTrips: 5 }));
  assert.equal(result.available, true);
  assert.equal(result.tripSalary, 1350000);
  assert.equal(result.fixedSalary, 333333);
  assert.ok(Math.abs(result.recruitmentBonus - (1000000 / 30)) < 0.001);
  assert.ok(Math.abs(result.value - (1350000 + 333333 + 1000000 / 30)) < 0.001);
  assert.equal(result.unmatchedRows, 0);
});

test('daily driver labor excludes fixed pay on unpaid leave and fails closed without a required daily rate', () => {
  const changed = dailySalaryFixture();
  changed.sheets.XL_LuongNhanSu = {
    headerRow: 1,
    headers: ['Tháng', 'Nhân sự', 'Chức vụ', 'Lương cứng', 'Ngày vào', 'Ngày nghỉ', 'Lương cứng/ngày', 'Lương cứng / khoán'],
    rows: [
      ['09/2026', 'Chu Đức Mười', 'Tài xế', 10000000, '01/01/2026', '', 333333, 10000000],
      ['09/2026', 'Bình', 'Tài xế', 9000000, '01/01/2026', '', '', 9000000]
    ]
  };
  changed.sheets.NL_ChamCong = {
    headerRow: 1,
    headers: ['Từ ngày', 'Đến ngày', 'Tháng', 'Nhân sự', 'Hình thức', 'Tính lương cứng'],
    rows: [['25/09/2026', '25/09/2026', '09/2026', 'Chu Đức Mười', 'Nghỉ không lương', 'Không']]
  };
  changed.sheets.DM_LichSuNhanSu = { headerRow: 1, headers: ['Nhân sự', 'Ngày nghỉ', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng'], rows: [] };
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const result = plain(service.resolveDailyDriverLabor(spreadsheet, '2026-09-25', { transportTrips: 5 }));
  assert.equal(result.available, false);
  assert.equal(result.fixedSalary, 0);
  assert.equal(result.value, 0);
  assert.equal(result.reasonCounts.FIXED_DAILY_RATE_MISSING, 1);
});

test('daily salary resolver fails closed when mixed daily evidence is incomplete', () => {
  const changed = dailySalaryFixture();
  changed.sheets.SYS_AggTaiXeNgay.rows = [];
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const result = plain(service.resolveDailyTripSalary(spreadsheet, '2026-09-25', { transportTrips: 5 }));
  assert.equal(result.available, false);
  assert.equal(result.value, 600000);
  assert.equal(result.matchedRows, 1);
  assert.equal(result.unmatchedRows, 1);
  assert.equal(result.reasonCounts.DAILY_EVIDENCE_INVALID, 1);
});

test('mixed one-driver and multi-driver salary reconciles to authoritative payroll', () => {
  const { service, spreadsheet } = loadDomain();
  const bundles = plain(service.buildMonth(spreadsheet, fixture.month, {
    syncedAt: '2026-09-23T02:00:00.000Z', sourceDataVersion: 'report-v1'
  }));
  assert.equal(bundles.length, 1);
  const bundle = bundles[0];
  assert.equal(bundle.employeeKey, 'chu-duc-muoi');
  assert.equal(bundle.status, 'matched');
  assert.deepEqual(bundle.salaryLines.map((line) => line.calculationType), ['1_LAI', 'NHIEU_LAI']);
  assert.equal(bundle.salaryLines.reduce((sum, line) => sum + line.finalTripSalary, 0), 4500000);
  assert.equal(bundle.finalPayroll.fixedSalaryActual, 10000000);
  assert.equal(bundle.personnelCalculation.fixedSalaryActual, 10000000);
  assert.equal(bundle.salaryLines[1].vehicle, '20H-00002');
  assert.equal(bundle.salaryLines[1].vehicleTrips, 40);
  assert.equal(bundle.salaryLines[1].driverCount, 2);
  assert.equal(bundle.salaryLines[1].targetAfterAdjustment, 48);
  assert.equal(bundle.reconciliation.every((item) => item.matched), true);
  assert.equal(bundle.finalPayroll.netSalary, 9255000);
  assert.equal(bundle.finalPayroll.bhxh, 745000);
  const netSalary = bundle.reconciliation.find((item) => item.field === 'netSalary');
  assert.equal(netSalary.calculated, 9255000);
  assert.equal(netSalary.reported, 9255000);
  assert.equal(netSalary.matched, true);
});

test('mixed source without daily evidence fails closed instead of inferring a split', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.sheets.XL_LuongTheoXe.rows = [
    ['09/2026', 'Chu Đức Mười', '20H-00001', 20, 40, 2, 'HỖN_HỢP', '', 4500000, 2, 48, 4500000]
  ];
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.equal(bundle.status, 'needs_review');
  assert.equal(bundle.salaryLines[0].rate, null);
  assert.equal(bundle.salaryLines[0].finalTripSalary, 4500000);
  assert.equal(bundle.salaryLines[0].dailyEvidenceStatus, 'needs_review');
  assert.ok(bundle.salaryLines[0].evidenceWarnings.some((item) => item.code === 'DAILY_EVIDENCE_EMPTY'));
});

test('Step D-B builds daily evidence, rate basis and a matched mixed breakdown', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.sheets.XL_LuongTheoXe.headers = ['Tháng', 'Tài xế', 'Biển số', 'Nhóm vận hành', 'Cá nhân', 'Tổng xe', 'Số lái tháng', 'Loại tính', 'Đơn giá', 'Lương chuyến', 'Trừ KPI', 'KPI sau nghỉ', 'Lương chuyến thực'];
  changed.sheets.XL_LuongTheoXe.rows = [
    ['09/2026', 'Chu Đức Mười', '20H-00001', 'Tràng Duệ', 20, 40, 2, 'HỖN_HỢP', '', 4500000, 2, 48, 4500000]
  ];
  changed.sheets.NL_TaiXe = {
    headerRow: 1,
    headers: ['Ngày', 'Tháng', 'Biển số', 'Nhóm vận hành', 'Tài xế', 'Số chuyến', 'Ghi chú', '_SYS_DUPLICATE', '_SYS_CHECK'],
    rows: [
      ['01/09/2026', '09/2026', '20H-00001', 'Tràng Duệ', 'Chu Đức Mười', 10, '', false, 'OK'],
      ['02/09/2026', '09/2026', '20H-00001', 'Tràng Duệ', 'Chu Đức Mười', 10, '', false, 'OK'],
      ['02/09/2026', '09/2026', '20H-00001', 'Tràng Duệ', 'Tài xế phụ', 10, '', false, 'OK']
    ]
  };
  changed.sheets.SYS_AggTaiXeNgay = {
    headerRow: 1,
    headers: ['Ngày', 'Tháng', 'Biển số', 'Nhóm vận hành', 'Tổng chuyến', 'Số lái', 'Key'],
    rows: [
      ['01/09/2026', '09/2026', '20H-00001', 'Tràng Duệ', 10, 1, '2026-09-01|20H-00001|Tràng Duệ'],
      ['02/09/2026', '09/2026', '20H-00001', 'Tràng Duệ', 20, 2, '2026-09-02|20H-00001|Tràng Duệ']
    ]
  };
  changed.sheets.DM_LuongChuyen = {
    headerRow: 1,
    headers: ['Mã loại tính', 'Diễn giải', 'Từ', 'Đến ', 'Đơn giá', 'Hiệu lực từ', 'Hiệu lực đến', 'Nhóm vận hành'],
    rows: [
      ['1_LAI', 'Một lái', 0, 999, 250000, '01/05/2026', '', 'Tràng Duệ'],
      ['NHIEU_LAI', 'Nhiều lái', 0, 999, 200000, '01/05/2026', '', 'Tràng Duệ']
    ]
  };
  changed.sheets.DM_DuAn = { headerRow: 1, headers: ['Dự Án', 'Nhóm vận hành'], rows: [['Tràng Duệ', 'Tràng Duệ']] };
  changed.sheets.DM_NhanSu = { headerRow: 1, headers: ['Nhân sự', 'Ngày nghỉ'], rows: [['Chu Đức Mười', '']] };
  changed.sheets.DM_ThamSo = { headerRow: 1, headers: ['Mã tham số', 'Giá trị'], rows: [['NGAY_BAT_DAU_LOAI_LAI_THEO_NGAY', '01/08/2026']] };

  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  const line = bundle.salaryLines[0];
  assert.equal(bundle.status, 'matched');
  assert.equal(line.dailyEvidenceStatus, 'matched');
  assert.equal(line.rateBasis.threshold, 42);
  assert.equal(line.rateBasis.oneDriverRate, 250000);
  assert.equal(line.rateBasis.multiDriverRate, 200000);
  assert.deepEqual(line.dailyEvidence.map((item) => [item.date, item.calculationType, item.individualTrips, item.amount]), [
    ['2026-09-01', '1_LAI', 10, 2500000],
    ['2026-09-02', 'NHIEU_LAI', 10, 2000000]
  ]);
  assert.deepEqual(line.breakdown.oneDriver, { days: 1, trips: 10, rate: 250000, salary: 2500000 });
  assert.deepEqual(line.breakdown.multiDriver, { days: 1, trips: 10, rate: 200000, salary: 2000000 });
  assert.equal(line.breakdown.salaryMatched, true);
  assert.equal(line.breakdown.tripCountMatched, true);

  const missingAggregate = JSON.parse(JSON.stringify(changed));
  missingAggregate.sheets.SYS_AggTaiXeNgay.rows.pop();
  const missingAggregateDomain = loadDomain(missingAggregate);
  const [aggregateFailure] = plain(missingAggregateDomain.service.buildMonth(missingAggregateDomain.spreadsheet, fixture.month, {}));
  assert.equal(aggregateFailure.status, 'needs_review');
  assert.ok(aggregateFailure.salaryLines[0].evidenceWarnings.some((item) => item.code === 'DAILY_AGGREGATE_MISSING'));

  const missingRate = JSON.parse(JSON.stringify(changed));
  missingRate.sheets.DM_LuongChuyen.rows = missingRate.sheets.DM_LuongChuyen.rows.filter((row) => row[0] !== 'NHIEU_LAI');
  const missingRateDomain = loadDomain(missingRate);
  const [rateFailure] = plain(missingRateDomain.service.buildMonth(missingRateDomain.spreadsheet, fixture.month, {}));
  assert.equal(rateFailure.status, 'needs_review');
  assert.ok(rateFailure.salaryLines[0].evidenceWarnings.some((item) => item.code === 'RATE_MISSING'));

  const terminationCutoff = JSON.parse(JSON.stringify(changed));
  terminationCutoff.sheets.DM_NhanSu.rows[0][1] = '01/09/2026';
  terminationCutoff.sheets.DM_LuongChuyen.rows = [
    ['1_LAI', 'Một lái thấp', 0, 20, 250000, '01/05/2026', '', 'Tràng Duệ'],
    ['1_LAI', 'Một lái cao', 21, 999, 300000, '01/05/2026', '', 'Tràng Duệ'],
    ['NHIEU_LAI', 'Nhiều lái thấp', 0, 20, 200000, '01/05/2026', '', 'Tràng Duệ'],
    ['NHIEU_LAI', 'Nhiều lái cao', 21, 999, 220000, '01/05/2026', '', 'Tràng Duệ']
  ];
  const terminationDomain = loadDomain(terminationCutoff);
  const [terminationBundle] = plain(terminationDomain.service.buildMonth(terminationDomain.spreadsheet, fixture.month, {}));
  assert.equal(terminationBundle.status, 'matched');
  assert.equal(terminationBundle.salaryLines[0].rateBasis.vehicleTripsAfterTerminationCutoff, 10);
  assert.equal(terminationBundle.salaryLines[0].rateBasis.threshold, 12);
  assert.equal(terminationBundle.salaryLines[0].rateBasis.terminationCutoffDate, '2026-09-01');
});

test('official attendance only comes from NL_ChamCong and operations leave remains KPI evidence', () => {
  const { service, spreadsheet, requestedSheets } = loadDomain();
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.equal(bundle.attendance.length, 1);
  assert.equal(bundle.attendance[0].sourceSheet, 'NL_ChamCong');
  assert.equal(bundle.attendance[0].attendanceType, 'Nghỉ phép');
  assert.equal(requestedSheets.includes('NL_NghiVanHanh'), false);
  assert.equal(bundle.salaryLines[1].operationsKpiAdjustment, 2);
  assert.equal(bundle.salaryLines[1].kpiSource, 'NL_NghiVanHanh via XL_LuongTheoXe');
});

test('a payroll mismatch fails closed as needs_review with the exact difference', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.sheets.BC_BangLuong.rows[0][4] = 4000000;
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.equal(bundle.status, 'needs_review');
  const tripSalary = bundle.reconciliation.find((item) => item.field === 'tripSalary');
  const salaryLineTotal = bundle.reconciliation.find((item) => item.field === 'salaryLineTotal');
  assert.equal(tripSalary.matched, false);
  assert.equal(tripSalary.difference, 500000);
  assert.equal(salaryLineTotal.matched, false);
});

test('processed personnel without a final payroll row remains pending instead of disappearing', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.sheets.BC_BangLuong.rows = [];
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.equal(bundle.employeeName, fixture.employee);
  assert.equal(bundle.status, 'pending');
  assert.equal(bundle.finalPayroll, null);
  assert.equal(bundle.personnelCalculation.tripSalary, 4500000);
});

test('manager and recruiter rewards combine KPI with 1m per recruited person per 30 eligible days', () => {
  for (const role of ['Quản lý', 'Người tuyển']) {
    const changed = JSON.parse(JSON.stringify(fixture));
    changed.employee = role === 'Quản lý' ? 'Huy' : 'Giang';
    const reward = role === 'Quản lý' ? 4000000 : 1000000;
    changed.sheets.BC_BangLuong.rows = [[fixture.month, changed.employee, role, 0, 0, 0, 0, 0, reward, reward, 0, 0, 0, reward, '', '']];
    changed.sheets.XL_LuongNhanSu.rows = [[fixture.month, changed.employee, role, 0, 0, 0, '01/01/2026', '', 1, 30, 0, 0, 0, 0, 0, 0, reward, 0, 0, reward, reward]];
    changed.sheets.XL_LuongTheoXe.rows = [];
    changed.sheets.NL_ChamCong.rows = [];
    changed.sheets.XL_ThuongQuanLy = {
      headerRow: 1,
      headers: ['Tháng', 'Dự án', 'Biển số', 'Tổng chuyến', 'Mốc 0-112', 'Mốc 113-140', 'Mốc 141-168', 'Tổng thưởng'],
      rows: [
        [fixture.month, 'Dự án nhỏ', '20H-00001', 26, 0, 0, 0, 0],
        [fixture.month, 'Tràng Duệ', '20H-00001', 168, 1000000, 1000000, 1000000, 3000000]
      ]
    };
    changed.sheets.DM_ThuongQuanLy = {
      headerRow: 1,
      headers: ['Mã thưởng', 'Điều kiện', 'Số tiền', 'Hiệu lực từ', 'Hiệu lực đến'],
      rows: [['TUYEN_DU_2_LAI', 'Tuyển đủ 2 lái', 2000000, '01/01/2026', ''], ['CHUYEN_168', 'Đạt mốc 168 chuyến', 1000000, '01/01/2026', '']]
    };
    changed.sheets.DM_LichSuNhanSu = {
      headerRow: 1,
      headers: ['Nhân sự', 'Chức vụ', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng', 'Ngày vào', 'Ngày nghỉ', 'Lương cứng', 'Nghỉ chuẩn', 'Công ty'],
      rows: [['Tài xế mới', 'Tài xế', changed.employee, '01/09/2026', '30/09/2026', '01/09/2026', '', 10000000, 1, 'Quang Quân']]
    };

    recruitmentTotal(changed, changed.employee, 1000000);
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
    const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
    assert.equal(bundle.employeeName, changed.employee);
    assert.equal(bundle.finalPayroll.role, role);
    assert.equal(bundle.salaryLines.length, 0);
    assert.equal(bundle.finalPayroll.fixedSalaryActual, 0);
    assert.equal(bundle.finalPayroll.tripSalary, 0);
    assert.equal(bundle.finalPayroll.netSalary, reward);
    assert.equal(bundle.reconciliation.every((item) => item.matched), true);
    assert.equal(bundle.roleEvidence.kind, role === 'Quản lý' ? 'manager' : 'recruiter');
    if (role === 'Quản lý') {
      assert.equal(bundle.roleEvidence.managementBonusTotal, 3000000);
      assert.equal(bundle.roleEvidence.recruitmentBonusTotal, 1000000);
      assert.equal(bundle.roleEvidence.explainedRewardTotal, 4000000);
      assert.deepEqual(bundle.roleEvidence.managerRows.map((row) => [row.vehicle, row.project, row.totalTrips, row.managementBonus]), [
        ['20H-00001', 'Dự án nhỏ', 26, 0],
        ['20H-00001', 'Tràng Duệ', 168, 3000000]
      ]);
      assert.deepEqual(bundle.roleEvidence.managerRows.map((row) => [row.milestone112, row.milestone140, row.milestone168]), [[0, 0, 0], [1000000, 1000000, 1000000]]);
    } else {
      assert.equal(bundle.roleEvidence.recruitmentBonusTotal, 1000000);
      assert.equal(bundle.roleEvidence.explainedRewardTotal, 1000000);
    }
    assert.equal(bundle.roleEvidence.otherReward, 0);
    assert.deepEqual(bundle.roleEvidence.recruitedPeople.map((row) => [row.employeeName, row.eligibleDays, row.bonus]), [['Tài xế mới', 30, 1000000]]);
    assert.equal(bundle.status, 'matched');
  }
});

test('recruitment explanation lists only rewarded people and rounds the monthly aggregate once', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.employee = 'Giang';
  changed.sheets.BC_BangLuong.rows = [[fixture.month, 'Giang', 'Người tuyển', 0, 0, 0, 0, 0, 600000, 600000, 0, 0, 0, 600000, '', '']];
  changed.sheets.XL_LuongNhanSu.rows = [[fixture.month, 'Giang', 'Người tuyển', 0, 0, 0, '01/01/2026', '', 1, 30, 0, 0, 0, 0, 0, 0, 600000, 0, 0, 600000, 600000]];
  changed.sheets.XL_LuongTheoXe.rows = [];
  changed.sheets.NL_ChamCong.rows = [];
  changed.sheets.XL_ThuongQuanLy = {
    headerRow: 1,
    headers: ['Tháng', 'Biển số', 'Tổng chuyến', 'Tổng thưởng'],
    rows: [[fixture.month, '20H-00001', 1, 0]]
  };
  changed.sheets.DM_ThuongQuanLy = { headerRow: 1, headers: ['Mã thưởng', 'Số tiền/xe', 'Hiệu lực từ'], rows: [['TUYEN_DU_2_LAI', 2000000, '01/01/2026']] };
  changed.sheets.DM_LichSuNhanSu = {
    headerRow: 1,
    headers: ['Nhân sự', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng', 'Ngày vào', 'Công ty'],
    rows: [
      ['Trong kỳ 14 ngày', 'Giang', '01/08/2026', '14/09/2026', '01/08/2026', 'Minh Vương'],
      ['Trong kỳ 4 ngày', 'Giang', '17/09/2026', '20/09/2026', '17/09/2026', 'Quang Quân'],
      ['Ngoài kỳ', 'Giang', '01/06/2026', '31/08/2026', '01/06/2026', 'Minh Vương']
    ]
  };
  recruitmentTotal(changed, 'Giang', 600000);
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.deepEqual(bundle.roleEvidence.recruitedPeople.map((row) => [row.employeeName, row.eligibleDays, row.bonus]), [
    ['Trong kỳ 14 ngày', 14, 467000],
    ['Trong kỳ 4 ngày', 4, 133000]
  ]);
  assert.equal(bundle.roleEvidence.recruitmentBonusTotal, 600000);
  assert.equal(bundle.roleEvidence.otherReward, 0);
  assert.equal(bundle.status, 'matched');
});

test('a driver who recruited someone keeps normal payroll evidence and receives recruitment evidence', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.employee = 'Tài xế tuyển người';
  changed.sheets.BC_BangLuong.rows = [[fixture.month, changed.employee, 'Tài xế', 0, 0, 0, 0, 0, 1500000, 1500000, 0, 0, 0, 1500000, '', '']];
  changed.sheets.XL_LuongNhanSu.rows = [[fixture.month, changed.employee, 'Tài xế', 0, 0, 0, '01/01/2026', '', 1, 30, 0, 0, 0, 0, 0, 0, 1500000, 0, 0, 1500000, 1500000]];
  changed.sheets.XL_LuongTheoXe.rows = [];
  changed.sheets.NL_ChamCong.rows = [];
  changed.sheets.DM_LichSuNhanSu = {
    headerRow: 1,
    headers: ['Nhân sự', 'Chức vụ', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng', 'Ngày vào', 'Công ty'],
    rows: [['Tài xế mới', 'Tài xế', changed.employee, '01/09/2026', '30/09/2026', '01/09/2026', 'Quang Quân']]
  };
  recruitmentTotal(changed, changed.employee, 1000000);
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.equal(bundle.roleEvidence.kind, 'employee');
  assert.equal(bundle.roleEvidence.recruitmentBonusTotal, 1000000);
  assert.equal(bundle.roleEvidence.explainedRewardTotal, 1000000);
  assert.equal(bundle.roleEvidence.otherReward, 500000);
  assert.deepEqual(bundle.roleEvidence.recruitedPeople.map((row) => row.employeeName), ['Tài xế mới']);
  assert.equal(bundle.status, 'matched');
  assert.equal(bundle.warnings.some((warning) => warning.includes('chưa khớp số tiền thưởng tuyển dụng')), false);
});

test('manager recruitment total does not accumulate per-person rounding drift', () => {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.employee = 'Huy';
  changed.sheets.BC_BangLuong.rows = [[fixture.month, 'Huy', 'Quản lý', 0, 0, 0, 0, 0, 5500000, 5500000, 0, 0, 0, 5500000, '', '']];
  changed.sheets.XL_LuongNhanSu.rows = [[fixture.month, 'Huy', 'Quản lý', 0, 0, 0, '01/01/2026', '', 1, 30, 0, 0, 0, 0, 0, 0, 5500000, 0, 0, 5500000, 5500000]];
  changed.sheets.XL_LuongTheoXe.rows = [];
  changed.sheets.NL_ChamCong.rows = [];
  changed.sheets.XL_ThuongQuanLy = {
    headerRow: 1,
    headers: ['Tháng', 'Biển số', 'Tổng chuyến', 'Tổng thưởng'],
    rows: [[fixture.month, '20H-00001', 1, 0]]
  };
  changed.sheets.DM_ThuongQuanLy = { headerRow: 1, headers: ['Mã thưởng', 'Số tiền/xe', 'Hiệu lực từ'], rows: [['TUYEN_DU_2_LAI', 2000000, '01/01/2026']] };
  changed.sheets.DM_LichSuNhanSu = {
    headerRow: 1,
    headers: ['Nhân sự', 'Người tuyển', 'Tính thưởng từ', 'Dừng thưởng', 'Ngày vào', 'Công ty'],
    rows: [
      ['Đủ tháng 1', 'Huy', '01/07/2026', '', '01/07/2026', 'Minh Vương'],
      ['Đủ tháng 2', 'Huy', '01/07/2026', '', '01/07/2026', 'Minh Vương'],
      ['Đủ tháng 3', 'Huy', '01/07/2026', '', '01/07/2026', 'Quang Quân'],
      ['Đủ tháng 4', 'Huy', '01/07/2026', '', '01/07/2026', 'Quang Quân'],
      ['14 ngày 1', 'Huy', '01/07/2026', '14/09/2026', '01/07/2026', 'Minh Vương'],
      ['14 ngày 2', 'Huy', '01/07/2026', '14/09/2026', '01/07/2026', 'Minh Vương'],
      ['17 ngày', 'Huy', '14/09/2026', '', '14/09/2026', 'Quang Quân']
    ]
  };
  recruitmentTotal(changed, 'Huy', 5500000);
  qualifyHistory(changed);
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, fixture.month, {}));
  assert.deepEqual(bundle.roleEvidence.recruitedPeople.map((row) => row.bonus), [1000000, 1000000, 1000000, 1000000, 467000, 467000, 567000]);
  assert.equal(bundle.roleEvidence.recruitmentBonusTotal, 5500000);
  assert.equal(bundle.roleEvidence.explainedRewardTotal, 5500000);
  assert.equal(bundle.roleEvidence.otherReward, 0);
  assert.equal(bundle.status, 'matched');
});

test('sync service writes one server-only row per employee with version and hash', () => {
  const { service: domain, spreadsheet } = loadDomain();
  const sandbox = vm.createContext({ PayrollExplanationService: domain });
  new vm.Script(read('PayrollExplanationSyncService.gs'), { filename: 'PayrollExplanationSyncService.gs#test' }).runInContext(sandbox);
  const calls = { replacements: [], statuses: [] };
  const result = plain(sandbox.PayrollExplanationSyncService.syncMonth(fixture.month, {
    spreadsheetId: 'sheet-2026',
    nowISOString: () => '2026-09-23T02:00:00.000Z',
    getReportDataVersion: () => 'report-v1',
    getSpreadsheet: () => spreadsheet,
    hashPayload: () => 'a'.repeat(64),
    replaceMonth: (...args) => calls.replacements.push(args),
    writeSyncStatus: (...args) => calls.statuses.push(args)
  }, { sourceDataVersion: 'report-v1' }));
  assert.equal(result.synced, 1);
  assert.equal(result.matched, 1);
  assert.equal(result.needsReview, 0);
  assert.equal(result.dailyMixedLines, 0);
  assert.equal(result.dailyMatchedLines, 0);
  assert.equal(result.dailyNeedsReviewLines, 0);
  assert.deepEqual(calls.replacements[0].slice(0, 2), ['sheet-2026', '09/2026']);
  assert.equal(calls.replacements[0][2][0].source_hash, 'a'.repeat(64));
  assert.equal(calls.replacements[0][2][0].is_current, true);
  assert.equal(calls.replacements[0][2][0].payload.contractVersion, 'payroll-explanation-v6');
  assert.equal(calls.statuses[0][0], 'payroll_explanations:09/2026');
});

test('a payroll build failure preserves the previously current month', () => {
  const sandbox = vm.createContext({ PayrollExplanationService: {
    normalizeMonth: () => '09/2026',
    buildMonth: () => { throw new Error('synthetic read failure'); }
  }});
  new vm.Script(read('PayrollExplanationSyncService.gs'), { filename: 'PayrollExplanationSyncService.gs#failure-test' }).runInContext(sandbox);
  let replaceCalls = 0;
  assert.throws(() => sandbox.PayrollExplanationSyncService.syncMonth('09/2026', {
    spreadsheetId: 'sheet-2026', nowISOString: () => 'now', getReportDataVersion: () => 'v1',
    getSpreadsheet: () => ({}), replaceMonth: () => { replaceCalls += 1; }
  }, {}), /synthetic read failure/);
  assert.equal(replaceCalls, 0);
});

test('migration keeps payroll details inaccessible to browser roles', () => {
  const migration = read('supabase/migrations/014_payroll_explanation_bundles.sql');
  assert.match(migration, /alter table public\.payroll_explanation_bundles enable row level security/i);
  assert.match(migration, /revoke all on public\.payroll_explanation_bundles from public, anon, authenticated/i);
  assert.match(migration, /grant all on public\.payroll_explanation_bundles to service_role/i);
  assert.doesNotMatch(migration, /create policy/i);
});

test('remediation migration replaces a payroll month atomically and seals operational tables', () => {
  const migration = read('supabase/migrations/015_financial_write_and_server_only_hardening.sql');
  assert.match(migration, /create or replace function public\.replace_payroll_explanation_month/i);
  assert.match(migration, /update public\.payroll_explanation_bundles[\s\S]*insert into public\.payroll_explanation_bundles/i);
  assert.match(migration, /row scope does not match requested workbook month/i);
  assert.match(migration, /revoke all on public\.write_jobs from public, anon, authenticated/i);
  assert.match(migration, /revoke all on public\.sync_status from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.replace_payroll_explanation_month[\s\S]*to service_role/i);
});

test('a direct monthly report refresh keeps the payroll explanation bundle on the same data version', () => {
  const sheetService = read('SheetService.gs');
  const writer = sheetService.match(/function writeReportBundleToSupabase_\(month, bundle, dataVersion\) \{[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(writer, /var reportMonth = month === 'Tất cả'/);
  assert.match(writer, /SupabaseReportCacheRepository\.upsertBundle/);
  assert.match(writer, /SupabaseService\.syncPayrollExplanationMonth\(reportMonth, dataVersion\)/);
  assert.match(writer, /\^\(0\[1-9\]\|1\[0-2\]\)\\\/20\\d\{2\}\$/);
});

test('the Apps Script maintenance entrypoint defaults to the current month', () => {
  const publicApi = read('PublicApi.gs');
  const entrypoint = publicApi.match(/function syncPayrollExplanationMonthToSupabase\(month\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(entrypoint, /Utilities\.formatDate/);
  assert.match(entrypoint, /'MM\/yyyy'/);
  assert.match(entrypoint, /SupabaseService\.syncPayrollExplanationMonth\(targetMonth\)/);
});

function recruitmentFixture(month, total, historyRows) {
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.month = month; changed.employee = 'R8 recruiter';
  changed.sheets.BC_BangLuong.rows = [[month, changed.employee, 'Người tuyển', 0, 0, 0, 0, 0, total, total, 0, 0, 0, total, '', '']];
  changed.sheets.XL_LuongNhanSu.rows = [[month, changed.employee, 'Người tuyển', 0, 0, 0, '01/01/2024', '', 1, 30, 0, 0, 0, 0, 0, 0, total, 0, 0, total, total]];
  changed.sheets.XL_LuongTheoXe.rows = []; changed.sheets.NL_ChamCong.rows = [];
  changed.sheets.DM_ThuongQuanLy = { headerRow: 1, headers: ['Mã thưởng', 'Số tiền/xe', 'Hiệu lực từ', 'Hiệu lực đến'], rows: [['TUYEN_DU_2_LAI', 2000000, '01/01/2024', '']] };
  changed.sheets.DM_LichSuNhanSu = { headerRow: 1, headers: ['Nhân sự', 'Đợt', 'Người tuyển', 'Ngày vào', 'Ngày nghỉ', 'Tính thưởng từ', 'Dừng thưởng', 'Điều kiện thưởng'], rows: historyRows };
  recruitmentTotal(changed, changed.employee, total);
  return changed;
}

for (const [month, last] of [['01/2026',31],['02/2026',28],['02/2024',29],['09/2026',30]]) {
  test(`R8 recruitment uses all ${last} calendar days of ${month} without a 30-day lifetime cap`, () => {
    const changed = recruitmentFixture(month, 1000000, [['Driver',1,'R8 recruiter','01/01/2024','','01/01/2024','','ĐỦ']]);
    const {service,spreadsheet}=loadDomain(changed); const [bundle]=plain(service.buildMonth(spreadsheet,month,{}));
    assert.equal(bundle.contractVersion,'payroll-explanation-v6'); assert.equal(bundle.status,'matched');
    assert.equal(bundle.roleEvidence.recruitedPeople[0].eligibleDays,last); assert.equal(bundle.roleEvidence.recruitmentBonusTotal,1000000);
    assert.equal(bundle.roleEvidence.recruitmentRule.daysInMonth,last);
  });
}

test('R8 recruitment uses historical periods and excludes CHỜ, KHÔNG ĐỦ and future periods', () => {
  const changed=recruitmentFixture('09/2026',1000000,[
    ['Same driver',1,'R8 recruiter','01/09/2026','15/09/2026','01/09/2026','15/09/2026','ĐỦ'],
    ['Same driver',2,'R8 recruiter','16/09/2026','','16/09/2026','','ĐỦ'],
    ['Waiting',1,'R8 recruiter','01/09/2026','','01/09/2026','','CHỜ'],
    ['Not eligible',1,'R8 recruiter','01/09/2026','','01/09/2026','','KHÔNG ĐỦ'],
    ['Future',1,'R8 recruiter','01/10/2026','','01/10/2026','','ĐỦ']]);
  // Current master intentionally contradicts historical recruiter; it must not drive rewards.
  changed.sheets.DM_NhanSu={headerRow:1,headers:['Nhân sự','Người tuyển'],rows:[['Same driver','Someone else']]};
  const {service,spreadsheet}=loadDomain(changed);const [bundle]=plain(service.buildMonth(spreadsheet,changed.month,{}));
  assert.equal(bundle.status,'matched'); assert.deepEqual(bundle.roleEvidence.recruitedPeople.map(row=>[row.employmentPeriod,row.eligibleDays]),[['1',15],['2',15]]);
  assert.equal(bundle.roleEvidence.recruitmentBonusTotal,1000000);
});

test('R8 recruitment selects the dated rate and detects aggregate drift or ambiguous effective rules', () => {
  const changed=recruitmentFixture('09/2026',2000000,[['Driver',1,'R8 recruiter','01/01/2024','','01/01/2024','','ĐỦ']]);
  changed.sheets.DM_ThuongQuanLy.rows.push(['TUYEN_DU_2_LAI',4000000,'01/09/2026','']);
  let domain=loadDomain(changed);let [bundle]=plain(domain.service.buildMonth(domain.spreadsheet,changed.month,{}));
  assert.equal(bundle.roleEvidence.recruitmentBonusTotal,2000000);assert.equal(bundle.status,'matched');
  changed.sheets.SYS_AggThuongTuyen.rows[0][2]=1999000;domain=loadDomain(changed);[bundle]=plain(domain.service.buildMonth(domain.spreadsheet,changed.month,{}));
  assert.equal(bundle.status,'needs_review');assert.ok(bundle.warnings.some(warning=>warning.includes('SYS_AggThuongTuyen')));
  changed.sheets.DM_ThuongQuanLy.rows.push(['TUYEN_DU_2_LAI',6000000,'01/09/2026','']);domain=loadDomain(changed);assert.throws(()=>domain.service.buildMonth(domain.spreadsheet,changed.month,{}),/trùng ngày hiệu lực/);
});

test('R8 payroll fails closed on source formula errors and honors final balance-adjusted net pay', () => {
  const changed=JSON.parse(JSON.stringify(fixture));
  changed.sheets.XL_LuongNhanSu.headers.push('Thực nhận cuối');
  changed.sheets.XL_LuongNhanSu.rows[0].push(changed.sheets.BC_BangLuong.rows[0][13]);
  changed.sheets.XL_LuongNhanSu.rows[0][20]-=100000;
  let domain=loadDomain(changed);let [bundle]=plain(domain.service.buildMonth(domain.spreadsheet,changed.month,{}));
  assert.ok(bundle.reconciliation.find(row=>row.field==='netSalary').matched);
  changed.sheets.SYS_AggThuongTuyen.rows.push(['bad',changed.month,'R8 recruiter','#REF!']);
  domain=loadDomain(changed);assert.throws(()=>domain.service.buildMonth(domain.spreadsheet,changed.month,{}),/lỗi công thức/);
});

test('R8 unformatted Sheets serial months reconcile recruitment without changing source formatting', () => {
  const changed = recruitmentFixture('09/2026', 1000000, [['Driver', 1, 'R8 recruiter', 45292, '', 45292, '', 'ĐỦ']]);
  changed.sheets.SYS_AggThuongTuyen.rows[0][0] = 46266; // 2026-09-01, as the live unformatted aggregate returns.
  changed.sheets.DM_ThuongQuanLy.rows[0][2] = 45292;
  const { service, spreadsheet } = loadDomain(changed);
  const [bundle] = plain(service.buildMonth(spreadsheet, changed.month, {}));
  assert.equal(service.normalizeMonth(46266), '09/2026');
  assert.equal(service.normalizeMonth(46266.9), '09/2026');
  assert.equal(service.normalizeMonth(9), '');
  assert.equal(service.normalizeMonth(Infinity), '');
  assert.equal(bundle.status, 'matched');
  assert.equal(bundle.roleEvidence.recruitmentBonusTotal, 1000000);
});
