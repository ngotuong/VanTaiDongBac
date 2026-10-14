/** One paged Sheet capture reused by every transaction-list filter in a lease. */
var FundTransactionSnapshotService = (function () {
  var TTL = 7200;

  function measureCapture_(context, phase, work) {
    function log(record) {
      try { context.log('fund_transactions_capture_phase:' + JSON.stringify(record)); } catch (ignored) {}
    }
    var started = Date.now(), ok = false;
    log({ phase: phase, event: 'start' });
    try {
      var result = work();
      ok = true;
      return result;
    } finally {
      log({ phase: phase, event: 'end', ms: Math.max(0, Date.now() - started), ok: ok });
    }
  }

  function write_(key, value, context) {
    var raw = measureCapture_(context, 'serialize', function () { return JSON.stringify(value); });
    var values = {}, count = 0;
    measureCapture_(context, 'chunk', function () {
      for (var offset = 0; offset < raw.length;) {
        var end = Math.min(raw.length, offset + 16000);
        var code = raw.charCodeAt(end - 1);
        if (end < raw.length && code >= 0xD800 && code <= 0xDBFF) end--;
        values[key + ':' + count++] = raw.slice(offset, end);
        offset = end;
      }
    });
    measureCapture_(context, 'cachePutAll', function () { context.cache.putAll(values, TTL); });
    return { key: key, count: count, hash: measureCapture_(context, 'hash', function () { return context.hash(raw); }) };
  }

  function keys_(block) {
    var keys = [];
    for (var i = 0; i < block.count; i++) keys.push(block.key + ':' + i);
    return keys;
  }

  function read_(block, context, values, measure) {
    if (!block) return null;
    measure = measure || function (phase, work) { return work(); };
    var keys = keys_(block);
    values = values || context.cache.getAll(keys);
    if (keys.some(function (key) { return typeof values[key] !== 'string'; })) return null;
    var raw = keys.map(function (key) { return values[key]; }).join('');
    if (measure('pageHash', function () { return context.hash(raw); }) !== block.hash) return null;
    try { return measure('pageParse', function () { return JSON.parse(raw); }); } catch (ignore) { return null; }
  }

  function measurePublication_(context, phase, work) {
    function log(record) {
      try { context.log('fund_transactions_publish_phase:' + JSON.stringify(record)); } catch (ignored) {}
    }
    var started = Date.now(), ok = false;
    log({ phase: phase, event: 'start' });
    try {
      var result = work();
      ok = true;
      return result;
    } finally {
      log({ phase: phase, event: 'end', ms: Math.max(0, Date.now() - started), ok: ok });
    }
  }

  function remove_(blocks, context) {
    if (!context.cache.removeAll) return;
    var keys = [];
    (blocks || []).forEach(function (block) { if (block) keys = keys.concat(keys_(block)); });
    if (keys.length) context.cache.removeAll(keys);
  }

  function start_(item, month, context) {
    var previous = item.fundTransactionsCapture;
    if (previous) {
      var manifest = read_(previous.manifest, context);
      remove_([previous.manifest, previous.garbage].concat(manifest && manifest.blocks || []), context);
    }
    var id = context.uuid();
    var fresh = { stamp: context.stamp(), nextRow: 2, blocks: [], ready: false };
    item.fundTransactionsCapture = { id: id, manifest: write_('fund_tx:' + id + ':manifest:' + context.uuid(), fresh, context) };
    return ['fundTransactionsScan', month, 2];
  }

  function run(task, item, context) {
    var month = task[1] || '';
    function measure(phase, work) {
      return task[0] === 'fundTransactionsPublish' ? measurePublication_(context, phase, work) : work();
    }
    var capture = item.fundTransactionsCapture;
    var manifest = capture && measure('manifestRead', function () { return read_(capture.manifest, context); });
    if (!manifest || manifest.stamp !== measure('initialStamp', function () { return context.stamp(); })) {
      return { result: { ok: true }, added: [start_(item, month, context)] };
    }
    // The new manifest is durable in the queue before this next stage begins.
    measure('removeGarbage', function () { return remove_([capture.garbage], context); });
    delete capture.garbage;
    if (task[0] === 'fundTransactions') {
      return { result: { ok: true }, added: [[manifest.ready ? 'fundTransactionsPublish' : 'fundTransactionsScan', month, manifest.nextRow]] };
    }
    if (task[0] === 'fundTransactionsScan') {
      var started = Date.now();
      context.log('fund_transactions_page_start:' + manifest.nextRow);
      var page = context.readPage(manifest.nextRow);
      context.log('fund_transactions_page_done:' + manifest.nextRow + ':' + (Date.now() - started) + 'ms');
      var signature = context.hash(JSON.stringify([page.headers, page.columns]));
      if ((manifest.signature && manifest.signature !== signature) ||
          (manifest.lastRow !== undefined && manifest.lastRow !== page.lastRow) || manifest.stamp !== context.stamp()) {
        return { result: { ok: true }, added: [start_(item, month, context)] };
      }
      manifest.signature = signature;
      manifest.lastRow = page.lastRow;
      page.rawDateValues = (page.rawDateValues || []).map(function (row) {
        return row.map(function (value) { return value instanceof Date ? { dateISO: value.toISOString() } : value; });
      });
      manifest.blocks.push(write_('fund_tx:' + capture.id + ':page:' + manifest.nextRow, page, context));
      manifest.nextRow = page.nextRow || 0;
      manifest.ready = !manifest.nextRow;
      capture.garbage = capture.manifest;
      capture.manifest = write_('fund_tx:' + capture.id + ':manifest:' + context.uuid(), manifest, context);
      return { result: { ok: true }, added: [[manifest.ready ? 'fundTransactionsPublish' : 'fundTransactionsScan', month, manifest.nextRow]] };
    }
    if (task[0] !== 'fundTransactionsPublish' || !manifest.ready) throw new Error('Transaction source capture is not ready.');
    var keys = [];
    manifest.blocks.forEach(function (block) { keys = keys.concat(keys_(block)); });
    var values = measure('cacheGetAll', function () { return context.cache.getAll(keys); });
    var state = measure('begin', function () { return context.begin(month); });
    for (var i = 0; i < manifest.blocks.length; i++) {
      var snapshot = read_(manifest.blocks[i], context, values, measure);
      if (!snapshot) return { result: { ok: true }, added: [start_(item, month, context)] };
      snapshot.rawDateValues = measure('restoreDates', function () {
        return (snapshot.rawDateValues || []).map(function (row) {
          return row.map(function (value) { return value && typeof value === 'object' && value.dateISO ? new Date(value.dateISO) : value; });
        });
      });
      measure('append', function () { return context.append(state, snapshot, month); });
    }
    if (manifest.stamp !== measure('finalStamp', function () { return context.stamp(); })) return { result: { ok: true }, added: [start_(item, month, context)] };
    // Publication is idempotent; an ambiguous RPC or crash replays this stage.
    var payload = measure('finish', function () { return context.finish(state); });
    return { result: measure('publish', function () { return context.publish(month, payload); }) };
  }

  return { run: run };
})();
