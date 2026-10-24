export type PayrollReconciliationStatus = 'matched' | 'pending' | 'needs_review';

export type PayrollExplanation = {
  contractVersion: 'payroll-explanation-v6';
  month: string;
  employeeKey: string;
  employeeName: string;
  status: PayrollReconciliationStatus;
  warnings: string[];
  sourceDataVersion: string;
  syncedAt: string;
  finalPayroll: null | {
    role: string; tripCount: number; tripSalary: number; fixedSalaryActual: number;
    paidLeaveDays: number; deductedDays: number; reward: number; grossSalary: number;
    advance: number; penalty: number; bhxh: number; netSalary: number; company: string; note: string;
  };
  personnelCalculation: null | {
    role: string; tripCount: number; tripSalary: number; fixedSalary: number;
    paidLeaveDays: number; overLimitLeaveDays: number; unpaidLeaveDays: number;
    deductedDays: number; fixedSalaryPerDay: number; fixedSalaryActual: number;
    reward: number; advance: number; penalty: number; grossSalary: number; netSalary: number;
  };
  salaryLines: Array<{
    vehicle: string; operationsGroup: string; calculationType: string; individualTrips: number; vehicleTrips: number;
    driverCount: number; rate: number | null; tripSalary: number; operationsKpiAdjustment: number;
    targetAfterAdjustment: number; finalTripSalary: number; kpiSource: string;
    dailyEvidenceStatus: 'not_applicable' | PayrollReconciliationStatus;
    rateBasis: null | {
      vehicleTripsReported: number; vehicleTripsAfterTerminationCutoff: number;
      operationsKpiAdjustment: number; threshold: number; terminationCutoffDate: string;
      oneDriverRate: number | null; multiDriverRate: number | null; source: string;
    };
    dailyEvidence: Array<{
      date: string; vehicle: string; operationsGroup: string; individualTrips: number;
      vehicleTrips: number; driverCount: number; calculationType: '' | '1_LAI' | 'NHIEU_LAI';
      rate: number | null; amount: number | null; aggregateKey: string;
      keyStatus: 'matched' | 'needs_review'; sourceRowCount: number; sourceCheck: string;
    }>;
    breakdown: null | {
      oneDriver: { days: number; trips: number; rate: number | null; salary: number };
      multiDriver: { days: number; trips: number; rate: number | null; salary: number };
      totalTrips: number; reportedTrips: number; tripDifference: number; tripCountMatched: boolean;
      totalSalary: number; authoritativeTripSalary: number; salaryDifference: number; salaryMatched: boolean;
    };
    evidenceWarnings: Array<{ code: string; message: string; date: string }>;
  }>;
  attendance: Array<{
    fromDate: string; toDate: string; attendanceType: string; days: number;
    fixedSalaryTreatment: string; processingGroup: string; validDayType: string;
    warning: string; note: string; sourceSheet: 'NL_ChamCong';
  }>;
  roleEvidence: null | {
    kind: 'manager' | 'recruiter' | 'employee'; reportedReward: number; managementBonusTotal: number;
    recruitmentBonusTotal: number; explainedRewardTotal: number; otherReward: number; source: string;
    managerRows: Array<{
      vehicle: string; project: string; totalTrips: number; recruitmentBonus: number; milestone112: number;
      milestone140: number; milestone168: number; managementBonus: number; managementDays: number;
    }>;
    recruitedPeople: Array<{
      employeeName: string; joinedDate: string; rewardFrom: string; rewardTo: string;
      company: string; eligibleDays: number; bonus: number;
    }>;
    rules: Array<{ code: string; condition: string; amount: number; effectiveFrom: string; effectiveTo: string }>;
    recruitmentRule: { amountPerMonth: number; daysInMonth: number; roundingUnit: number };
  };
  reconciliation: Array<{
    field: string; calculated: number; reported: number; difference: number; matched: boolean;
    calculatedSource: string; reportedSource: string;
  }>;
  sourceContract: {
    authoritativeResult: 'BC_BangLuong'; officialAttendance: 'NL_ChamCong';
    kpiAdjustment: string; dailyMixedEvidence: string;
    dailyClassificationEffectiveFrom: string; sheetsRead: string[];
  };
};

export type PayrollExplanationResponse = {
  ok: true;
  stale: boolean;
  explanation: PayrollExplanation | null;
  refresh?: { required: boolean; reasons: string[] };
  cache: null | {
    reconciliationStatus: PayrollReconciliationStatus;
    sourceDataVersion: string;
    sourceHash: string;
    syncedAt: string;
  };
};
