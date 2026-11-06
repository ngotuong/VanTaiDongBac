const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function harness(enabled = true) {
  const rows = [];
  const context = vm.createContext({ console });
  new vm.Script(read('SyncGenerationShadowService.gs'), { filename: 'SyncGenerationShadowService.gs#test' }).runInContext(context);
  const serviceContext = {
    isEnabled: () => enabled,
    repository: { enqueue: (row) => rows.push(row) },
    nowISOString: () => '2026-11-06T05:00:00.000Z',
    sha256: (value) => crypto.createHash('sha256').update(value).digest('hex')
  };
  return { service: context.SyncGenerationShadowService, serviceContext, rows };
}

function input() {
  return {
    generationId: 'signal-31-oct', legacyQueueGenerationId: 'signal-31-oct',
    workbookYear: '2026', module: 'transport', queueName: 'transport',
    sourceType: 'sheet:NL_Dau:EDIT', sheetNames: ['NL_Dau', 'NL_Dau'],
    gridIds: [731, 731], rowRanges: ['731:25:1', '731:25:1'], months: ['2026-10', '2026-10'], startRow: 25, numRows: 1,
    structural: false, fullRefresh: false,
    sourceCommittedAt: '2026-11-06T04:59:00.000Z', lastSignalAt: '2026-11-06T04:59:00.000Z',
    notBefore: '2026-11-06T04:59:15.000Z', sourceDataVersion: 'report-v42',
    semanticBuildStamp: 'candidate-d2', eventValue: 'must-never-be-persisted'
  };
}

test('generation shadow is disabled by default boundary and performs no persistence', () => {
  const h = harness(false);
  const result = h.service.record(input(), h.serviceContext);
  assert.equal(result.enabled, false);
  assert.equal(result.recorded, false);
  assert.deepEqual(h.rows, []);
});

test('generation shadow emits deterministic normalized metadata only', () => {
  const h = harness(true);
  const first = h.service.record(input(), h.serviceContext);
  const second = h.service.record({ ...input(), eventValue: 'different-sensitive-value' }, h.serviceContext);
  assert.equal(first.recorded, true);
  assert.equal(second.eventKey, first.eventKey);
  assert.equal(h.rows.length, 2);
  assert.deepEqual(h.rows[0].scope_sheet_names, ['NL_Dau']);
  assert.deepEqual(h.rows[0].scope_grid_ids, [731]);
  assert.deepEqual(h.rows[0].scope_row_ranges, ['731:25:1']);
  assert.deepEqual(h.rows[0].scope_months, ['2026-10']);
  assert.equal(h.rows[0].scope_start_row, 25);
  assert.equal(h.rows[0].source_data_version, 'report-v42');
  assert.equal(h.rows[0].legacy_queue_generation_id, 'signal-31-oct');
  assert.doesNotMatch(JSON.stringify(h.rows[0]), /must-never|different-sensitive/);
  assert.deepEqual(h.rows[1], h.rows[0]);
});

test('generation shadow rejects invalid routing metadata before repository write', () => {
  const h = harness(true);
  assert.throws(() => h.service.record({ ...input(), workbookYear: '26' }, h.serviceContext), /year/);
  assert.throws(() => h.service.record({ ...input(), module: 'system' }, h.serviceContext), /module/);
  assert.equal(h.rows.length, 0);
});

test('generation repository uses only the idempotent enqueue RPC', () => {
  const calls = [];
  const context = vm.createContext({ SupabaseHttpClient: { callRpc: (name, payload) => calls.push({ name, payload }) } });
  new vm.Script(read('SupabaseSyncGenerationRepository.gs'), { filename: 'SupabaseSyncGenerationRepository.gs#test' }).runInContext(context);
  const producer = harness(true);
  const row = producer.service.record(input(), producer.serviceContext).row;
  context.SupabaseSyncGenerationRepository.enqueue(row);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'enqueue_sync_generation');
  assert.equal(calls[0].payload.p_event_key, row.event_key);
  assert.equal(calls[0].payload.p_source_data_version, 'report-v42');
  assert.equal(calls[0].payload.p_scope_grid_ids[0], 731);
  assert.equal(calls[0].payload.p_scope_row_ranges[0], '731:25:1');
});

test('Supabase service mirrors only an accepted legacy queue and never adds a publisher', () => {
  const source = read('SupabaseService.gs');
  const enqueueStart = source.indexOf('  function enqueueRefreshWithFallback_');
  const enqueueEnd = source.indexOf('\n  function getPendingTransportReportRefresh', enqueueStart);
  const enqueueBlock = source.slice(enqueueStart, enqueueEnd);
  assert.ok(enqueueStart >= 0 && enqueueEnd > enqueueStart);
  assert.ok(enqueueBlock.indexOf('ManualReportRefreshQueueService.enqueue') < enqueueBlock.indexOf('recordSyncGenerationShadow_'));
  assert.match(enqueueBlock, /recordSyncGenerationShadow_\(options \|\| \{\}, queued, queueName\)/);
  const producerSource = read('SyncGenerationShadowService.gs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(producerSource, /e\.value|dashboard_published_at|report_published_at|\.publish\s*\(/i);
});

test('installable trigger dual-writes the same generation metadata without blocking its durable signal', () => {
  const context = vm.createContext({});
  new vm.Script(read('SheetChangeSignalService.gs'), { filename: 'SheetChangeSignalService.gs#producer-test' }).runInContext(context);
  const values = new Map(); const mirrored = [];
  values.set('SUPABASE_SHEET_TRIGGER_BINDINGS_V1', JSON.stringify({
    trigger: { handler: 'handleTransportSheetEdit', spreadsheetId: 'transport' }
  }));
  const serviceContext = {
    year: '2026', getProperty: (key) => values.get(key), setProperty: (key, value) => values.set(key, value),
    nowMillis: () => 1773035940000, createUuid: () => 'producer-generation-1',
    recordGeneration: (signal) => mirrored.push(JSON.parse(JSON.stringify(signal)))
  };
  const event = { triggerUid: 'trigger', range: {
    getGridId: () => 731, getRow: () => 25, getNumRows: () => 1,
    getSheet: () => { throw new Error('producer must not read a Sheet'); }
  } };
  const result = context.SheetChangeSignalService.record(event, 'transport', 'handleTransportSheetEdit', 'transport', serviceContext);
  assert.equal(result.generationId, 'producer-generation-1');
  assert.equal(mirrored.length, 1);
  assert.equal(mirrored[0].token, 'producer-generation-1');
  assert.deepEqual(JSON.parse(JSON.stringify(mirrored[0].scopes)), [{ gridId: 731, startRow: 25, numRows: 1 }]);
  serviceContext.recordGeneration = () => { throw new Error('shadow unavailable'); };
  serviceContext.createUuid = () => 'producer-generation-2';
  assert.equal(context.SheetChangeSignalService.record(event, 'transport', 'handleTransportSheetEdit', 'transport', serviceContext).queued, true);
  assert.match(values.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026'), /producer-generation-2/);
});
