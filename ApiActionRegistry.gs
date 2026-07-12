/** Internal API action metadata. Public action names and payloads remain unchanged. */
var ApiActionRegistry = (function () {
  var ACTIONS = {
    health: { method: 'GET', kind: 'query', permission: 'public' },
    getBootstrap: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getStartupData: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getInitialData: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getCatalogs: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getDashboard: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getReports: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getReport: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getReportBundle: { method: 'GET', kind: 'query', permission: 'shareholder' },
    invalidateCaches: { method: 'GET', kind: 'command', permission: 'adminOperator' },
    readSheetData: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    readManageData: { method: 'GET', kind: 'query', permission: 'shareholder' },
    readCatalogData: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getFundTransactions: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getFundOverview: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getFundLoanOverview: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getFundFormOptions: { method: 'GET', kind: 'query', permission: 'shareholder' },
    getFundCatalog: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getWriteJobStatus: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getRecentWriteJobs: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getSupabaseSyncStatus: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getReportCacheAudit: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    getManageCacheAudit: { method: 'GET', kind: 'query', permission: 'adminOperator' },
    submitRows: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    checkTripReconciliation: { method: 'POST', kind: 'query', permission: 'shareholder' },
    saveSheetRow: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    deleteSheetRow: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    updateFundTransaction: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    deleteFundTransaction: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    addFundTransaction: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    addFundTransactions: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    addFundLoan: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    addFundLoanPayment: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    saveFundCatalogItem: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    deleteFundCatalogItem: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    retryWriteJob: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    processWriteJobs: { method: 'POST', kind: 'command', permission: 'adminOperator' },
    debugSheet: { method: 'GET', kind: 'query', permission: 'adminOperator', routerOnly: true },
    submitRowsGet: { method: 'GET', kind: 'disabled', permission: 'adminOperator', routerOnly: true, disabled: true },
    authSession: { method: 'GET', kind: 'query', permission: 'shareholder', proxyLocal: true },
    changeOwnPassword: { method: 'POST', kind: 'command', permission: 'shareholder', proxyLocal: true },
    listUsers: { method: 'GET', kind: 'query', permission: 'admin', proxyLocal: true },
    createUser: { method: 'POST', kind: 'command', permission: 'admin', proxyLocal: true },
    updateUser: { method: 'POST', kind: 'command', permission: 'admin', proxyLocal: true },
    resetUserPassword: { method: 'POST', kind: 'command', permission: 'admin', proxyLocal: true }
  };

  function get(action) { return ACTIONS[String(action || '')] || null; }
  function list() { return Object.keys(ACTIONS).map(function (action) { var item = ACTIONS[action]; return { action: action, method: item.method, kind: item.kind, permission: item.permission, routerOnly: Boolean(item.routerOnly), proxyLocal: Boolean(item.proxyLocal), disabled: Boolean(item.disabled) }; }); }

  function assertPublicAction(method, action) {
    var normalizedMethod = String(method || '').toUpperCase();
    if (normalizedMethod !== 'GET' && normalizedMethod !== 'POST') throw new Error('Phương thức không hợp lệ: ' + normalizedMethod);
    var item = get(action);
    if (!item || item.routerOnly || item.proxyLocal || item.method !== normalizedMethod) throw new Error('Hành động ' + normalizedMethod + ' không hợp lệ: ' + action);
    return item;
  }

  function assertRouterGetAction(action) {
    var item = get(action);
    if (!item || item.method !== 'GET' || item.proxyLocal) throw new Error('Hành động GET không hợp lệ: ' + action);
    return item;
  }

  return { get: get, list: list, assertPublicAction: assertPublicAction, assertRouterGetAction: assertRouterGetAction };
})();
