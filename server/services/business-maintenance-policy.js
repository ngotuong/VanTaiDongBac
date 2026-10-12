function assertBusinessWritesAvailable({ action, method, config, httpError }) {
  if (!config.businessWritesPaused) return;
  if ((method === 'POST' && action !== 'checkTripReconciliation') || action === 'invalidateCaches') {
    throw httpError(503, 'Đang bảo trì lệnh ghi; vui lòng thử lại sau.');
  }
}

module.exports = { assertBusinessWritesAvailable };
