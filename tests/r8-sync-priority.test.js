const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const read = (file) => fs.readFileSync(file, 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

function harness() {
  let now = 1000000;
  const props = new Map(); const published = []; const logs = [];
  const sandbox = vm.createContext({});
  for (const file of ['ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs', 'TransportSourceProbeService.gs']) vm.runInContext(read(file), sandbox);
  const queue = sandbox.ManualReportRefreshQueueService;
  const context = { withLock: (fn) => fn(), nowMillis: () => now, nowISOString: () => new Date(now).toISOString(),
    normalizeYearMonthKey: String, getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) };
  const publish = (key) => { now += 2000; published.push({ key, at: now }); return { ok: true }; };
  const worker = { currentMonth: '2026-10', planVersion: 3, maxStages: 30, turnBudgetMs: 45000,
    nowMillis: context.nowMillis, log: (s) => logs.push(s), writeStatus() {},
    saveProgress: (item, delay) => queue.saveProgress(item, context, delay), requeue: (item) => queue.requeue(item, context),
    acknowledge: (item) => queue.acknowledge(item, context), claimNext: () => queue.claimDue(context),
    manageMonths: () => ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'],
    reportMonths: () => ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
    syncManage: (sheet) => publish(sheet + ':recent'), syncManageMonth: (sheet, month) => publish(sheet + ':' + month),
    syncDashboard: () => publish('dashboard'), syncReport: (month) => publish('report:' + month),
    syncCatalog: (sheet) => publish(sheet), syncStartup: () => publish('startup'), catalogForms: [] };
  return { ...sandbox, props, context, queue, worker, published, logs, advance: (ms) => { now += ms; }, now: () => now,
    tick: () => { const c = queue.claimDue(context); return c.due ? sandbox.TransportRefreshWorker.run(c.item, worker) : null; },
    finish: () => { let result; for (let i = 0; i < 80; i++) { result = queue.claimDue(context); if (!result.due) break;
      const r = sandbox.TransportRefreshWorker.run(result.item, worker); assert.equal(r.ok, true); if (r.acknowledgement.acknowledged) return r; }
      throw Error('refresh never completed'); } };
}

test('two changed inputs publish current-month data and dashboard before any unrelated old month, retaining full history', () => {
  const h = harness();
  h.queue.enqueue({ full: true, sheets: ['NL_Dau', 'NL_TaiXe'], source: 'signal:transport:EDIT' }, h.context);
  h.advance(15001); const started = h.now(); const first = h.tick();
  for (const key of ['NL_Dau:2026-10', 'NL_TaiXe:2026-10', 'dashboard', 'report:2026-10']) {
    const row = h.published.find((r) => r.key === key);
    assert.ok(row, `${key} must publish in the first bounded turn`);
    assert.ok(row.at - started < 45000);
  }
  assert.equal(first.acknowledgement.acknowledged, false, 'priority publication cannot ACK historical scope');
  assert.equal(h.published.some((r) => r.key.endsWith(':2026-09')), false);
  h.finish();
  for (const sheet of ['NL_Dau', 'NL_TaiXe']) for (const month of ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05']) {
    assert.ok(h.published.some((r) => r.key === `${sheet}:${month}`));
  }
  assert.equal(h.queue.getPending(h.context), null);
});

test('a changed input publishes before 13 catalog and 2 helper probes; mixed polling sources retain the optimization', () => {
  const h = harness(); const probe = h.TransportSourceProbeService;
  const sources = ['NL_VanChuyen', 'NL_TaiXe', 'NL_Dau', 'NL_ChamCong', 'NL_Phat', 'NL_NghiVanHanh', 'NL_PhanCongLai', 'NL_SoDuLuong']
    .map((sheet) => ({ sheet, kind: 'manage' }))
    .concat(Array.from({ length: 13 }, (_, i) => ({ sheet: `DM_${i}`, kind: 'catalog' })))
    .concat([{ sheet: 'helper1', kind: 'report' }, { sheet: 'helper2', kind: 'report' }]);
  for (const s of sources) h.props.set('SUPABASE_TRANSPORT_INPUT_HASH_V1_' + s.sheet, 'same');
  const item = { sources: ['signal:transport:EDIT', 'poll:report-outputs'], full: true, sheets: ['NL_Dau', 'NL_TaiXe'] };
  assert.equal(probe.eligible(item), true);
  h.worker.buildTasks = (work) => probe.tasks(work, sources);
  h.worker.runTask = (task, work) => probe.run(task, work, { ...h.context, currentMonth: '2026-10',
    readHash: (sheet) => { h.advance(3000); return ['NL_Dau', 'NL_TaiXe'].includes(sheet) ? 'changed' : 'same'; }, cachePresent: () => true,
    commit: (fn) => h.queue.withOwnedLease(work, h.context, fn), safetyCatalogTasks: () => [],
    buildCacheTasks: (scope) => h.TransportRefreshWorker.buildCacheTasks(scope, h.worker) });
  h.queue.enqueue({ ...item, source: 'signal:transport:EDIT' }, h.context);
  h.queue.enqueue({ source: 'poll:report-outputs', months: ['2026-10'] }, h.context);
  h.advance(15001); const started = h.now(); const first = h.tick();
  for (const key of ['NL_Dau:2026-10', 'NL_TaiXe:2026-10']) {
    assert.ok(h.published.find((r) => r.key === key).at - started < 30000);
  }
  assert.equal(first.acknowledgement.acknowledged, false);
  assert.equal(h.props.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau'), 'same', 'input hash remains uncommitted until all cache stages');
  assert.ok(h.published.some((r) => r.key === 'dashboard'), 'dashboard cannot wait for catalog probes');
  assert.ok(h.published.some((r) => r.key === 'report:2026-10'), 'current report publishes before catalog probes');
  h.finish(); assert.equal(h.props.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau'), 'changed');
  assert.ok(h.logs.findIndex((s) => s.startsWith('refresh_stage_start:manageMonth:NL_Dau:2026-10')) <
    h.logs.findIndex((s) => s.startsWith('refresh_stage_start:probeInput:DM_0')));
});

test('a due edit preempts a yielded historical cursor, preserving old scope and rejecting its stale owner', () => {
  const h = harness(); const c = h.context; const q = h.queue;
  q.enqueue({ full: true, sheets: ['NL_VanChuyen'], catalogs: ['DM_Xe'], source: 'safety:transport' }, c);
  h.advance(15001); const old = q.claimDue(c).item;
  q.saveProgress({ ...old, planVersion: 3, background: true, months: ['2026-05'], tasks: [['manageMonth', 'NL_VanChuyen', '2026-05']] }, c, 0);
  q.enqueue({ full: true, sheets: ['NL_Dau'], months: ['2026-09'], source: 'signal:transport:EDIT' }, c);
  h.advance(15001); const next = q.claimDue(c);
  assert.equal(next.due, true); assert.equal(next.item.tasks, undefined);
  assert.deepEqual(plain(next.item.sheets), ['NL_VanChuyen', 'NL_Dau']);
  assert.deepEqual(plain(next.item.catalogs), ['DM_Xe']);
  assert.ok(next.item.months.includes('2026-05'));
  assert.ok(next.item.priorityMonths.includes('2026-09'));
  assert.equal(q.acknowledge(old, c).acknowledged, false);
  assert.throws(() => q.saveProgress(old, c, 0), /ownership/);
  q.saveProgress(next.item, c, 0); h.finish();
  assert.ok(h.published.some((r) => r.key === 'NL_VanChuyen:2026-05'));
  assert.ok(h.published.some((r) => r.key === 'NL_Dau:2026-09'));
});

test('an active or crashed lease cannot be preempted by a later edit', () => {
  const h = harness(); h.queue.enqueue({ full: true, sheets: ['NL_Dau'] }, h.context); h.advance(15001);
  const owner = h.queue.claimDue(h.context).item;
  h.queue.saveProgress({ ...owner, background: true, tasks: [['manageMonth', 'NL_Dau', '2026-05']] }, h.context);
  h.queue.enqueue({ full: true, sheets: ['NL_TaiXe'], source: 'signal:transport:EDIT' }, h.context);
  h.advance(15001); assert.equal(h.queue.claimDue(h.context).due, false);
  h.advance(420001); const resumed = h.queue.claimDue(h.context).item;
  assert.deepEqual(plain(resumed.tasks), [['manageMonth', 'NL_Dau', '2026-05']]);
  assert.ok(h.props.has('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC'));
});

test('verification/safety do not turn historical months back into foreground work', () => {
  const h = harness(); h.queue.enqueue({ full: true, months: ['2026-05', '2026-06'], source: 'verification:report-formulas' }, h.context);
  h.queue.enqueue({ full: true, source: 'safety:transport' }, h.context);
  assert.deepEqual(plain(h.queue.getPending(h.context).priorityMonths), []);
  assert.equal(h.queue.getPending(h.context).priority, false);
});

test('a sustained edit burst leaves a historical cache stage after at most three priority replans', () => {
  const h = harness(); h.queue.enqueue({ full: true, sheets: ['NL_Dau'] }, h.context); h.advance(15001);
  for (let i = 0; i < 4; i++) {
    const item = h.queue.claimDue(h.context).item;
    h.queue.saveProgress({ ...item, background: true, tasks: [['manageMonth', 'NL_Dau', '2026-05']] }, h.context, 0);
    h.queue.enqueue({ full: true, sheets: ['NL_TaiXe'], source: 'signal:transport:EDIT' }, h.context); h.advance(15001);
    const next = h.queue.claimDue(h.context).item;
    if (i < 3) assert.equal(next.tasks, undefined);
    else {
      assert.deepEqual(plain(next.tasks), [['manageMonth', 'NL_Dau', '2026-05']]);
      h.worker.maxStages = 1; h.worker.planVersion = undefined;
      const r = h.TransportRefreshWorker.run(next, h.worker); assert.equal(r.ok, true);
      assert.ok(h.published.some((row) => row.key === 'NL_Dau:2026-05'));
      break;
    }
    h.queue.saveProgress(next, h.context, 0);
  }
});

function timer(primaryCost = 4000) {
  let now = 1000000; const props = new Map(); const calls = [];
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const properties = { getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) };
  const record = (module) => { calls.push({ module, at: now }); now += module === 'transport' ? primaryCost : 4000; return { ok: true }; };
  const s = vm.createContext({ Date: ClockDate, console: { log() {} }, APP_CONFIG: { spreadsheetId: 'synthetic', year: '2026', timezone: 'Asia/Ho_Chi_Minh' },
    normalizeCleanValue_: (v) => String(v ?? '').trim(), PropertiesService: { getScriptProperties: () => properties },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-10', getUuid: () => 'tick' }, CacheService: { getScriptCache: () => ({}) },
    ManageSyncService: { syncManageDataBundle: () => record('transport') },
    FundSyncService: { syncFundLoanOverview: () => record('fund') }, SupabaseSyncStatusRepository: { upsert() {} } });
  for (const file of ['ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs', 'TransportSourceProbeService.gs', 'SupabaseService.gs']) vm.runInContext(read(file), s);
  const ctx = { ...properties, withLock: (fn) => fn(), nowMillis: () => now, nowISOString: () => new Date(now).toISOString(), normalizeYearMonthKey: String };
  for (const [module, key, task] of [['transport', 'SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026', ['manage', 'NL_Dau']], ['fund', 'SUPABASE_PENDING_FUND_SYNC_2026', ['fundLoans', '']]]) {
    s.ManualReportRefreshQueueService.enqueue({ full: true }, { ...ctx, propertyKey: key });
    const item = s.ManualReportRefreshQueueService.claimDue({ ...ctx, propertyKey: key });
    // Pending debounce: seed an interrupted checkpoint directly, as Production
    // already had historical leases when the new code would be activated.
    if (!item.due) {
      now += 15001;
      const claimed = s.ManualReportRefreshQueueService.claimDue({ ...ctx, propertyKey: key });
      s.ManualReportRefreshQueueService.saveProgress({ ...claimed.item, planVersion: 3, tasks: Array.from({ length: 40 }, () => task) }, { ...ctx, propertyKey: key }, 0);
    }
  }
  for (const key of ['SUPABASE_REALTIME_HEARTBEAT_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_TRIP_NOTIFICATION_NEXT_AT', 'SUPABASE_SOURCE_POLL_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) props.set(key + '_2026', String(now + 3600000));
  const started = now;
  return { calls, props, started, tick: () => s.SupabaseService.syncRealtimeCache() };
}

test('actual coordinator advances both module backlogs in one tick within a shared budget', () => {
  const h = timer(); const result = h.tick();
  assert.equal(result.ok, true); assert.ok(result.companion);
  assert.ok(h.calls.some((c) => c.module === 'transport'));
  assert.ok(h.calls.some((c) => c.module === 'fund'));
  assert.ok(h.calls.every((c) => c.at - h.started < 60000), 'no native stage starts after the shared deadline');
  assert.ok(h.props.has('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_2026_LEASE'));
  assert.ok(h.props.has('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'));
});

test('one slow native call exhausts the tick without claiming or running its companion', () => {
  const h = timer(65000); const before = h.props.get('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'); const result = h.tick();
  assert.equal(result.ok, true); assert.equal(result.companion, undefined);
  assert.deepEqual(h.calls.map((c) => c.module), ['transport']);
  assert.equal(h.props.get('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'), before);
  assert.equal(h.props.has('SUPABASE_REALTIME_TICK_RUNNING_2026'), false);
});

test('unchanged input hashes cannot swallow a computed-output poll merged with an edit signal', () => {
  const h = harness(); const p = h.TransportSourceProbeService;
  h.props.set('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau', 'same');
  h.worker.buildTasks = (item) => p.tasks(item, [{ sheet: 'NL_Dau', kind: 'manage' }]);
  h.worker.runTask = (task, item) => p.run(task, item, { ...h.context, currentMonth: '2026-10', readHash: () => 'same', cachePresent: () => true,
    safetyCatalogTasks: () => [], commit: (fn) => h.queue.withOwnedLease(item, h.context, fn),
    buildCacheTasks: (scope) => h.TransportRefreshWorker.buildCacheTasks(scope, h.worker) });
  h.queue.enqueue({ full: true, source: 'signal:transport:FORMAT' }, h.context);
  h.queue.enqueue({ months: ['2026-10'], source: 'poll:report-outputs' }, h.context); h.advance(15001);
  h.finish();
  assert.ok(h.published.some((r) => r.key === 'report:2026-10'));
  assert.ok(h.published.some((r) => r.key === 'dashboard'));
  assert.equal(h.published.some((r) => r.key.startsWith('NL_Dau')), false);
});

test('claim/lock latency consumes the absolute deadline and yields the newly claimed cursor', () => {
  const h = harness(); h.queue.enqueue({ sheets: ['NL_Dau'], full: true }, h.context); h.advance(15001);
  h.worker.deadlineMillis = h.now() + 60000;
  h.worker.claimNext = () => { h.advance(61000); return h.queue.claimDue(h.context); };
  const result = h.tick(); assert.equal(result.ok, true); assert.equal(h.published.length, 1);
  const next = h.queue.claimDue(h.context);
  assert.equal(next.due, true, 'a claim taken after the deadline must not strand an active seven-minute lease');
  assert.deepEqual(plain(next.item.tasks[0]), ['manageMonth', 'NL_Dau', '2026-10']);
});

test('a narrow one-month scope does not retry forever after its priority report was already published', () => {
  const h = harness(); h.worker.manageMonths = () => ['2026-10'];
  h.queue.enqueue({ months: ['2026-10'], sheets: ['NL_Dau'], includeAll: false, source: 'poll:fuel' }, h.context); h.advance(15001);
  h.finish();
  assert.equal(h.published.filter((r) => r.key === 'report:2026-10').length, 1);
  assert.equal(h.queue.getPending(h.context), null);
});

test('a Fund month edit publishes dashboard and that report before the all-period background bundle', () => {
  const h = harness();
  h.queue.enqueue({ months: ['2026-09'], refreshDashboard: true, source: 'fund-sheet-downstream:NHAP_THUCHI:EDIT' }, h.context);
  h.advance(15001);
  const first = h.tick();
  assert.deepEqual(h.published.map((row) => row.key), ['dashboard', 'report:2026-09']);
  assert.deepEqual(plain(first.stages), ['dashboard', 'preparePriorityReport', 'report:2026-09']);
  assert.equal(first.acknowledgement.acknowledged, false);
  h.finish();
  assert.ok(h.published.some((row) => row.key === 'report:Tất cả'));
  assert.equal(h.queue.getPending(h.context), null);
});

test('an interrupted403 plan is upgraded from complete business scope rather than executing obsolete historical tasks', () => {
  const h = harness(); h.queue.enqueue({ full: true, sheets: ['NL_Dau'], catalogs: ['DM_Xe'] }, h.context); h.advance(15001);
  const old = h.queue.claimDue(h.context).item;
  h.queue.saveProgress({ ...old, months: ['2026-05'], tasks: [['manageMonth', 'NL_Dau', '2026-05'], ['catalog', 'DM_Xe']] }, h.context, 0);
  h.tick();
  assert.equal(h.published[0].key, 'DM_Xe', 'catalog publication precedes historical scope');
  assert.ok(h.published.some((r) => r.key === 'NL_Dau:2026-10'));
  h.finish(); assert.ok(h.published.some((r) => r.key === 'NL_Dau:2026-05')); assert.ok(h.published.some((r) => r.key === 'DM_Xe'));
});

// Production09Oct: salary/catalog changes waited behind a failing August stage.
test('changed salary catalog and both affected priority reports publish before failing history without ACKing it', () => {
  const h = harness();
  h.worker.syncManageMonth = (sheet, month) => { if (month === '2026-08') throw Error('historical Google failure'); return { ok: true }; };
  h.queue.enqueue({ full: true, sheets: ['NL_VanChuyen'], catalogs: ['DM_CheDoLuong'], months: ['2026-09','2026-10'], source: 'poll:report-outputs' }, h.context);
  h.advance(15001);
  const first = h.tick(); assert.equal(first.ok, true); assert.equal(h.published[0].key,'DM_CheDoLuong');
  const second = h.tick(); assert.equal(second.ok, true);
  for (const month of ['2026-09','2026-10']) assert.equal(h.published.filter(r=>r.key==='report:'+month).length,1);
  const failed = h.tick(); assert.equal(failed.ok,false); assert.equal(failed.acknowledgement.acknowledged,false);
  const lease=JSON.parse(h.props.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_LEASE'));
  assert.deepEqual(lease.item.tasks[0],['manageMonth','NL_VanChuyen','2026-08']);
  assert.equal(lease.item.full,true);assert.ok(lease.item.months.includes('2026-05'));
  h.worker.syncManageMonth=()=>({ok:true});h.advance(30001);h.finish();assert.equal(h.queue.getPending(h.context),null);
});

test('an existing404 history cursor upgrades to priority catalog and affected September report', () => {
  const h=harness();h.queue.enqueue({full:true,sheets:['NL_VanChuyen'],catalogs:['DM_CheDoLuong'],months:['2026-09'],source:'poll:report-outputs'},h.context);h.advance(15001);
  const item=h.queue.claimDue(h.context).item;h.queue.saveProgress({...item,planVersion:2,background:true,months:['2026-05','2026-09','2026-10'],tasks:[['manageMonth','NL_VanChuyen','2026-08'],['catalog','DM_CheDoLuong']]},h.context,0);
  h.tick();assert.equal(h.published[0].key,'DM_CheDoLuong');assert.ok(h.published.some(r=>r.key==='report:2026-09'));h.finish();assert.ok(h.published.some(r=>r.key==='NL_VanChuyen:2026-05'));
});
