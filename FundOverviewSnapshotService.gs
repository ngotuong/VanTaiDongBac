/** Ephemeral, chunked source capture. The durable lease restarts on cache loss. */
var FundOverviewSnapshotService = (function () {
  var TTL = 7200;
  function key_(capture, part, index) { return 'fund_capture:' + capture.id + ':' + part + ':' + index; }
  function store_(capture, part, payload, context) {
    var raw = JSON.stringify(payload);
    var pieces = [];
    // At most 64KB even for four-byte UTF-8 code points; Cache limit is 100KB.
    for (var offset = 0; offset < raw.length;) {
      var end = Math.min(raw.length, offset + 16000);
      var last = raw.charCodeAt(end - 1);
      if (end < raw.length && last >= 0xD800 && last <= 0xDBFF) end--;
      pieces.push(raw.slice(offset, end));
      offset = end;
    }
    var index = Number(capture.counts[part] || 0);
    var values = {};
    pieces.forEach(function (piece, i) { values[key_(capture, part, index + i)] = piece; });
    context.cache.putAll(values, TTL);
    capture.blocks[part].push({ start: index, count: pieces.length, hash: context.hash(raw) });
    capture.counts[part] = index + pieces.length;
  }
  function start(item, context) {
    item.fundCapture = { id: context.uuid(), stamp: context.stamp(), ready: false,
      counts: { transactions: 0, loans: 0, settings: 0 }, blocks: { transactions: [], loans: [], settings: [] } };
    return ['fundCapture', 'transactions', 2];
  }
  function run(task, item, context) {
    var capture = item.fundCapture;
    if (!capture || capture.stamp !== context.stamp()) {
      return { result: { ok: true }, added: [start(item, context)] };
    }
    var part = task[1];
    var page = context.read(part, Number(task[2] || 2), 200);
    store_(capture, part, page.rows, context);
    var next = page.nextRow ? ['fundCapture', part, page.nextRow]
      : part === 'transactions' ? ['fundCapture', 'loans', 2]
      : part === 'loans' ? ['fundCapture', 'settings', 2] : null;
    if (!next) capture.ready = true;
    return { result: { ok: true }, added: next ? [next] : [] };
  }
  function load(item, context) {
    var capture = item.fundCapture;
    if (!capture || !capture.ready || capture.stamp !== context.stamp()) return null;
    var result = {};
    for (var part in capture.blocks) {
      var rows = [];
      for (var b = 0; b < capture.blocks[part].length; b++) {
        var block = capture.blocks[part][b];
        var keys = [];
        for (var i = 0; i < block.count; i++) keys.push(key_(capture, part, block.start + i));
        var values = context.cache.getAll(keys);
        if (keys.some(function (key) { return typeof values[key] !== 'string'; })) return null;
        var raw = keys.map(function (key) { return values[key]; }).join('');
        if (context.hash(raw) !== block.hash) return null;
        var payload = JSON.parse(raw, function (key, value) {
          return ['dateObj', 'dataStartDate', 'loanStartDate'].indexOf(key) >= 0 && value ? new Date(value) : value;
        });
        if (part === 'settings') result.settings = payload;
        else rows = rows.concat(payload);
      }
      if (part !== 'settings') result[part] = rows;
    }
    return capture.stamp === context.stamp() ? result : null;
  }
  return { start: start, run: run, load: load };
})();
