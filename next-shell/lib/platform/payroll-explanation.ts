import type { PayrollExplanation, PayrollReconciliationStatus } from './payroll-explanation-types';

export type ExplanationField = { label: string; value: string; tone?: 'normal' | 'positive' | 'negative' };

export type PayrollExplanationViewModel = {
  title: string;
  subtitle: string;
  compactRoleOnly: boolean;
  status: { label: string; detail: string; tone: PayrollReconciliationStatus };
  summary: ExplanationField[];
  roleExplanation: string;
  salaryLines: Array<{
    vehicle: string; operationsGroup: string; type: string; trips: string; rate: string; salary: string; kpi: string;
    dailyStatus: { label: string; tone: 'matched' | 'needs_review' | 'not_applicable' };
    rateBasis: null | Array<{ label: string; value: string }>;
    breakdown: null | Array<{ label: string; days: string; trips: string; rate: string; salary: string; tone?: 'total' }>;
    dailyEvidence: Array<{
      date: string; driverCount: string; type: string; individualTrips: string; vehicleTrips: string;
      rate: string; amount: string; status: string; matched: boolean;
    }>;
    warnings: string[];
  }>;
  attendance: Array<{ period: string; type: string; days: string; treatment: string; note: string }>;
  roleEvidence: null | {
    kind: 'manager' | 'recruiter' | 'employee'; title: string; help: string; summary: ExplanationField[];
    managerVehicles: Array<{
      vehicle: string;
      projects: Array<{ project: string; trips: string; milestone112: string; milestone140: string; milestone168: string; bonus: string; days: string }>;
    }>;
    recruitedPeople: Array<{ employeeName: string; joinedDate: string; rewardPeriod: string; company: string; eligibleDays: string; bonus: string }>;
    rules: Array<{ code: string; condition: string; amount: string; effectivePeriod: string }>;
  };
  components: ExplanationField[];
  reconciliation: Array<{ label: string; calculated: string; reported: string; difference: string; matched: boolean }>;
  warnings: string[];
  footer: string;
};

const MONEY = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function money(value: number) { return `${MONEY.format(Number(value || 0))} đ`; }
function number(value: number) { return NUMBER.format(Number(value || 0)); }

function dateLabel(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return date.toLocaleDateString('vi-VN');
  return value;
}

function fieldLabel(value: string) {
  const labels: Record<string, string> = {
    tripCount: 'Số chuyến', tripSalary: 'Lương chuyến', fixedSalaryActual: 'Lương cứng / khoán',
    paidLeaveDays: 'Nghỉ phép', deductedDays: 'Ngày bị trừ', reward: 'Thưởng',
    grossSalary: 'Tổng lương', advance: 'Ứng lương', penalty: 'Phạt',
    netSalary: 'Thực nhận', salaryLineTotal: 'Tổng chi tiết lương chuyến'
  };
  return labels[value] || value;
}

function reconciliationValue(field: string, value: number) {
  return ['tripCount', 'paidLeaveDays', 'deductedDays'].includes(field) ? number(value) : money(value);
}

function dailyTypeLabel(value: string) {
  if (value === '1_LAI') return '1 lái';
  if (value === 'NHIEU_LAI') return 'Nhiều lái';
  if (value === 'HỖN_HỢP') return 'Hỗn hợp 1 lái / nhiều lái';
  return value || '—';
}

function dailyStatusLabel(value: 'not_applicable' | PayrollReconciliationStatus): { label: string; tone: 'matched' | 'needs_review' | 'not_applicable' } {
  if (value === 'matched') return { label: 'Chi tiết ngày đã khớp', tone: value };
  if (value === 'needs_review') return { label: 'Chi tiết ngày cần kiểm tra', tone: value };
  if (value === 'pending') return { label: 'Chi tiết ngày đang chờ dữ liệu', tone: 'needs_review' };
  return { label: 'Không áp dụng chi tiết ngày', tone: value };
}

type ManagerSourceRow = NonNullable<PayrollExplanation['roleEvidence']>['managerRows'][number];

function managerVehicleGroups(rows: ManagerSourceRow[]) {
  const groups = new Map<string, ManagerSourceRow[]>();
  rows.forEach((row) => {
    const vehicle = row.vehicle || '—';
    const group = groups.get(vehicle) || [];
    group.push(row);
    groups.set(vehicle, group);
  });
  return Array.from(groups.entries()).map(([vehicle, vehicleRows]) => {
    return {
      vehicle,
      projects: vehicleRows.map((row) => ({
        project: row.project || 'Không xác định',
        trips: number(row.totalTrips),
        milestone112: money(row.milestone112),
        milestone140: money(row.milestone140),
        milestone168: money(row.milestone168),
        bonus: money(row.managementBonus),
        days: number(row.managementDays)
      }))
    };
  });
}

export function payrollExplanationView(explanation: PayrollExplanation, now = new Date()): PayrollExplanationViewModel {
  const final = explanation.finalPayroll;
  const synced = new Date(explanation.syncedAt);
  const currentMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const provisional = explanation.month === currentMonth;
  const status = explanation.status === 'matched'
    ? { label: 'Đã khớp', detail: 'Các thành phần đang khớp với BC_BangLuong.', tone: explanation.status }
    : explanation.status === 'pending'
      ? { label: 'Đang chờ', detail: 'Chưa có dòng lương cuối cùng trên BC_BangLuong.', tone: explanation.status }
      : { label: 'Cần kiểm tra', detail: 'Có nguồn thiếu hoặc thành phần chưa khớp.', tone: explanation.status };
  const periodStatus = provisional
    ? `Tạm tính đến ${Number.isNaN(synced.getTime()) ? explanation.syncedAt : synced.toLocaleString('vi-VN')}`
    : 'Kỳ đã qua';
  const sourceRoleEvidence = explanation.roleEvidence;
  const compactRoleOnly = sourceRoleEvidence?.kind === 'manager' || sourceRoleEvidence?.kind === 'recruiter';
  const roleEvidence = sourceRoleEvidence ? {
    kind: sourceRoleEvidence.kind,
    title: sourceRoleEvidence.kind === 'manager' ? 'Căn cứ thưởng quản lý' : 'Căn cứ thưởng tuyển người',
    help: `Thưởng tuyển người theo lịch sử nhân sự đủ điều kiện: ${money(sourceRoleEvidence.recruitmentRule.amountPerMonth)}/người/tháng, phân bổ theo ${sourceRoleEvidence.recruitmentRule.daysInMonth} ngày của tháng. Tổng tháng làm tròn đến 1.000 đ và đối chiếu SYS_AggThuongTuyen.`,
    summary: sourceRoleEvidence.kind === 'manager' ? [
      { label: 'Thưởng KPI quản lý', value: money(sourceRoleEvidence.managementBonusTotal), tone: 'positive' as const },
      { label: 'Thưởng tuyển người', value: money(sourceRoleEvidence.recruitmentBonusTotal), tone: 'positive' as const },
      { label: 'Đã giải thích', value: money(sourceRoleEvidence.explainedRewardTotal), tone: 'positive' as const },
      { label: 'Thưởng trên bảng lương', value: money(sourceRoleEvidence.reportedReward), tone: 'positive' as const },
      { label: 'Chênh lệch', value: money(sourceRoleEvidence.otherReward), tone: sourceRoleEvidence.otherReward ? 'negative' as const : 'normal' as const }
    ] : [
      { label: 'Người tạo thưởng', value: `${sourceRoleEvidence.recruitedPeople.length} người` },
      { label: 'Thưởng tuyển đã giải thích', value: money(sourceRoleEvidence.recruitmentBonusTotal), tone: 'positive' as const },
      { label: 'Thưởng trên bảng lương', value: money(sourceRoleEvidence.reportedReward), tone: 'positive' as const },
      { label: 'Thưởng khác', value: money(sourceRoleEvidence.otherReward), tone: 'normal' as const }
    ],
    managerVehicles: managerVehicleGroups(sourceRoleEvidence.managerRows),
    recruitedPeople: sourceRoleEvidence.recruitedPeople.map((row) => ({
      employeeName: row.employeeName, joinedDate: dateLabel(row.joinedDate),
      rewardPeriod: `${row.rewardFrom ? dateLabel(row.rewardFrom) : 'Không giới hạn'} – ${row.rewardTo ? dateLabel(row.rewardTo) : 'Hiện tại'}`,
      company: row.company || '—', eligibleDays: `${number(row.eligibleDays)} ngày`, bonus: money(row.bonus)
    })),
    rules: sourceRoleEvidence.rules.map((rule) => ({
      code: rule.code || '—', condition: rule.condition || '—', amount: money(rule.amount),
      effectivePeriod: `${rule.effectiveFrom ? dateLabel(rule.effectiveFrom) : 'Không giới hạn'} – ${rule.effectiveTo ? dateLabel(rule.effectiveTo) : 'Hiện tại'}`
    }))
  } : null;
  return {
    title: explanation.employeeName,
    subtitle: `${explanation.month} · ${periodStatus}`,
    compactRoleOnly,
    status,
    summary: [
      { label: 'Chức vụ', value: final?.role || explanation.personnelCalculation?.role || '—' },
      { label: 'Công ty', value: final?.company || '—' },
      { label: 'Tổng lương', value: money(final?.grossSalary || 0), tone: 'positive' },
      { label: 'Thực nhận', value: money(final?.netSalary || 0), tone: 'positive' }
    ],
    roleExplanation: explanation.salaryLines.length
      ? 'Lương chuyến được tách theo từng biển số xe. Chọn “Xem cách tính chi tiết” khi cần kiểm tra đơn giá và từng ngày chạy.'
      : `${final?.role || explanation.personnelCalculation?.role || 'Nhân sự'} không có lương theo xe trong kỳ này. Mức lương bên dưới được giải thích từ lương cứng/khoán, thưởng và các khoản khấu trừ.`,
    salaryLines: explanation.salaryLines.map((line) => {
      const basis = line.rateBasis;
      const breakdown = line.breakdown;
      return {
        vehicle: line.vehicle || '—',
        operationsGroup: line.operationsGroup || '—',
        type: dailyTypeLabel(line.calculationType),
        trips: number(line.individualTrips),
        rate: line.rate === null ? 'Theo từng ngày' : money(line.rate),
        salary: money(line.finalTripSalary),
        kpi: line.operationsKpiAdjustment ? `${number(line.operationsKpiAdjustment)} chuyến` : 'Không điều chỉnh',
        dailyStatus: dailyStatusLabel(line.dailyEvidenceStatus),
        rateBasis: basis ? [
          { label: 'Tổng chuyến xe', value: number(basis.vehicleTripsReported) },
          { label: 'Chuyến xe dùng chọn giá', value: number(basis.vehicleTripsAfterTerminationCutoff) },
          { label: 'Điều chỉnh KPI', value: number(basis.operationsKpiAdjustment) },
          { label: 'Ngưỡng chọn giá', value: number(basis.threshold) },
          { label: 'Đơn giá 1 lái', value: basis.oneDriverRate === null ? 'Thiếu đơn giá' : money(basis.oneDriverRate) },
          { label: 'Đơn giá nhiều lái', value: basis.multiDriverRate === null ? 'Thiếu đơn giá' : money(basis.multiDriverRate) }
        ] : null,
        breakdown: breakdown ? [
          { label: '1 lái', days: number(breakdown.oneDriver.days), trips: number(breakdown.oneDriver.trips), rate: breakdown.oneDriver.rate === null ? '—' : money(breakdown.oneDriver.rate), salary: money(breakdown.oneDriver.salary) },
          { label: 'Nhiều lái', days: number(breakdown.multiDriver.days), trips: number(breakdown.multiDriver.trips), rate: breakdown.multiDriver.rate === null ? '—' : money(breakdown.multiDriver.rate), salary: money(breakdown.multiDriver.salary) },
          { label: 'Tổng theo ngày', days: number(breakdown.oneDriver.days + breakdown.multiDriver.days), trips: number(breakdown.totalTrips), rate: '—', salary: money(breakdown.totalSalary), tone: 'total' }
        ] : null,
        dailyEvidence: line.dailyEvidence.map((row) => ({
          date: dateLabel(row.date),
          driverCount: number(row.driverCount),
          type: dailyTypeLabel(row.calculationType),
          individualTrips: number(row.individualTrips),
          vehicleTrips: number(row.vehicleTrips),
          rate: row.rate === null ? '—' : money(row.rate),
          amount: row.amount === null ? '—' : money(row.amount),
          status: row.keyStatus === 'matched' ? 'Đã khớp' : 'Cần kiểm tra',
          matched: row.keyStatus === 'matched'
        })),
        warnings: line.evidenceWarnings.map((warning) => `${warning.date ? `${dateLabel(warning.date)} · ` : ''}${warning.message}`)
      };
    }),
    attendance: explanation.attendance.map((row) => ({
      period: row.fromDate === row.toDate || !row.toDate ? dateLabel(row.fromDate) : `${dateLabel(row.fromDate)} – ${dateLabel(row.toDate)}`,
      type: row.attendanceType || '—',
      days: number(row.days),
      treatment: row.fixedSalaryTreatment || row.validDayType || '—',
      note: row.warning || row.note || '—'
    })),
    roleEvidence,
    components: [
      { label: 'Lương chuyến', value: money(final?.tripSalary || 0), tone: 'positive' },
      { label: 'Lương cứng / khoán', value: money(final?.fixedSalaryActual || 0), tone: 'positive' },
      { label: 'Thưởng', value: money(final?.reward || 0), tone: 'positive' },
      { label: 'Tổng lương', value: money(final?.grossSalary || 0), tone: 'positive' },
      { label: 'Ứng lương', value: money(final?.advance || 0), tone: 'negative' },
      { label: 'Phạt', value: money(final?.penalty || 0), tone: 'negative' },
      { label: 'BHXH', value: money(final?.bhxh || 0), tone: 'negative' },
      { label: 'Thực nhận', value: money(final?.netSalary || 0), tone: 'positive' }
    ],
    reconciliation: explanation.reconciliation.map((item) => ({
      label: fieldLabel(item.field),
      calculated: reconciliationValue(item.field, item.calculated),
      reported: reconciliationValue(item.field, item.reported),
      difference: reconciliationValue(item.field, item.difference),
      matched: item.matched
    })),
    warnings: explanation.warnings,
    footer: 'Kết quả cuối cùng lấy từ BC_BangLuong. Nghỉ phép lấy từ NL_ChamCong; NL_NghiVanHanh chỉ điều chỉnh KPI vận hành.'
  };
}
