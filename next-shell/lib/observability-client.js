/** @typedef {(method:'GET'|'POST', action:string, params?:object, body?:object) => Promise<any>} ObservabilityTransport */

/** @param {ObservabilityTransport} transport */
export function createObservabilityClient(transport) {
  if (typeof transport !== 'function') throw new Error('Observability transport is required.');
  return {
    loadStatus: (forceRefresh = false) => Promise.all([
      transport('GET', 'getSupabaseSyncStatus', { limit: 24, forceRefresh: forceRefresh ? 'true' : '' }),
      transport('GET', 'getRecentWriteJobs', { module: 'transport', limit: 12, forceRefresh: forceRefresh ? 'true' : '' })
    ]),
    auditManage: ({ allSheets = false, deep = false, sheetName = 'NL_VanChuyen' } = {}) => transport('GET', 'getManageCacheAudit', { sheetNames: allSheets ? '' : sheetName, limit: deep ? 500 : 50, forceRefresh: 'true' }),
    auditReports: () => transport('GET', 'getReportCacheAudit', { months: '05/2026,06/2026,07/2026,Tất cả', forceRefresh: 'true' }),
    retryWriteJob: (jobId) => transport('POST', 'retryWriteJob', {}, { jobId })
  };
}
