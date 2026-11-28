function assertBusinessWritesAvailable({ action, method, config, httpError }) {
  if (!config.businessWritesPaused) return;
  const maintenanceSafePostActions = new Set([
    'checkTripReconciliation',
    'manageYearRollover',
    'recoverSyncInfrastructure'
  ]);
  if ((method === 'POST' && !maintenanceSafePostActions.has(action)) || action === 'invalidateCaches') {
    throw httpError(503, 'Đang bảo trì lệnh ghi; vui lòng thử lại sau.');
  }
}

module.exports = { assertBusinessWritesAvailable };
