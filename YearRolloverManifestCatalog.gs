/**
 * Reviewed rollover manifests bundled with the server runtime. Script
 * Properties may override these manifests for a later year, but the approved
 * 2026 -> 2027 path must not depend on a one-off setup helper.
 */
var YearRolloverManifestCatalog = (function () {
  var manifests = {
    '2027': {
      approved: true,
      version: 'year-rollover-$SOURCE_YEAR-$TARGET_YEAR-v3',
      targetYear: '$TARGET_YEAR',
      destinationFolderId: '1JAfFgARCzyZMrU99r7JisB-1KNtaB3r7',
      names: {
        transport: 'VanTaiDongBac_$TARGET_YEAR',
        cashflow: 'ThuChiDongBac_$TARGET_YEAR'
      },
      audit: {
        sourceYearFormulaAllowlist: [
          { module: 'transport', sheet: 'DM_ThamSo', range: 'C19', reason: 'Mốc hiệu lực lịch sử của cách tính lãi theo ngày.' },
          { module: 'transport', sheet: 'DM_ThamSo', range: 'C21', reason: 'Mốc hiệu lực lịch sử của kiểm tra nghỉ chuyến.' },
          { module: 'transport', sheet: 'DM_ThamSo', range: 'C22', reason: 'Mốc hiệu lực lịch sử của quy tắc không làm tròn đơn giá.' },
          { module: 'transport', sheet: 'DM_ThamSo', range: 'C24', reason: 'Mốc hiệu lực lịch sử của kiểm tra an toàn vận chuyển.' },
          { module: 'transport', sheet: 'DM_ThamSo', range: 'C25', reason: 'Mốc bắt đầu chuỗi giá dầu lịch sử dùng để tính giá hiện hành.' },
          { module: 'transport', sheet: 'DM_ThamSo', range: 'C26', reason: 'Mốc bắt đầu chuỗi giá dầu lịch sử dùng để tính điều chỉnh hiện hành.' },
          { module: 'cashflow', sheet: 'PHANBO_VAY', range: 'A8', reason: 'Ngoại lệ lịch sử Quang Quân từ tháng 07/2026.' },
          { module: 'cashflow', sheet: 'SYS_CHOT', range: 'F5', reason: 'Ngoại lệ lịch sử Quang Quân từ tháng 07/2026.' }
        ]
      },
      operations: {
        clearRanges: [
          { module: 'transport', sheet: 'NL_VanChuyen', range: 'A3:I7040' },
          { module: 'transport', sheet: 'NL_TaiXe', range: 'A2:I9011' },
          { module: 'transport', sheet: 'NL_Dau', range: 'A3:K3009' },
          { module: 'transport', sheet: 'NL_ChamCong', range: 'A2:K501' },
          { module: 'transport', sheet: 'NL_NghiVanHanh', range: 'A2:J1001' },
          { module: 'transport', sheet: 'NL_Phat', range: 'A2:G501' },
          { module: 'transport', sheet: 'NL_PhanCongLai', range: 'A2:E501' },
          { module: 'transport', sheet: 'NL_SoDuLuong', range: 'A2:Q1000' },
          { module: 'transport', sheet: 'SYS_LuongDaChot', range: 'A2:P1001' },
          { module: 'transport', sheet: 'SYS_ChotLuongLog', range: 'A2:L1001' },
          { module: 'cashflow', sheet: 'NHAP_THUCHI', range: 'A2:O4266' },
          { module: 'cashflow', sheet: 'NHAP_VAY', range: 'A2:O1061' }
        ],
        formulaReplacements: [{
          module: 'transport', sheet: 'SYS_ThuChiRaw', range: 'A1:Y1',
          from: '$SOURCE_CASHFLOW_ID', to: '$TARGET_CASHFLOW_ID', required: true
        }],
        carryovers: [],
        snapshots: [{
          kind: 'fund', module: 'cashflow',
          transactionSheet: 'NHAP_THUCHI', transactionRange: 'A2:O4266',
          loanSheet: 'NHAP_VAY', loanRange: 'A2:O1061',
          settingsSheet: 'CAIDAT', cashOpeningRange: 'R3', bankOpeningRange: 'R4',
          dataStartDateRange: 'R6', loanStartDateRange: 'R7', openingBalanceMode: 'cash',
          categoryValidation: {
            settingsSheet: 'CAIDAT', incomeRange: 'E3:E13', expenseRange: 'H3:H38',
            mutualExclusionSheet: 'BC_THUCHI', mutualExclusionRange: 'O1:O2'
          }
        }, {
          kind: 'salary', module: 'transport', sheet: 'NL_SoDuLuong', range: 'A2:Q1000'
        }],
        setValues: [{
          module: 'transport', sheet: 'BC_TongQuan', range: 'B1',
          value: '$TARGET_YEAR-01-01', valueType: 'date', numberFormat: 'MM/yyyy'
        }, {
          module: 'transport', sheet: 'BC_ChotLuong', range: 'B3',
          value: '$TARGET_YEAR-01-01', valueType: 'date', numberFormat: 'MM/yyyy'
        }, {
          module: 'cashflow', sheet: 'CHOT_CONGNO', range: 'B3',
          value: '$TARGET_YEAR-01-01', valueType: 'date', numberFormat: 'MM/yyyy'
        }, {
          module: 'cashflow', sheet: 'BC_THUCHI', range: 'I1',
          value: 'BÁO CÁO TÀI CHÍNH $TARGET_YEAR', valueType: 'string'
        }]
      }
    }
  };

  function get(targetYear) {
    var manifest = manifests[String(targetYear || '').trim()];
    return manifest ? JSON.parse(JSON.stringify(manifest)) : null;
  }

  return { get: get };
})();
