const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { assertBusinessWritesAvailable } = require('../server/services/business-maintenance-policy');
const httpError = (status, message) => Object.assign(new Error(message), { status });

test('maintenance blocks direct writes and queue control before dispatch, including unknown POST actions', () => {
  for (const action of ['addFundTransaction', 'addFundTransactions', 'saveSheetRow', 'saveFundCatalogItem', 'retryWriteJob', 'cancelWriteJob', 'processWriteJobs', 'recoverSyncInfrastructure', 'requestPayrollExplanationRefresh', 'createUser', 'futureWriteAction']) {
    assert.throws(() => assertBusinessWritesAvailable({ action, method: 'POST', config: { businessWritesPaused: true }, httpError }), { status: 503 });
  }
  assert.throws(() => assertBusinessWritesAvailable({ action: 'invalidateCaches', method: 'GET', config: { businessWritesPaused: true }, httpError }), { status: 503 });
  const source = fs.readFileSync('api/app.js', 'utf8');
  const guard = source.indexOf('assertBusinessWritesAvailable({');
  for (const branch of ['accountService.handles(action)', 'reportService.handles(action)', 'writeCommandService.handles(action)', 'await client.forward']) assert.ok(guard >= 0 && guard < source.indexOf(branch));
});

test('maintenance allows queries and Production keeps existing write behavior when flag is off', () => {
  for (const action of ['getPayrollExplanation', 'getReportBundle', 'getFundTransactions', 'getWriteJobStatus', 'health']) assert.doesNotThrow(() => assertBusinessWritesAvailable({ action, method: 'GET', config: { businessWritesPaused: true }, httpError }));
  assert.doesNotThrow(() => assertBusinessWritesAvailable({ action: 'checkTripReconciliation', method: 'POST', config: { businessWritesPaused: true }, httpError }));
  assert.doesNotThrow(() => assertBusinessWritesAvailable({ action: 'manageYearRollover', method: 'POST', config: { businessWritesPaused: true }, httpError }));
  assert.doesNotThrow(() => assertBusinessWritesAvailable({ action: 'addFundTransaction', method: 'POST', config: { businessWritesPaused: false }, httpError }));
});
