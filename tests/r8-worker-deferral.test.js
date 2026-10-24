const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const s = vm.createContext({});
  for (const f of ['ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs']) vm.runInContext(fs.readFileSync(f, 'utf8'), s);
  let now = 1000000; const p = new Map(), calls = [], statuses = [];
  const c = { nowMillis: () => now, nowISOString: () => new Date(now).toISOString(), normalizeYearMonthKey: String, withLock: (fn) => fn(), getProperty: (k) => p.get(k), setProperty: (k, v) => p.set(k, v), deleteProperty: (k) => p.delete(k) };
  const q = s.ManualReportRefreshQueueService; q.enqueue({ full: true }, c); now += 15001;
  const w = { nowMillis: c.nowMillis, maxStages: 30, log() {}, writeStatus: (...args) => statuses.push(args),
    buildTasks: () => [['manage', 'NL_Dau'], ['manage', 'NL_TaiXe']], syncManage: (name) => { calls.push(name); return { ok: true }; },
    saveProgress: (item, delay) => q.saveProgress(item, c, delay), claimNext: () => q.claimDue(c), acknowledge: (item) => q.acknowledge(item, c), requeue: (item) => q.requeue(item, c) };
  return { q, w, c, p, calls, statuses, run: () => s.TransportRefreshWorker.run(q.claimDue(c).item, w) };
}

test('lock error during next claim preserves the completed cursor and defers with no ACK', () => {
  const h = harness(); const claim = h.w.claimNext;
  h.w.claimNext = () => { const e = Error('Google server error'); e.refreshDeferred = true; throw e; };
  const r = h.run(); assert.equal(r.ok, false); assert.equal(r.deferred, true); assert.equal(r.acknowledgement.acknowledged, false);
  assert.deepEqual(h.calls, ['NL_Dau']); assert.equal(h.statuses.length, 1);
  const lease = JSON.parse(h.p.get('SUPABASE_PENDING_TRANSPORT_REPORT_SYNC_LEASE'));
  assert.deepEqual(lease.item.tasks, [['manage', 'NL_TaiXe']]); assert.equal(lease.item.full, true);
  h.w.claimNext = claim; assert.equal(h.run().acknowledgement.acknowledged, true);
  assert.deepEqual(h.calls, ['NL_Dau', 'NL_TaiXe']);
});

test('final cursor retains ownership through verification and ACK; another worker cannot claim it', () => {
  const h = harness(); h.w.maxStages = 1; h.run();
  const save = h.w.saveProgress; let checked = false;
  h.w.saveProgress = (item, delay) => { const r = save(item, delay); if (!item.tasks.length) { assert.equal(delay, undefined); assert.equal(h.q.claimDue(h.c).due, false); checked = true; } return r; };
  assert.equal(h.run().acknowledgement.acknowledged, true); assert.equal(checked, true);
});
