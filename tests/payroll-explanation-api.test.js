const assert = require('node:assert/strict');
const test = require('node:test');
const { createPayrollExplanationRepository } = require('../server/repositories/payroll-explanation-repository');
const { createPayrollExplanationService, PAYROLL_EXPLANATION_CONTRACT_VERSION, employeeKey } = require('../server/services/payroll-explanation-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });

test('payroll repository scopes the service-role query to workbook, month and employee', async () => {
  let request;
  const repository = createPayrollExplanationRepository({ httpError, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => [{ payload: { status: 'matched' } }] };
  }});
  await repository.findOne({ supabaseUrl: 'https://db.example', serviceRoleKey: 'server-secret' }, 'sheet-2026', '09/2026', 'chu-duc-muoi');
  const url = new URL(request.url);
  assert.equal(url.pathname, '/rest/v1/payroll_explanation_bundles_v6');
  assert.equal(url.searchParams.get('spreadsheet_id'), 'eq.sheet-2026');
  assert.equal(url.searchParams.get('report_month'), 'eq.09/2026');
  assert.equal(url.searchParams.get('employee_key'), 'eq.chu-duc-muoi');
  assert.equal(url.searchParams.get('is_current'), 'eq.true');
  assert.equal(request.options.headers.Authorization, 'Bearer server-secret');
});

test('payroll API resolves the workbook server-side and returns no spreadsheet id', async () => {
  let query; let response;
  const service = createPayrollExplanationService({
    repository: { async findOne(_config, spreadsheetId, month, key) {
      query = { spreadsheetId, month, key };
      return {
        spreadsheet_id: spreadsheetId, report_month: month, employee_key: key,
        payload: { contractVersion: PAYROLL_EXPLANATION_CONTRACT_VERSION, employeeName: 'Chu Đức Mười', status: 'matched' }, reconciliation_status: 'matched',
        source_data_version: 'v1', source_hash: 'a'.repeat(64), synced_at: 'now'
      };
    }, async findReportVersion() { return { source_data_version: 'v1', synced_at: 'now' }; }},
    workbookContextService: { resolve: () => ({ spreadsheetId: 'server-resolved-sheet' }) },
    httpError,
    send: (_res, status, body) => { response = { status, body }; return response; }
  });
  await service.handle('getPayrollExplanation', {
    method: 'GET', query: { month: '09/2026', employee: 'Chu Đức Mười', year: '2026', spreadsheetId: 'untrusted' }
  }, {}, {}, { role: 'operator' });
  assert.deepEqual(query, { spreadsheetId: 'server-resolved-sheet', month: '09/2026', key: 'chu-duc-muoi' });
  assert.equal(response.status, 200);
  assert.equal(response.body.explanation.status, 'matched');
  assert.equal(JSON.stringify(response.body).includes('server-resolved-sheet'), false);
});

test('payroll API denies shareholder and validates inputs before reading cache', async () => {
  let reads = 0;
  const service = createPayrollExplanationService({
    repository: { async findOne() { reads += 1; }, async findReportVersion() { reads += 1; } },
    workbookContextService: { resolve: () => ({ spreadsheetId: 'sheet' }) },
    httpError,
    send: () => {}
  });
  await assert.rejects(
    () => service.handle('getPayrollExplanation', { method: 'GET', query: { month: '09/2026', employee: 'An' } }, {}, {}, { role: 'shareholder' }),
    (error) => error.status === 403
  );
  await assert.rejects(
    () => service.handle('getPayrollExplanation', { method: 'GET', query: { month: '9/2026', employee: 'An' } }, {}, {}, { role: 'admin' }),
    (error) => error.status === 400
  );
  assert.equal(reads, 0);
  assert.equal(employeeKey('Chu Đức Mười'), 'chu-duc-muoi');
});

test('payroll API hides stale payload and asks the client to refresh when report version advances', async () => {
  let response;
  const service = createPayrollExplanationService({
    repository: {
      async findOne() {
        return {
          spreadsheet_id: 'sheet', report_month: '09/2026', employee_key: 'huy',
          payload: { contractVersion: PAYROLL_EXPLANATION_CONTRACT_VERSION, employeeName: 'Huy' },
          reconciliation_status: 'matched', source_data_version: 'old', source_hash: 'a'.repeat(64), synced_at: 'old'
        };
      },
      async findReportVersion() { return { source_data_version: 'new', synced_at: 'new' }; }
    },
    workbookContextService: { resolve: () => ({ spreadsheetId: 'sheet' }) },
    httpError,
    send: (_res, status, body) => { response = { status, body }; return response; }
  });
  await service.handle('getPayrollExplanation', { method: 'GET', query: { month: '09/2026', employee: 'Huy' } }, {}, {}, { role: 'admin' });
  assert.equal(response.status, 200);
  assert.equal(response.body.stale, true);
  assert.equal(response.body.explanation, null);
  assert.deepEqual(response.body.refresh.reasons, ['source-data-version']);
});
