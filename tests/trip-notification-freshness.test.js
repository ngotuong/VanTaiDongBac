const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'TripNotificationFreshnessService.gs'), 'utf8');

function harness() {
  const properties = new Map();
  let now = 1_000_000;
  const sandbox = vm.createContext({});
  vm.runInContext(source, sandbox);
  const context = {
    dirtyKey: 'DIRTY',
    nextAtKey: 'NEXT',
    quietWindowMs: 30_000,
    nowMillis: () => now,
    nowISOString: () => new Date(now).toISOString(),
    getProperty: (key) => properties.get(key),
    setProperty: (key, value) => properties.set(key, value),
    deleteProperty: (key) => properties.delete(key)
  };
  return {
    service: sandbox.TripNotificationFreshnessService,
    context,
    properties,
    advance: (ms) => { now += ms; },
    now: () => now
  };
}

test('only trip reconciliation inputs mark notification freshness dirty', () => {
  const h = harness();
  assert.equal(h.service.mark({ sheetName: 'NL_Dau' }, h.context).marked, false);
  assert.equal(h.properties.has('DIRTY'), false);
  const marked = h.service.mark({ sheetName: 'NL_VanChuyen', generationId: 'transport-1' }, h.context);
  assert.equal(marked.marked, true);
  assert.equal(marked.state.lastSignalAt, h.now());
  assert.equal(marked.state.dueAt, h.now() + 30_000);
  assert.deepEqual(Array.from(marked.state.sheetNames), ['NL_VanChuyen']);
});

test('transport then driver edits coalesce from the latest signal quiet window', () => {
  const h = harness();
  h.service.mark({ sheetName: 'NL_VanChuyen', eventAtMillis: h.now(), generationId: 'transport-1' }, h.context);
  h.advance(20_000);
  const result = h.service.mark({ sheetName: 'NL_TaiXe', eventAtMillis: h.now(), generationId: 'driver-2' }, h.context);
  assert.equal(result.state.lastSignalAt, 1_020_000);
  assert.equal(result.state.dueAt, 1_050_000);
  assert.equal(result.state.generationId, 'driver-2');
  assert.deepEqual(Array.from(result.state.sheetNames), ['NL_TaiXe', 'NL_VanChuyen']);
  assert.equal(h.service.isDue(result.state, 1_049_999), false);
  assert.equal(h.service.isDue(result.state, 1_050_000), true);
});

test('due dirty state wakes the notification pipeline immediately', () => {
  const h = harness();
  const marked = h.service.mark({ sheetName: 'NL_TaiXe' }, h.context);
  h.advance(30_000);
  assert.equal(h.service.forcePipelineDue(marked.state, h.now(), h.context), true);
  assert.equal(h.properties.get('NEXT'), '0');
});

test('acknowledgement never clears an edit that raced with the source read', () => {
  const h = harness();
  const first = h.service.mark({ sheetName: 'NL_VanChuyen', generationId: 'one' }, h.context).state;
  h.advance(40_000);
  h.service.mark({ sheetName: 'NL_TaiXe', generationId: 'two' }, h.context);
  assert.equal(h.service.acknowledge(first, { ok: true }, h.context), false);
  assert.equal(JSON.parse(h.properties.get('DIRTY')).generationId, 'two');
  const latest = h.service.read(h.context);
  assert.equal(h.service.acknowledge(latest, { ok: true }, h.context), true);
  assert.equal(h.properties.has('DIRTY'), false);
});

test('Supabase coordinator wires both direct Sheet and webapp writes into freshness', () => {
  const facade = fs.readFileSync(path.join(root, 'SupabaseService.gs'), 'utf8');
  assert.match(facade, /syncTransportSheetChange[\s\S]*markTripNotificationsDirty_\(safeSheetName, generationOptions\.eventAtMillis/);
  assert.match(facade, /syncTransportAfterWrite[\s\S]*markTripNotificationsDirty_\(safeSheetName, new Date\(\)\.getTime\(\)/);
  assert.match(facade, /tripNotificationDirtyDue \|\| \(!priorityPending/);
  assert.match(facade, /forcePipelineDue\(dirtySnapshot, nowMillis/);
  assert.match(facade, /freshnessService\.acknowledge\(dirtySnapshot, tripResult/);
});

test('trip bundle exposes source freshness without changing Sheet data', () => {
  const sync = fs.readFileSync(path.join(root, 'TripNotificationSyncService.gs'), 'utf8');
  assert.match(sync, /sourceChangedAt/);
  assert.match(sync, /sourceLagMs/);
  assert.doesNotMatch(sync, /setValue|setValues|appendRow|deleteRow/);
});
