const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createYearRolloverService } = require('../server/services/year-rollover-service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const httpError = (status, message) => Object.assign(new Error(message), { status });

test('year rollover proxy is admin-only and activation requires Vercel maintenance', async () => {
  const forwarded = [];
  const service = createYearRolloverService({
    appsScriptClient: { async forward(input) { forwarded.push(input); return { status: 200, body: { ok: true } }; } },
    assertAdmin(user) { if (user?.role !== 'admin') throw httpError(403, 'admin only'); },
    assertSameOrigin(req) { if (req.headers?.origin !== 'https://dongbac.vercel.app') throw httpError(403, 'same origin only'); },
    httpError,
    send(_res, status, body) { return { status, body }; }
  });
  await assert.rejects(() => service.handle('getYearRolloverStatus', { method: 'GET', query: {} }, {}, {}, { role: 'operator' }), { status: 403 });
  await assert.rejects(() => service.handle('manageYearRollover', { method: 'POST', headers: { origin: 'https://evil.example' }, body: { operation: 'preview' } }, {}, {}, { role: 'admin' }), { status: 403 });
  await assert.rejects(() => service.handle('manageYearRollover', { method: 'POST', headers: { origin: 'https://dongbac.vercel.app' }, body: { operation: 'activate' } }, {}, { businessWritesPaused: false }, { role: 'admin' }), { status: 409 });
  await service.handle('manageYearRollover', { method: 'POST', headers: { origin: 'https://dongbac.vercel.app' }, body: { operation: 'activate', sourceYear: '2026', targetYear: '2027' } }, {}, { businessWritesPaused: true }, { id: 'a', role: 'admin' });
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].requestUser.role, 'admin');
  await service.handle('manageYearRollover', { method: 'POST', headers: { origin: 'https://dongbac.vercel.app' }, body: { operation: 'canary', sourceYear: '2026', targetYear: '2027' } }, {}, { businessWritesPaused: false }, { id: 'a', role: 'admin' });
  assert.equal(forwarded[1].body.operation, 'canary');
  await service.handle('manageYearRollover', { method: 'POST', headers: { origin: 'https://dongbac.vercel.app' }, body: { operation: 'resume', sourceYear: '2026', targetYear: '2027' } }, {}, { businessWritesPaused: false }, { id: 'a', role: 'admin' });
  assert.equal(forwarded[2].body.operation, 'resume');
});

test('Apps Script preview runs read-only canary preflight without creating Drive copies', () => {
  const properties = new Map([
    ['ACTIVE_WORKBOOK_YEAR', '2026'], ['SPREADSHEET_ID_2026', 'transport-source'], ['FUND_SPREADSHEET_ID_2026', 'cashflow-source'],
    ['YEAR_ROLLOVER_MANIFEST_2027_JSON', JSON.stringify({
      approved: true, version: '$TARGET_YEAR-v1', targetYear: '$TARGET_YEAR', destinationFolderId: 'folder-id',
      names: { transport: 'Vận tải $TARGET_YEAR', cashflow: 'Thu chi $TARGET_YEAR' },
      operations: { clearRanges: [{ module: 'transport', sheet: 'NL_Dau', range: 'A3:J100' }], formulaReplacements: [], carryovers: [], snapshots: [], setValues: [] }
    })]
  ]);
  let driveCalls = 0;
  let copyCalls = 0;
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || '' }) },
    SpreadsheetApp: { openById: (id) => ({ getName: () => id === 'transport-source' ? 'Vận tải 2026' : 'Thu chi 2026' }) },
    DriveApp: {
      getFileById() { driveCalls += 1; return { getName: () => 'source', makeCopy() { copyCalls += 1; } }; },
      getFolderById() { driveCalls += 1; return { getName: () => 'destination' }; }
    },
    YearRolloverSnapshotService: { captureAll: () => [] },
    SupabaseHttpClient: {}, YearRolloverMigration: {}, LockService: {}, Utilities: {}, Date, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearWorkbookProvisioningService.gs')).runInContext(sandbox);
  const result = sandbox.YearWorkbookProvisioningService.preview('2026', '2027', { role: 'admin', username: 'owner' });
  assert.equal(result.dryRun, true);
  assert.equal(result.operationCounts.clearRanges, 1);
  assert.equal(result.operationCounts.snapshots, 0);
  assert.equal(result.manifestVersion, '2027-v1');
  assert.equal(result.targetWorkbookNames.transport, 'Vận tải 2027');
  assert.equal(result.preflight.driveReady, true);
  assert.equal(driveCalls, 3);
  assert.equal(copyCalls, 0);
  assert.equal(JSON.stringify(result).includes('transport-source'), false, 'Spreadsheet IDs must not reach the browser.');
});

test('canary runs as a tracked background job and only reports ready after cleanup', () => {
  const properties = new Map([
    ['ACTIVE_WORKBOOK_YEAR', '2026'], ['SPREADSHEET_ID_2026', 'transport-source'], ['FUND_SPREADSHEET_ID_2026', 'cashflow-source'],
    ['YEAR_ROLLOVER_MANIFEST_2027_JSON', JSON.stringify({
      approved: true, version: '2027-v1', targetYear: '2027', destinationFolderId: 'folder-id',
      names: { transport: 'Vận tải 2027', cashflow: 'Thu chi 2027' },
      operations: { clearRanges: [], formulaReplacements: [], carryovers: [], snapshots: [], setValues: [] }
    })]
  ]);
  const props = {
    getProperty: (key) => properties.get(key) || '',
    setProperty: (key, value) => properties.set(key, String(value)),
    deleteProperty: (key) => properties.delete(key)
  };
  const updates = [];
  const copies = [];
  let triggerDeleted = false;
  const trigger = { getHandlerFunction: () => 'runYearRolloverCanaryJob', getUniqueId: () => 'trigger-1' };
  const makeCopy = (name) => {
    const copy = {
      id: `${name}-id`, trashed: false,
      getId() { return this.id; },
      setTrashed(value) { this.trashed = value; },
      isTrashed() { return this.trashed; }
    };
    copies.push(copy);
    return copy;
  };
  const book = { getSheets: () => [], getName: () => 'book' };
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026' },
    PropertiesService: { getScriptProperties: () => props },
    SpreadsheetApp: { openById: () => book, flush() {} },
    DriveApp: {
      getFileById: () => ({ makeCopy }),
      getFolderById: () => ({ getName: () => 'destination' })
    },
    YearRolloverSnapshotService: { captureAll: () => [], applyAll() {} },
    SupabaseHttpClient: {
      readRows: () => [],
      upsertRows(_table, rows) { updates.push({ type: 'upsert', rows }); },
      updateRows(_table, patch) { updates.push({ type: 'update', patch }); }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => '11111111-1111-4111-8111-111111111111' },
    ScriptApp: {
      newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => trigger }) }) }),
      getProjectTriggers: () => [trigger],
      deleteTrigger() { triggerDeleted = true; }
    },
    YearRolloverMigration: {}, Date, JSON, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearWorkbookProvisioningService.gs')).runInContext(sandbox);

  const accepted = sandbox.YearWorkbookProvisioningService.canary('2026', '2027', { role: 'admin', username: 'owner' });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.status, 'planned');
  assert.equal(copies.length, 0, 'HTTP request must not perform Drive copies synchronously.');
  assert.equal(properties.get('YEAR_ROLLOVER_CANARY_ACTIVE_JOB'), accepted.runId);

  const completed = sandbox.YearWorkbookProvisioningService.runCanaryJob({ triggerUid: 'trigger-1' });
  assert.equal(completed.cleanedUp, true);
  assert.equal(copies.length, 2);
  assert.ok(copies.every((copy) => copy.trashed));
  assert.ok(updates.some((entry) => entry.type === 'update' && entry.patch.status === 'ready' && entry.patch.audit_report.cleanedUp === true));
  assert.equal(properties.has('YEAR_ROLLOVER_CANARY_ACTIVE_JOB'), false);
  assert.equal(triggerDeleted, true);
});

test('canary clears static values without rewriting formula cells', () => {
  const properties = new Map([
    ['ACTIVE_WORKBOOK_YEAR', '2026'], ['SPREADSHEET_ID_2026', 'transport-source'], ['FUND_SPREADSHEET_ID_2026', 'cashflow-source'],
    ['YEAR_ROLLOVER_MANIFEST_2027_JSON', JSON.stringify({
      approved: true, version: '2027-v1', targetYear: '2027', destinationFolderId: 'folder-id',
      names: { transport: 'Vận tải 2027', cashflow: 'Thu chi 2027' },
      operations: { clearRanges: [{ module: 'transport', sheet: 'NL_VanChuyen', range: 'A3:C4' }], formulaReplacements: [], carryovers: [], snapshots: [], setValues: [] }
    })]
  ]);
  const props = {
    getProperty: (key) => properties.get(key) || '',
    setProperty: (key, value) => properties.set(key, String(value)),
    deleteProperty: (key) => properties.delete(key)
  };
  const formulas = [['', '=A3', ''], ['', '', '=B4']];
  const clearedRanges = [];
  let legacyClearCalls = 0;
  let formulaWriteCalls = 0;
  const targetRange = {
    getFormulas: () => formulas.map((row) => row.slice()),
    getSheet: () => targetSheet,
    getRow: () => 3,
    getColumn: () => 1,
    getNumRows: () => 2,
    getNumColumns: () => 3,
    clearContent() { legacyClearCalls += 1; },
    setFormulas() { formulaWriteCalls += 1; }
  };
  const targetSheet = {
    getName: () => 'NL_VanChuyen',
    getRange: () => targetRange,
    getRangeList(ranges) {
      return { clearContent() { clearedRanges.push(...ranges); } };
    }
  };
  const sourceSheet = { getName: () => 'NL_VanChuyen' };
  const sourceBook = { getSheets: () => [sourceSheet], getName: () => 'source' };
  const targetBook = { getSheets: () => [targetSheet], getSheetByName: () => targetSheet, getName: () => 'target' };
  const copies = [];
  const makeCopy = (name) => {
    const copy = {
      id: `${name}-id`, trashed: false,
      getId() { return this.id; },
      setTrashed(value) { this.trashed = value; },
      isTrashed() { return this.trashed; }
    };
    copies.push(copy);
    return copy;
  };
  const trigger = { getHandlerFunction: () => 'runYearRolloverCanaryJob', getUniqueId: () => 'trigger-formulas' };
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026' },
    PropertiesService: { getScriptProperties: () => props },
    SpreadsheetApp: {
      openById(id) { return id.includes('__CANARY_ROLLOVER_2027_') ? targetBook : sourceBook; },
      flush() {}
    },
    DriveApp: {
      getFileById: () => ({ makeCopy }),
      getFolderById: () => ({ getName: () => 'destination' })
    },
    YearRolloverSnapshotService: { captureAll: () => [], applyAll() {} },
    SupabaseHttpClient: { readRows: () => [], upsertRows() {}, updateRows() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => '22222222-2222-4222-8222-222222222222' },
    ScriptApp: {
      newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => trigger }) }) }),
      getProjectTriggers: () => [trigger], deleteTrigger() {}
    },
    YearRolloverMigration: {}, Date, JSON, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearWorkbookProvisioningService.gs')).runInContext(sandbox);

  sandbox.YearWorkbookProvisioningService.canary('2026', '2027', { role: 'admin', username: 'owner' });
  const result = sandbox.YearWorkbookProvisioningService.runCanaryJob({ triggerUid: 'trigger-formulas' });

  assert.equal(result.cleanedUp, true);
  assert.deepEqual(clearedRanges.sort(), ['A3:A4', 'B4', 'C3']);
  assert.equal(legacyClearCalls, 0, 'The whole range must never be cleared when it contains formulas.');
  assert.equal(formulaWriteCalls, 0, 'Existing formulas must never be rewritten.');
  assert.ok(copies.every((copy) => copy.trashed));
});

test('registered workbooks resume in two background phases and formula replacement is retry-safe', () => {
  const properties = new Map([
    ['ACTIVE_WORKBOOK_YEAR', '2026'], ['SPREADSHEET_ID_2026', 'transport-source'], ['FUND_SPREADSHEET_ID_2026', 'cashflow-source'],
    ['SPREADSHEET_ID_2027', 'transport-target'], ['FUND_SPREADSHEET_ID_2027', 'cashflow-target'], ['CASHFLOW_SPREADSHEET_ID_2027', 'cashflow-target'],
    ['YEAR_ROLLOVER_MANIFEST_2027_JSON', JSON.stringify({
      approved: true, version: '2027-v1', targetYear: '2027', destinationFolderId: 'folder-id',
      names: { transport: 'Vận tải 2027', cashflow: 'Thu chi 2027' },
      operations: {
        clearRanges: [], carryovers: [], snapshots: [], setValues: [],
        formulaReplacements: [{ module: 'transport', sheet: 'SYS_ThuChiRaw', range: 'A1:B1', from: '$SOURCE_CASHFLOW_ID', to: '$TARGET_CASHFLOW_ID', required: true }]
      }
    })]
  ]);
  const props = {
    getProperty: (key) => properties.get(key) || '',
    setProperty: (key, value) => properties.set(key, String(value)),
    setProperties(values) { Object.entries(values).forEach(([key, value]) => properties.set(key, String(value))); },
    deleteProperty: (key) => properties.delete(key)
  };
  let formulaWrites = 0;
  const formulaRange = {
    getFormulas: () => [['=IMPORTRANGE("cashflow-target","A:A")', '']],
    getValues: () => [['', '']],
    getNumRows: () => 1,
    getNumColumns: () => 2,
    setValues() { formulaWrites += 1; }
  };
  const targetTransport = { getSheetByName: () => ({ getRange: () => formulaRange }) };
  const emptyBook = { getSheetByName: () => null };
  const updates = [];
  const triggers = [];
  let uuid = 0;
  let triggerSequence = 0;
  let auditCalls = 0;
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026' },
    PropertiesService: { getScriptProperties: () => props },
    SpreadsheetApp: {
      openById(id) { return id === 'transport-target' ? targetTransport : emptyBook; },
      flush() {}
    },
    DriveApp: {},
    YearRolloverSnapshotService: { captureAll: () => [], applyAll() {} },
    YearRolloverMigration: {
      auditSteps: () => ['preflight', 'queues'],
      auditStep: (_sourceYear, _targetYear, step) => {
        auditCalls += 1;
        if (auditCalls === 1) throw new Error('transient Google read');
        return {
          step, blockers: [], warnings: [], transportStructure: null, fundStructure: null,
          details: step === 'queues'
            ? { queues: { pending: [], errors: [] } }
            : {}
        };
      },
      combineAuditSteps: (_sourceYear, _targetYear, parts) => ({
        ok: parts.length === 2, sourceYear: '2026', targetYear: '2027', blockers: [], warnings: [],
        details: { formulaRisks: { oldWorkbookReferences: [], sourceYearReferences: [], skippedSheets: [] }, queues: { pending: [], errors: [] } }
      })
    },
    SupabaseHttpClient: {
      readRows: () => [],
      upsertRows(table, rows) { updates.push({ type: 'upsert', table, rows }); },
      updateRows(table, patch, filters) { updates.push({ type: 'update', table, patch, filters }); }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => `33333333-3333-4333-8333-${String(++uuid).padStart(12, '0')}` },
    ScriptApp: {
      newTrigger(handler) {
        return { timeBased: () => ({ after: () => ({ create() {
          const trigger = { handler, uid: `${handler}-${++triggerSequence}`, getHandlerFunction: () => handler, getUniqueId() { return this.uid; } };
          triggers.push(trigger);
          return trigger;
        } }) }) };
      },
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger(trigger) { const index = triggers.indexOf(trigger); if (index >= 0) triggers.splice(index, 1); }
    },
    Date, JSON, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearWorkbookProvisioningService.gs')).runInContext(sandbox);

  const accepted = sandbox.YearWorkbookProvisioningService.resume('2026', '2027', { role: 'admin', username: 'owner' });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.status, 'planned');
  assert.equal(triggers[0].handler, 'runYearRolloverProvisionJob');

  const prepareTrigger = triggers.find((trigger) => trigger.handler === 'runYearRolloverProvisionJob');
  const applied = sandbox.YearWorkbookProvisioningService.runProvisionJob({ triggerUid: prepareTrigger.uid });
  assert.equal(applied.status, 'copying');
  assert.deepEqual(JSON.parse(JSON.stringify(applied.progress)), { completed: 1, total: 1 });
  assert.equal(formulaWrites, 0, 'A retry must not rewrite a formula that already contains the target workbook ID.');

  const finalizeTrigger = triggers.find((trigger) => trigger.handler === 'runYearRolloverProvisionJob');
  const prepared = sandbox.YearWorkbookProvisioningService.runProvisionJob({ triggerUid: finalizeTrigger.uid });
  assert.equal(prepared.status, 'auditing');
  assert.ok(triggers.some((trigger) => trigger.handler === 'runYearRolloverAuditJob'));

  let auditTrigger = triggers.find((trigger) => trigger.handler === 'runYearRolloverAuditJob');
  const retrying = sandbox.YearWorkbookProvisioningService.runAuditJob({ triggerUid: auditTrigger.uid });
  assert.equal(retrying.retrying, true);
  assert.equal(retrying.step, 'preflight');
  auditTrigger = triggers.find((trigger) => trigger.handler === 'runYearRolloverAuditJob');
  const auditStepOne = sandbox.YearWorkbookProvisioningService.runAuditJob({ triggerUid: auditTrigger.uid });
  assert.deepEqual(JSON.parse(JSON.stringify(auditStepOne.progress)), { completed: 1, total: 2, step: 'preflight' });
  auditTrigger = triggers.find((trigger) => trigger.handler === 'runYearRolloverAuditJob');
  const auditStepTwo = sandbox.YearWorkbookProvisioningService.runAuditJob({ triggerUid: auditTrigger.uid });
  assert.deepEqual(JSON.parse(JSON.stringify(auditStepTwo.progress)), { completed: 2, total: 2, step: 'queues' });
  auditTrigger = triggers.find((trigger) => trigger.handler === 'runYearRolloverAuditJob');
  const audited = sandbox.YearWorkbookProvisioningService.runAuditJob({ triggerUid: auditTrigger.uid });
  assert.equal(audited.status, 'ready');
  assert.ok(updates.some((entry) => entry.table === 'workbook_contexts' && entry.patch?.lifecycle_status === 'ready'));
  assert.ok(updates.some((entry) => entry.table === 'workbook_rollover_runs' && entry.patch?.status === 'ready'));
  assert.equal(properties.has('YEAR_ROLLOVER_ACTIVE_JOB'), false);
  assert.equal([...properties.keys()].some((key) => key.includes('_AUDIT_RESULT_')), false);
});

test('real workbook provisioning request queues background work before any Drive copy', () => {
  const properties = new Map([
    ['ACTIVE_WORKBOOK_YEAR', '2026'], ['SPREADSHEET_ID_2026', 'transport-source'], ['FUND_SPREADSHEET_ID_2026', 'cashflow-source'],
    ['YEAR_ROLLOVER_MANIFEST_2027_JSON', JSON.stringify({
      approved: true, version: '2027-v1', targetYear: '2027', destinationFolderId: 'folder-id',
      names: { transport: 'Vận tải 2027', cashflow: 'Thu chi 2027' },
      operations: { clearRanges: [], formulaReplacements: [], carryovers: [], snapshots: [], setValues: [] }
    })]
  ]);
  const props = {
    getProperty: (key) => properties.get(key) || '',
    setProperty: (key, value) => properties.set(key, String(value)),
    deleteProperty: (key) => properties.delete(key)
  };
  let driveCalls = 0;
  const triggers = [];
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026' }, PropertiesService: { getScriptProperties: () => props },
    SpreadsheetApp: {}, DriveApp: { getFileById() { driveCalls += 1; throw new Error('Drive must not run in HTTP request'); } },
    YearRolloverSnapshotService: {}, YearRolloverMigration: {},
    SupabaseHttpClient: { readRows: () => [], upsertRows() {}, updateRows() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => '44444444-4444-4444-8444-444444444444' },
    ScriptApp: {
      newTrigger(handler) { return { timeBased: () => ({ after: () => ({ create() { triggers.push(handler); } }) }) }; },
      getProjectTriggers: () => []
    },
    Date, JSON, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearWorkbookProvisioningService.gs')).runInContext(sandbox);

  const accepted = sandbox.YearWorkbookProvisioningService.provision('2026', '2027', { role: 'admin', username: 'owner' });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.status, 'planned');
  assert.equal(driveCalls, 0);
  assert.deepEqual(triggers, ['runYearRolloverProvisionJob']);
});

test('approved 2027 rollout works from legacy 2026 configuration without a setup helper', () => {
  const properties = new Map([
    ['ACTIVE_WORKBOOK_YEAR', '2026'],
    ['ACTIVE_SPREADSHEET_ID', 'transport-legacy'],
    ['FUND_SPREADSHEET_ID', 'cashflow-legacy']
  ]);
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026', spreadsheetId: 'transport-default' },
    FundService: { resolveFundSpreadsheetId: () => 'cashflow-default' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || '' }) },
    SpreadsheetApp: { openById: (id) => ({
      getName: () => id === 'transport-legacy' ? 'Vận tải 2026' : 'Thu chi 2026',
      getSheetByName: () => ({ getRange: () => ({
        getFormulas: () => [['cashflow-legacy']],
        getNumRows: () => 1,
        getNumColumns: () => 1
      }) })
    }) },
    DriveApp: {
      getFileById: () => ({ getName: () => 'source' }),
      getFolderById: () => ({ getName: () => 'destination' })
    },
    YearRolloverSnapshotService: { captureAll: () => [] },
    SupabaseHttpClient: {}, YearRolloverMigration: {}, LockService: {}, Utilities: {}, Date, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearWorkbookProvisioningService.gs')).runInContext(sandbox);
  const result = sandbox.YearWorkbookProvisioningService.preview('2026', '2027', { role: 'admin' });
  assert.equal(result.manifestVersion, 'year-rollover-2026-2027-v3');
  assert.equal(result.operationCounts.clearRanges, 12);
  assert.equal(result.operationCounts.snapshots, 2);
  assert.equal(result.preflight.formulaReplacementRanges, 1);
  assert.equal(result.targetWorkbookNames.transport, 'VanTaiDongBac_2027');
  assert.equal(JSON.stringify(result).includes('transport-legacy'), false);
  assert.equal(JSON.stringify(result).includes('cashflow-legacy'), false);
});

test('provisioning source enforces copy-only mutation, Drive scope and server-only IDs', () => {
  const source = read('YearWorkbookProvisioningService.gs');
  const manifest = JSON.parse(read('appsscript.json'));
  assert.match(source, /sourceTransportFile\.makeCopy/);
  assert.match(source, /sourceCashflowFile\.makeCopy/);
  assert.match(source, /exactRange_\(books\.target/);
  assert.match(source, /manifest\.approved !== true/);
  assert.match(source, /Năm đích đã có workbook được đăng ký/);
  assert.match(source, /SupabaseHttpClient\.callRpc\('activate_workbook_context'/);
  assert.match(source, /preserveActivationState/);
  assert.match(read('YearRolloverMigration.gs'), /Kích hoạt trực tiếp đã tắt/);
  assert.doesNotMatch(source, /getActiveSpreadsheet\(/);
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
  assert.match(source, /YearRolloverSnapshotService\.captureAll/);
  assert.match(source, /YearRolloverSnapshotService\.applyAll/);
  assert.match(source, /__CANARY_ROLLOVER_/);
  assert.match(source, /trashCanary_/);
  assert.match(source, /result\.cleanedUp = true/);
  assert.match(source, /Canary thất bại tại pha/);
  assert.match(source, /inspectCanaryReadiness_/);
  assert.match(source, /ScriptApp\.newTrigger\(CANARY_TRIGGER_HANDLER\)/);
  assert.match(source, /runYearRolloverCanaryJob/);
  assert.match(source, /runYearRolloverProvisionJob/);
  assert.match(source, /runYearRolloverAuditJob/);
  assert.match(source, /return queueRolloverJob_\('provision'/);
  assert.match(source, /job\.applyIndex = applyIndex \+ 1/);
  assert.match(source, /replaceRolloverTrigger_\(event, ROLLOVER_PREPARE_TRIGGER_HANDLER, ROLLOVER_PREPARE_TRIGGER_HANDLER\)/);
  assert.match(source, /YearRolloverMigration\.auditSteps\(years\.sourceYear, years\.targetYear\)/);
  assert.match(source, /auditResultKey_\(runId, auditIndex\)/);
  assert.match(source, /7 \* 60 \* 1000/);
  const auditSource = read('YearRolloverMigration.gs');
  assert.match(auditSource, /appendFormulaSteps_\(steps, 'formulaTransport'/);
  assert.match(auditSource, /FORMULA_SHEETS_PER_STEP = 3/);
  assert.match(auditSource, /AUDIT_TAIL_STEPS = \['staleTransport', 'staleFund', 'carryover', 'queues'\]/);
});

test('rollover snapshots compact open loans, debts and salary balances without copying yearly history', () => {
  const sandbox = vm.createContext({ Date, console, isFinite });
  new vm.Script(read('YearRolloverSnapshotService.gs')).runInContext(sandbox);
  sandbox.FundService = {
    getFundOverview() { return { metrics: [{ key: 'currentBalance', value: 300 }] }; },
    getFundLoanOverview() {
      return {
        loans: [{ code: 'L1', currentOutstanding: 100 }],
        recentRows: [{ code: 'L1', loanKey: 'L1', type: 'Vay', partner: 'AQ', method: 'Tài khoản', content: 'Gốc', nonFund: false, dateText: '01/05/2026' }]
      };
    }
  };
  const debtValues = [
    [1, new Date(2026, 4, 1), 'Doanh thu', '', '', 100, 'Tường', 'Đối tác', 'Nợ', 'Có', '', false, 50],
    [2, new Date(2026, 4, 2), '', 'Dầu', '', 200, 'Tường', 'Đối tác 2', 'Nợ phải trả', 'Có', '', false, 75]
  ];
  const debtDisplays = [
    ['1', '01/05/2026', 'Doanh thu', '', '', '100', 'Tường', 'Đối tác', 'Nợ', 'Có', '', 'FALSE', '50'],
    ['2', '02/05/2026', '', 'Dầu', '', '200', 'Tường', 'Đối tác 2', 'Nợ phải trả', 'Có', '', 'FALSE', '75']
  ];
  const salaryValues = [
    ['S1', new Date(2026, 6, 1), 'A', 'Âm cần thu', 10, new Date(2026, 7, 1), 2, 10, 8, '', 'Lần 1'],
    ['S1', new Date(2026, 6, 1), 'A', 'Âm cần thu', 10, new Date(2026, 8, 1), 5, 8, 3, '', 'Lần 2']
  ];
  const makeRange = (values, displays = values) => ({ getValues: () => values, getDisplayValues: () => displays, getRow: () => 2 });
  const books = { source: {
    cashflow: { getSheetByName: () => ({ getRange: () => makeRange(debtValues, debtDisplays) }) },
    transport: { getSheetByName: () => ({ getRange: () => makeRange(salaryValues) }) }
  } };
  const snapshots = sandbox.YearRolloverSnapshotService.captureAll([
    { kind: 'fund', module: 'cashflow', transactionSheet: 'NHAP_THUCHI', transactionRange: 'A2:O20', openingBalanceMode: 'cash' },
    { kind: 'salary', module: 'transport', sheet: 'NL_SoDuLuong', range: 'A2:Q20' }
  ], { sourceYear: '2026', targetYear: '2027' }, books);
  assert.equal(snapshots[0].cashOpening, 200, 'opening base must exclude carried fund-affecting debt principal');
  assert.equal(snapshots[0].loanRows.length, 1);
  assert.equal(snapshots[0].debtRows[0][5], 50);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots[0].debtRows.map((row) => String(row[0])))), ['270101000001', '270101000002']);
  assert.ok(snapshots[0].debtRows.every((row) => Number.isSafeInteger(row[0])));
  assert.equal(snapshots[1].rows.length, 1);
  assert.equal(snapshots[1].rows[0].left[4], 3);
  assert.equal(snapshots[1].rows[0].left[1].getFullYear(), 2027);
});

test('debt snapshot temporarily removes stale category validation and restores the Thu/Chi rules', () => {
  const events = [];
  let categoryValidationCleared = false;

  const makeRange = (label, row, column, rows, columns, sheet) => ({
    getSheet: () => sheet,
    getRow: () => row,
    getColumn: () => column,
    getNumRows: () => rows,
    getNumColumns: () => columns,
    clearDataValidations() {
      categoryValidationCleared = true;
      events.push({ type: 'clear-validations', label });
      return this;
    },
    setValues(values) {
      if (label === 'debt-write' && !categoryValidationCleared) throw new Error('stale category validation rejected blank Thu/Chi cell');
      events.push({ type: 'set-values', label, values });
      return this;
    },
    setDataValidations(validations) {
      events.push({ type: 'set-validations', label, validations });
      return this;
    },
    setValue(value) { events.push({ type: 'set-value', label, value }); return this; },
    setFormula(formula) { events.push({ type: 'set-formula', label, formula }); return this; },
    setNumberFormat() { return this; },
    offset(rowOffset, columnOffset, numRows, numColumns) {
      const nextLabel = label === 'debt-write' && columnOffset === 2 ? 'debt-categories' : `${label}:offset`;
      return makeRange(nextLabel, row + rowOffset, column + columnOffset, numRows, numColumns, sheet);
    }
  });

  const transactionSheet = {
    getRange(first, column, rows, columns) {
      if (typeof first === 'string') return makeRange('transaction-manifest', 2, 1, 19, 15, transactionSheet);
      if (column === 1 && columns === 12) return makeRange('debt-write', first, column, rows, columns, transactionSheet);
      return makeRange(`transaction-${first}-${column}`, first, column, rows || 1, columns || 1, transactionSheet);
    }
  };
  const loanSheet = {
    getRange: () => makeRange('loan-manifest', 2, 1, 19, 15, loanSheet)
  };
  const settingsSheet = {
    getRange: (a1) => makeRange(`settings-${a1}`, 1, 1, 1, 1, settingsSheet)
  };
  const reportSheet = {
    getRange: (a1) => makeRange(`report-${a1}`, 1, 1, 1, 1, reportSheet)
  };
  const targetBook = {
    getSheetByName(name) {
      return {
        NHAP_THUCHI: transactionSheet,
        NHAP_VAY: loanSheet,
        CAIDAT: settingsSheet,
        BC_THUCHI: reportSheet
      }[name] || null;
    }
  };
  const newDataValidation = () => {
    const rule = {};
    return {
      setAllowInvalid(value) { rule.allowInvalid = value; return this; },
      setHelpText(value) { rule.helpText = value; return this; },
      requireValueInRange(range, showDropdown) { rule.range = range; rule.showDropdown = showDropdown; return this; },
      build() { return rule; }
    };
  };
  const sandbox = vm.createContext({ Date, console, isFinite, SpreadsheetApp: { newDataValidation } });
  new vm.Script(read('YearRolloverSnapshotService.gs')).runInContext(sandbox);
  const operation = {
    kind: 'fund', module: 'cashflow', transactionSheet: 'NHAP_THUCHI', transactionRange: 'A2:O20',
    loanSheet: 'NHAP_VAY', loanRange: 'A2:O20', settingsSheet: 'CAIDAT', cashOpeningRange: 'R3',
    bankOpeningRange: 'R4', dataStartDateRange: 'R6', loanStartDateRange: 'R7',
    categoryValidation: {
      settingsSheet: 'CAIDAT', incomeRange: 'E3:E13', expenseRange: 'H3:H38',
      mutualExclusionSheet: 'BC_THUCHI', mutualExclusionRange: 'O1:O2'
    }
  };
  sandbox.YearRolloverSnapshotService.applyAll([{
    kind: 'fund', operation, cashOpening: 0, bankOpening: 0, targetDate: new Date(2027, 0, 1), loanRows: [],
    debtRows: [
      [270101000001, new Date(2027, 0, 1), 'Doanh thu', '', 'TM', 50, 'Tường', 'Đối tác', 'Nợ thu', 'Có', '', false],
      [270101000002, new Date(2027, 0, 1), '', 'Dầu', 'TM', 75, 'Tường', 'Đối tác 2', 'Nợ chi', 'Có', '', false]
    ]
  }], { target: { cashflow: targetBook } });

  const clearIndex = events.findIndex((event) => event.type === 'clear-validations');
  const writeIndex = events.findIndex((event) => event.type === 'set-values' && event.label === 'debt-write');
  const restoreIndex = events.findIndex((event) => event.type === 'set-validations');
  assert.ok(clearIndex >= 0 && clearIndex < writeIndex && writeIndex < restoreIndex);
  const restored = events[restoreIndex].validations;
  assert.equal(restored[0][0].range.getSheet(), settingsSheet);
  assert.equal(restored[0][0].showDropdown, true);
  assert.equal(restored[0][1].helpText, 'Chỉ nhập THU hoặc CHI');
  assert.equal(restored[0][1].showDropdown, false);
  assert.equal(restored[1][0].helpText, 'Chỉ nhập THU hoặc CHI');
  assert.equal(restored[1][1].range.getSheet(), settingsSheet);
  assert.equal(restored[1][1].showDropdown, true);
});

test('approved 2027 manifest resets exact inputs and static report periods', () => {
  const manifest = JSON.parse(read('artifacts/year-rollover-manifest-2027.json'));
  assert.equal(manifest.approved, true);
  assert.deepEqual(manifest.audit.sourceYearFormulaAllowlist.map((item) => `${item.sheet}!${item.range}`), [
    'DM_ThamSo!C19', 'DM_ThamSo!C21', 'DM_ThamSo!C22', 'DM_ThamSo!C24',
    'DM_ThamSo!C25', 'DM_ThamSo!C26', 'PHANBO_VAY!A8', 'SYS_CHOT!F5'
  ]);
  assert.equal(manifest.operations.clearRanges.length, 12);
  assert.equal(manifest.operations.snapshots.length, 2);
  assert.deepEqual(manifest.operations.setValues.map((item) => `${item.sheet}!${item.range}`), [
    'BC_TongQuan!B1', 'BC_ChotLuong!B3', 'CHOT_CONGNO!B3', 'BC_THUCHI!I1'
  ]);
  assert.equal(manifest.operations.formulaReplacements[0].range, 'A1:Y1');
  assert.equal(manifest.operations.formulaReplacements[0].from, '$SOURCE_CASHFLOW_ID');
  const catalogSandbox = vm.createContext({ JSON });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(catalogSandbox);
  assert.deepEqual(
    JSON.parse(JSON.stringify(catalogSandbox.YearRolloverManifestCatalog.get('2027'))),
    manifest,
    'The reviewed artifact and bundled server manifest must remain identical.'
  );
});

test('rollover audit compares the projected target-day Fund balance before the new year begins', () => {
  const properties = new Map([
    ['SPREADSHEET_ID_2026', 'transport-source'], ['SPREADSHEET_ID_2027', 'transport-target'],
    ['FUND_SPREADSHEET_ID_2026', 'fund-source'], ['FUND_SPREADSHEET_ID_2027', 'fund-target']
  ]);
  const salarySheet = { getLastRow: () => 1000 };
  const sourceTransport = { getSheetByName: (name) => name === 'NL_SoDuLuong' ? salarySheet : null };
  const targetTransport = { getSheetByName: (name) => name === 'NL_SoDuLuong' ? salarySheet : null };
  const sourceFund = { key: 'source' };
  const targetFund = { key: 'target' };
  const sourceBalance = 22279536;
  const loanOutstanding = 1891335020;
  const targetOpening = sourceBalance - loanOutstanding;
  const summary = { count: 9, receivable: 2427304198, payable: 124058237 };
  const salarySummary = { count: 1, total: 8000000, balances: { 'SD-202607-CDM': 8000000 } };
  const sandbox = vm.createContext({
    APP_CONFIG: { year: '2026', spreadsheetId: '', sheets: {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || '' }) },
    SpreadsheetApp: { openById: (id) => id === 'transport-source' ? sourceTransport : targetTransport },
    FundService: {
      getFundOverview: (year) => ({ metrics: [{ key: 'currentBalance', value: year === '2026' ? sourceBalance : targetOpening }] }),
      getFundFormOptions: () => ({ settings: { cashOpening: targetOpening, bankOpening: 0 } }),
      getFundLoanOverview: (year) => ({
        metrics: [{ key: 'outstanding', value: loanOutstanding }],
        recentRows: year === '2027' ? [{ type: 'Vay', amount: loanOutstanding, nonFund: false }] : []
      }),
      getFundSpreadsheet_: (year) => year === '2026' ? sourceFund : targetFund
    },
    YearRolloverSnapshotService: {
      debtSummary: () => summary,
      salarySummary: () => salarySummary
    },
    Date, JSON, Math, Object, String, Number, Boolean, isFinite, console
  });
  new vm.Script(read('YearRolloverManifestCatalog.gs')).runInContext(sandbox);
  new vm.Script(read('YearRolloverMigration.gs')).runInContext(sandbox);
  const result = sandbox.YearRolloverMigration.auditStep('2026', '2027', 'carryover');
  const fund = result.details.carryover.fund;
  assert.deepEqual(JSON.parse(JSON.stringify(result.blockers)), []);
  assert.equal(fund.targetBalance, targetOpening, 'today-based target balance excludes the future-dated rollover loan');
  assert.equal(fund.targetFundLoanNet, loanOutstanding);
  assert.equal(fund.targetProjectedBalance, sourceBalance);
  assert.equal(fund.balanceMatches, true);
});

test('Settings exposes the year wizard only to admins and never renders workbook IDs', () => {
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const wizard = read('next-shell/components/settings/YearRolloverSettings.tsx');
  assert.match(settings, /isAdmin \? \[\{ key: 'years'/);
  assert.match(settings, /\{isAdmin \? <div id="settings-panel-years"/);
  assert.match(settings, /activeTab === 'years' \? <YearRolloverSettings/);
  assert.match(wizard, /'getYearRolloverStatus'/);
  assert.match(wizard, /'manageYearRollover'/);
  assert.match(wizard, /'preview' \| 'canary' \| 'provision'/);
  assert.match(wizard, /Chạy canary an toàn/);
  assert.match(wizard, /Xác nhận chạy canary/);
  assert.match(wizard, /result\?\.canary && result\.cleanedUp/);
  assert.match(wizard, /Canary đang chạy nền/);
  assert.match(wizard, /next\.accepted/);
  assert.match(wizard, /Boolean\(busy\) \|\| rolloverRunning/);
  assert.match(wizard, /Tiếp tục chuẩn bị/);
  assert.match(wizard, /context\?\.status !== 'ready'/);
  assert.match(wizard, /Lỗi chuyển năm/);
  assert.match(wizard, /setStatus\(next\);\s+setLastError\(''\);/);
  assert.match(wizard, /activationText !== targetYear/);
  assert.doesNotMatch(wizard, /spreadsheetId|transport_spreadsheet_id|cashflow_spreadsheet_id/);
});

test('migration 020 keeps registry server-only and activation transactional', () => {
  const sql = read('supabase/migrations/020_year_rollover_self_service.sql');
  assert.match(sql, /create table if not exists public\.workbook_contexts/);
  assert.match(sql, /create table if not exists public\.workbook_rollover_runs/);
  assert.match(sql, /workbook_contexts_one_active_idx/);
  assert.match(sql, /revoke all on table public\.workbook_contexts from anon, authenticated/);
  assert.match(sql, /source workbook context is not active/);
  assert.match(sql, /lost HTTP response after commit is safe to retry/);
  assert.match(sql, /activate_workbook_context/);
  assert.doesNotMatch(sql, /grant select[^;]+authenticated/i);
});
