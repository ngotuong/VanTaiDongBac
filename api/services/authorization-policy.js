const SHAREHOLDER_ACTIONS = new Set([
  'authSession',
  'changeOwnPassword',
  'getStartupData',
  'getDashboard',
  'getReports',
  'getReport',
  'getReportBundle',
  'getCatalogs',
  'readManageData',
  'getFundTransactions',
  'getFundOverview',
  'getFundLoanOverview',
  'getFundFormOptions',
  'checkTripReconciliation'
]);

function createAuthorizationPolicy({ httpError }) {
  function assertAuthorized(user, action) {
    if (user && user.role === 'shareholder' && !SHAREHOLDER_ACTIONS.has(action)) {
      throw httpError(403, 'Tài khoản cổ đông chỉ có quyền xem dữ liệu.');
    }
  }

  function assertAdmin(user) {
    if (!user || user.role !== 'admin') throw httpError(403, 'Chỉ quản trị viên được quản lý tài khoản.');
  }

  return { assertAuthorized, assertAdmin };
}

module.exports = { createAuthorizationPolicy, SHAREHOLDER_ACTIONS };
