const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const { createWriteCommandService } = require('../server/services/write-command-service');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function numbers() {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read('next-shell/lib/platform/numeric-input.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, { module, exports: module.exports });
  return module.exports;
}

function sheetHarness(volume = '') {
  const headers = ['Ngày', 'Tháng', 'Biển số xe', 'Dự án', 'Số chuyến', 'Số phiếu', 'Khối lượng', 'Ghi chú', '_SYS_CHECK'];
  const values = ['2026-10-06', '10/2026', 'TEST', 'Synthetic', 6, 'old', volume, '', 'Khớp'];
  let writes = 0;
  const sheet = {
    getLastRow: () => 3, getLastColumn: () => headers.length,
    getRange(row, column, height = 1, width = 1) {
      return {
        getValues: () => [(row === 2 ? headers : values).slice(column - 1, column - 1 + width)],
        getFormulas: () => [['', '=month', '', '', '', '', '', '', '=helper'].slice(column - 1, column - 1 + width)],
        setValues(rows) { assert.equal(row, 3); assert.equal(height, 1); writes++; rows[0].forEach((v, i) => { values[column - 1 + i] = v; }); }
      };
    }
  };
  const sandbox = vm.createContext({
    APP_CONFIG: { spreadsheetId: 'isolated', year: '2026', sheets: { vanChuyen: { name: 'NL_VanChuyen', headerRow: 2 } } },
    SpreadsheetApp: { openById: (id) => { assert.equal(id, 'isolated'); return { getSheetByName: () => sheet }; } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ setProperty() {} }) }
  });
  for (const file of ['NormalizationUtils.gs', 'ValidationService.gs', 'SheetWritePreserver.gs', 'SheetService.gs']) vm.runInContext(read(file), sandbox);
  return { service: sandbox.SheetService, validation: sandbox.ValidationService, values, headers, writes: () => writes };
}

test('actual Manage openEdit -> payload -> Sheet retains blank volume, helper and month when only tickets change', async () => {
  const n = numbers();
  const h = sheetHarness();
  // Execute the actual editor initialization; no copy of its numeric algorithm.
  const source = read('next-shell/components/manage/ManageReadOnlyModule.tsx').match(/const openEdit=\(row:ManageRow\)=>\{(.*?)\};/s)[1];
  let draft;
  const sandbox = {
    row: { values: h.values }, headers: h.headers, sheet: 'NL_VanChuyen',
    normalize: (s) => s === 'Tháng' ? 'thang' : s,
    formulaColumn: (s) => s.startsWith('_SYS_'), numericInputHeader: (s) => ['Khối lượng', 'Số chuyến'].includes(s),
    formatStoredNumberInput: n.formatStoredNumberInput,
    setFormError() {}, setEditing() {}, setDraft: (v) => { draft = v; }, setEditBaseline() {}
  };
  vm.runInNewContext(source, sandbox);
  assert.equal(draft['Khối lượng'], ''); draft['Số phiếu'] = 'new';
  const rowData = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, sandbox.numericInputHeader(key) ? n.normalizeVietnameseNumberInput(value) : value]));
  const svc = createWriteCommandService({
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    workbookContextService: { assertWritable: () => ({ year: '2026', spreadsheetId: 'isolated' }) },
    repository: { enqueue: async (_config, intent) => intent }, send: (_res, _status, body) => body
  });
  const intent = await svc.handle('saveSheetRow', { method: 'POST', body: { sheetName: 'NL_VanChuyen', rowData } }, {}, {}, { id: 'synthetic' });
  const result = h.service.saveSheetRow('NL_VanChuyen', 3, intent.payload.rowData, Object.fromEntries(h.headers.map((header, i) => [header, h.values[i]])));
  assert.equal(result.ok, true); assert.equal(h.values[5], 'new'); assert.equal(h.values[6], '');
  assert.equal(h.values[1], '10/2026'); assert.equal(h.values[8], 'Khớp'); assert.ok(h.writes() > 0);
  // Independent native formula contract: blank uses vehicle capacity * trips.
  assert.ok(Math.abs((h.values[6] === '' ? 24.82 * h.values[4] : h.values[6]) - 148.92) < 1e-9);
});

test('stored numeric editor round trips blanks, zero, negatives and fractional precision without a KPI rounding loss', () => {
  const n = numbers();
  for (const value of ['', null, undefined, '  ']) assert.equal(n.formatStoredNumberInput(value), '');
  for (const value of [0, '0', 1.234, 148.923456, -1234.56789, '1234.50000']) {
    assert.equal(n.normalizeVietnameseNumberInput(n.formatStoredNumberInput(value)), String(value));
  }
  assert.equal(n.formatStoredNumberInput('unknown'), 'unknown');
});

test('API and Sheet backend reject zero/negative/nonfinite volume before enqueue/write, retaining explicit zero in other fields', async () => {
  let enqueues = 0;
  const svc = createWriteCommandService({ httpError: (status, message) => Object.assign(new Error(message), { status }),
    workbookContextService: { assertWritable: () => ({ year: '2026', spreadsheetId: 'isolated' }) },
    repository: { enqueue: async () => { enqueues++; return {}; } }, send() {} });
  const h = sheetHarness();
  for (const volume of [0, '0', -1, 'Infinity', 'NaN', Infinity, true, {}, '1,2', '1e999']) {
    await assert.rejects(svc.handle('saveSheetRow', { method: 'POST', body: { sheetName: 'NL_VanChuyen', rowData: { 'Khối lượng': volume } } }, {}, {}), { status: 400 });
    assert.throws(() => h.service.saveSheetRow('NL_VanChuyen', 3, { 'Khối lượng': volume }), /Khối lượng/);
  }
  assert.equal(enqueues, 0); assert.equal(h.writes(), 0);
  for (const volume of ['', null, '1.234', 148.92]) {
    await svc.handle('saveSheetRow', { method: 'POST', body: { sheetName: 'NL_VanChuyen', rowData: { 'Khối lượng': volume } } }, {}, {});
  }
  h.validation.validateManageRow('NL_SoDuLuong', { 'Số điều chỉnh': 0 });
  const entry = { date: '2026-10-06', vehicle: 'TEST', project: 'Synthetic', trips: 6, actualVolume: '' };
  assert.equal(h.validation.buildRows('vanChuyen', [entry], { vehicles: [], projects: [] }).values[0][7], '');
  assert.ok(h.validation.buildRows('vanChuyen', [{ ...entry, actualVolume: Infinity }], { vehicles: [], projects: [] }).errors.length);
});

function queueHarness() {
  let now = 1000000;
  const props = new Map();
  const sandbox = vm.createContext({});
  for (const file of ['ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs']) vm.runInContext(read(file), sandbox);
  const context = { nowMillis: () => now, nowISOString: () => new Date(now).toISOString(),
    normalizeYearMonthKey: (s) => String(s), withLock: (fn) => fn(),
    getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) };
  return { queue: sandbox.ManualReportRefreshQueueService, worker: sandbox.TransportRefreshWorker, context, props, advance: (ms) => { now += ms; } };
}

test('refresh clears an old cached month after its last source row moves or is deleted, with paginated discovery and retry on cache failure', () => {
  const h = queueHarness();
  const sandbox = vm.createContext({}); vm.runInContext(read('ManageSyncService.gs'), sandbox);
  const manage = sandbox.ManageSyncService; const published = [];
  let fail = false; let sourceHasRows = true; const offsets = [];
  const mc = { year: '2026', clean: String, normalizeYearMonthKey: (v) => /^\d{4}-\d{2}$/.test(v) ? v : '',
    parseDateValue: () => null, getHeaderRow: () => 2,
    getSheet: () => ({ getLastColumn: () => 2, getLastRow: () => sourceHasRows ? 3 : 2,
      getRange: (row) => ({ getDisplayValues: () => [['Ngày', 'Tháng']], getValues: () => row === 3 ? [['2026-10']] : [] }) }),
    readCacheRows: (table, query) => {
      assert.equal(table, 'manage_data_bundles'); assert.equal(query.sheet_name, 'eq.2026:NL_VanChuyen');
      assert.equal(query.select, 'filter_key'); assert.equal(query.filter_key, 'like.month:*'); offsets.push(query.offset);
      if (fail) throw new Error('cache unavailable');
      return query.offset === 0 ? Array.from({ length: 100 }, () => ({ filter_key: 'month:2026-09' })) : [{ filter_key: 'month:2026-10' }];
    },
    nowISOString: h.context.nowISOString, formatDate: () => '2026-09-30', writeSyncStatus() {},
    readManageData: (_sheet, startDate) => ({ ok: true, rows: !sourceHasRows || startDate.startsWith('2026-09') ? [] : [{ volume: '' }] }),
    upsertRows: (_table, rows) => published.push(...rows)
  };
  const wc = { nowMillis: h.context.nowMillis, log() {}, writeStatus() {},
    saveProgress: (item, delay) => h.queue.saveProgress(item, h.context, delay),
    acknowledge: (item) => h.queue.acknowledge(item, h.context), requeue: (item) => h.queue.requeue(item, h.context),
    manageMonths: (sheet) => manage.getManageRefreshMonthKeys(sheet, mc),
    reportMonths: () => ['2026-10'],
    syncManage: (sheet) => manage.syncManageDataBundle(sheet, mc),
    syncManageMonth: (sheet, month) => manage.syncManageMonthBundle(sheet, month, mc),
    syncDashboard: () => ({ ok: true }), syncReport: () => ({ ok: true })
  };
  h.queue.enqueue({ full: true, sheets: ['NL_VanChuyen'], includeAll: false }, h.context); h.advance(15001);
  fail = true; let failed;
  for (let i = 0; i < 8; i++) { failed = h.worker.run(h.queue.claimDue(h.context).item, wc); if (!failed.ok) break; }
  assert.equal(failed.ok, false); assert.equal(failed.acknowledgement.acknowledged, false); assert.equal(h.queue.claimDue(h.context).due, false);
  h.advance(30001); fail = false; offsets.length = 0;
  const discovery = h.worker.run(h.queue.claimDue(h.context).item, wc);
  assert.equal(discovery.ok, true); assert.deepEqual(plain(discovery.months), ['2026-10', '2026-09']); assert.deepEqual(offsets, [0, 100]);
  for (let i = 0; i < 12; i++) {
    const claim = h.queue.claimDue(h.context); if (!claim.due) break;
    if (h.worker.run(claim.item, wc).acknowledgement.acknowledged) break;
  }
  assert.deepEqual(plain(published.find((row) => row.filter_key === 'month:2026-09').payload.rows), []);
  assert.deepEqual(plain(published.find((row) => row.filter_key === 'month:2026-10').payload.rows), [{ volume: '' }]);
  sourceHasRows = false; published.length = 0;
  h.queue.enqueue({ full: true, sheets: ['NL_VanChuyen'], includeAll: false }, h.context); h.advance(15001);
  for (let i = 0; i < 12; i++) {
    const claim = h.queue.claimDue(h.context); if (!claim.due) break;
    if (h.worker.run(claim.item, wc).acknowledgement.acknowledged) break;
  }
  assert.deepEqual(plain(published.find((row) => row.filter_key === 'month:2026-09').payload.rows), []);
  assert.deepEqual(plain(published.find((row) => row.filter_key === 'month:2026-10').payload.rows), []);
});

test('durable refresh progresses one stage per tick and retains edits during work, failures, crash expiry and stale-owner rejection', () => {
  const h = queueHarness(); const q = h.queue; const c = h.context; const operations = []; let fail = false;
  const wc = {
    nowMillis: c.nowMillis, log() {}, writeStatus() {},
    saveProgress: (item, delay) => q.saveProgress(item, c, delay), acknowledge: (item) => q.acknowledge(item, c), requeue: (item) => q.requeue(item, c),
    manageMonths: () => ['2026-09', '2026-10'], reportMonths: () => ['2026-09', '2026-10'],
    syncManage: () => { operations.push('manage'); return { ok: true }; },
    syncManageMonth: (_sheet, month) => { operations.push('manage:' + month); return { ok: true }; },
    syncDashboard: () => { operations.push('dashboard'); return { ok: true }; },
    syncReport: (month) => { if (fail) throw new Error('fault'); operations.push('report:' + month); return { ok: true }; },
    enqueueVerification: () => q.enqueue({ months: ['2026-09', '2026-10'], includeAll: true, source: 'verification' }, c)
  };
  q.enqueue({ sheets: ['NL_VanChuyen'], full: true, verificationPasses: 1 }, c); h.advance(15001);
  let first = q.claimDue(c).item; const r = h.worker.run(first, wc); assert.equal(r.stage, 'manage:NL_VanChuyen');
  assert.equal(r.acknowledgement.acknowledged, false); assert.deepEqual(operations, ['manage']);
  // Edit arrives while the claimed batch is still in flight.
  q.enqueue({ months: ['2026-08'], source: 'new-edit' }, c);
  assert.throws(() => q.saveProgress({ ...first, leaseId: 'other' }, c, 0), /ownership/);
  let claim = q.claimDue(c); assert.equal(claim.due, true); assert.equal(claim.item.tasks[0][0], 'dashboard');
  // Simulate a process killed before stage execution: no finally, no ACK.
  h.advance(360001); assert.equal(q.claimDue(c).due, false, 'lease must outlive the six-minute hard stop');
  h.advance(60000); const resumed = q.claimDue(c); assert.equal(resumed.due, true);
  assert.equal(resumed.item.tasks[0][0], 'dashboard'); assert.equal(resumed.item.attempts, 1);
  assert.equal(q.acknowledge(claim.item, c).acknowledged, false);
  assert.throws(() => q.requeue(claim.item, c), /ownership/);
  let item = resumed.item;
  for (let i = 0; i < 20; i++) {
    const before = operations.length;
    if (item.tasks[0]?.[0] === 'report' && !fail && !operations.some((s) => s.startsWith('report:'))) {
      fail = true; const failed = h.worker.run(item, wc); assert.equal(failed.ok, false); assert.equal(q.claimDue(c).due, false);
      h.advance(30001); item = q.claimDue(c).item; fail = false;
    }
    const result = h.worker.run(item, wc); assert.ok(operations.length - before <= 1);
    if (result.acknowledgement.acknowledged) break;
    item = q.claimDue(c).item;
  }
  assert.deepEqual(operations, ['manage', 'dashboard', 'report:2026-10', 'manage:2026-10', 'manage:2026-09', 'report:2026-09', 'report:Tất cả']);
  assert.deepEqual(plain(q.getPending(c).months), ['2026-08', '2026-09', '2026-10']);
});

test('a burst of actual transport triggers persists bounded range metadata without Sheet reads, network or shared lock calls', () => {
  let now = 1000000; const props = new Map(); let native = 0; let metadata = 0;
  const forbidden = () => { native++; throw Error('Sheet read, network or lock on event path'); };
  const sandbox = vm.createContext({ console: { log() {} }, normalizeCleanValue_: (v) => String(v ?? '').trim(),
    APP_CONFIG: { spreadsheetId: 'isolated', year: '2026' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v) }) },
    LockService: { getScriptLock: forbidden }, Utilities: { getUuid: () => crypto.randomUUID() },
    SpreadsheetApp: { openById: forbidden }, SupabaseSyncStatusRepository: { upsert: forbidden }
  });
  for (const file of ['SheetChangeSignalService.gs', 'TransportSourceProbeService.gs', 'SupabaseService.gs']) vm.runInContext(read(file), sandbox);
  props.set('SUPABASE_SHEET_TRIGGER_BINDINGS_V1', JSON.stringify({
    edit: { handler: 'handleTransportSheetEdit', spreadsheetId: 'isolated' },
    change: { handler: 'handleTransportSheetChange', spreadsheetId: 'isolated' },
    foreign: { handler: 'handleTransportSheetEdit', spreadsheetId: 'foreign' }
  }));
  const service = sandbox.SupabaseService;
  const event = { triggerUid: 'edit', source: { getId: forbidden, getActiveSheet: forbidden }, range: {
    getGridId: () => { metadata++; return 731; }, getSheet: forbidden,
    getRow: () => { metadata++; return 25; }, getNumRows: () => { metadata++; return 1; },
    getValues: forbidden, getDisplayValues: forbidden
  } };
  for (let i = 0; i < 100; i++) {
    assert.equal(service.handleTransportSheetEdit(event).queued, true);
    assert.equal(service.handleTransportSheetChange({ ...event, triggerUid: 'change', changeType: 'EDIT' }).skipped, true);
  }
  assert.equal(native, 0);
  assert.ok(metadata > 0);
  const signal = JSON.parse(props.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026'));
  assert.ok(signal.token); assert.deepEqual(signal.scopes.at(-1), { gridId: 731, startRow: 25, numRows: 1 });
  assert.equal(props.has('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026'), false);
  assert.throws(() => service.handleTransportSheetEdit({ ...event, triggerUid: 'foreign' }), /workbook/);
  assert.throws(() => service.handleTransportSheetEdit({ source: event.source }), /binding/);
  const old = props.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026');
  now += 100; assert.equal(service.handleTransportSheetChange({ triggerUid: 'change', changeType: 'REMOVE_ROW' }).signaled, true);
  assert.notEqual(props.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026'), old);
});

test('actual timer lease survives cache eviction and prevents overlapping work at 330s; new events survive the old ACK', () => {
  let now = 1000000; const props = new Map(); let service; let nested; let reports = 0;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const sandbox = vm.createContext({ Date: ClockDate, console: { log() {} }, normalizeCleanValue_: (v) => String(v ?? '').trim(),
    APP_CONFIG: { spreadsheetId: 'isolated', year: '2026' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => { throw new Error('lease must not depend on evictable cache'); } },
    Utilities: { formatDate: () => '2026-10', getUuid: () => crypto.randomUUID() },
    SupabaseSyncStatusRepository: { upsert() {} }, NotificationPipelineService: { run: () => ({ checked: false }) },
    ReportSyncService: { syncReportBundle() {
      reports++; now += 330000;
      nested = service.syncRealtimeCache();
      service.syncTransportSheetChange('EDIT', 'NL_TaiXe', null);
      return { ok: true };
    } }
  });
  for (const file of ['ManageSyncService.gs', 'SheetChangeSignalService.gs', 'TransportSourceProbeService.gs', 'FundOverviewSnapshotService.gs', 'ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs', 'SupabaseService.gs']) vm.runInContext(read(file), sandbox);
  service = sandbox.SupabaseService;
  sandbox.ManualReportRefreshQueueService.enqueue({ months: ['2026-10'], includeAll: false }, {
    nowMillis: () => now, nowISOString: () => new Date(now).toISOString(), normalizeYearMonthKey: String,
    propertyKey: 'SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026',
    withLock: (fn) => fn(), getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k)
  });
  now += 15001;
  for (const key of ['SUPABASE_REALTIME_HEARTBEAT_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_TRIP_NOTIFICATION_NEXT_AT', 'SUPABASE_SOURCE_POLL_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) props.set(key + '_2026', String(now + 3600000));
  const result = service.syncRealtimeCache();
  assert.equal(result.ok, true); assert.equal(result.acknowledgement.acknowledged, true);
  assert.equal(nested.skipped, true); assert.match(nested.reason, /still running/); assert.equal(reports, 1);
  assert.equal(props.has('SUPABASE_REALTIME_TICK_RUNNING_2026'), false);
  assert.deepEqual(JSON.parse(props.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026')).sheets, ['NL_TaiXe']);
});

test('bounded worker stops after one report or the elapsed-time budget, preserving the remaining cursor', () => {
  const h = queueHarness(); const q = h.queue; const c = h.context;
  q.enqueue({ months: ['2026-09', '2026-10'] }, c); h.advance(15001);
  const wc = { nowMillis: c.nowMillis, maxStages: 3, turnBudgetMs: 60000, log() {}, writeStatus() {},
    saveProgress: (item, delay) => q.saveProgress(item, c, delay), acknowledge: (item) => q.acknowledge(item, c), requeue: (item) => q.requeue(item, c),
    claimNext: () => q.claimDue(c), syncReport: () => ({ ok: true }) };
  const result = h.worker.run(q.claimDue(c).item, wc);
  assert.deepEqual(plain(result.stages), ['report:2026-10']); assert.equal(result.remainingStages, 3);
  // A slow successful read must not start another expensive stage in this turn.
  q.saveProgress({ ...q.claimDue(c).item, tasks: [['manage', 'NL_VanChuyen'], ['dashboard']] }, c, 0);
  wc.syncManage = () => { h.advance(60001); return { ok: true }; };
  wc.syncDashboard = () => { throw new Error('budget exceeded'); };
  const slow = h.worker.run(q.claimDue(c).item, wc);
  assert.deepEqual(plain(slow.stages), ['manage:NL_VanChuyen']); assert.equal(slow.remainingStages, 1);
});

test('rollback adapter is read-only by default and requires drain, exact snapshot, paused runtime and backup before legacy conversion', () => {
  const h = queueHarness(); const q = h.queue; const c = h.context;
  q.enqueue({ sheets: ['NL_Dau'], catalogs: ['DM_Xe'], full: true }, c); h.advance(15001);
  const item = q.claimDue(c).item;
  q.saveProgress({ ...item, tasks: [['manageMonth', 'NL_TaiXe', '2026-10'], ['report', '2026-10']] }, c);
  assert.throws(() => q.prepareLegacyRollback(c), /still active/);
  h.advance(420001);
  const before = [...h.props]; const plan = q.prepareLegacyRollback(c);
  assert.deepEqual([...h.props], before);
  assert.equal(plan.pending.full, true);
  assert.deepEqual(plain(plan.manageSheetsToRefresh), ['NL_Dau', 'NL_TaiXe']);
  assert.deepEqual(plain(plan.catalogsToRefresh), ['DM_Xe']);
  const apply = { apply: true, expectedPendingRaw: plan.snapshot.pendingRaw, expectedLeaseRaw: plan.snapshot.leaseRaw };
  assert.throws(() => q.prepareLegacyRollback(c, { ...apply, expectedPendingRaw: 'drift' }), /snapshot drift/);
  assert.throws(() => q.prepareLegacyRollback(c, apply), /Pause runtime/);
  c.isRuntimePaused = () => true;
  assert.throws(() => q.prepareLegacyRollback(c, apply), /backup is required/);
  c.backup = () => { throw new Error('backup unavailable'); };
  assert.throws(() => q.prepareLegacyRollback(c, apply), /backup unavailable/);
  assert.deepEqual([...h.props], before);
  let backup;
  c.backup = (value) => { backup = plain(value); };
  q.prepareLegacyRollback(c, apply);
  assert.deepEqual(backup.snapshot, plain(plan.snapshot));
  assert.equal(h.props.has('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_LEASE'), false);
  const legacy = JSON.parse(h.props.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC'));
  assert.equal(legacy.full, true); assert.equal(legacy.tasks, undefined); assert.equal(legacy.sheets, undefined);
});
