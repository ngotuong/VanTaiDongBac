/** Installable events persist intent without Sheet RPCs or the shared ScriptLock. */
var SheetChangeSignalService = (function () {
  var BINDINGS = 'SUPABASE_SHEET_TRIGGER_BINDINGS_V1';
  function key_(module, context) {
    var year = String(context && context.year || '').trim();
    if (!/^20\d{2}$/.test(year)) throw new Error('Thiếu năm cho Sheet change signal.');
    return 'SUPABASE_SHEET_SIGNAL_' + module.toUpperCase() + '_' + year;
  }

  function register(triggers, context) {
    var bindings = {};
    (triggers || []).forEach(function (trigger) {
      var handler = trigger.getHandlerFunction();
      var expected = context.handlers[handler];
      if (!expected) return;
      if (String(trigger.getTriggerSourceId()) !== expected.spreadsheetId ||
          String(trigger.getEventType()) !== expected.eventType) throw new Error('Sheet trigger workbook/event binding mismatch: ' + handler);
      var uid = String(trigger.getUniqueId());
      if (!uid) throw new Error('Sheet trigger UID missing.');
      bindings[uid] = { handler: handler, spreadsheetId: expected.spreadsheetId };
    });
    Object.keys(context.handlers).forEach(function (handler) {
      if (!Object.keys(bindings).some(function (uid) { return bindings[uid].handler === handler; })) {
        throw new Error('Sheet trigger binding missing: ' + handler);
      }
    });
    context.setProperty(BINDINGS, JSON.stringify(bindings));
    return { ok: true, registered: Object.keys(bindings).length };
  }

  function record(event, module, handler, spreadsheetId, context) {
    var bindings = JSON.parse(context.getProperty(BINDINGS) || '{}');
    var binding = bindings[String(event && event.triggerUid || '')];
    if (!binding || binding.handler !== handler || binding.spreadsheetId !== spreadsheetId) {
      throw new Error('Sheet trigger workbook/UID binding missing or mismatched; register owner bindings before activation.');
    }
    var type = String(event && event.changeType || 'EDIT').toUpperCase();
    if (/Change$/.test(handler) && type === 'EDIT') return { ok: true, skipped: true, reason: 'Handled by onEdit.' };
    var scope = editScope_(event && event.range);
    var previous = parse_(context.getProperty(key_(module, context)));
    var consumed = context.getProperty(key_(module, context) + '_CONSUMED');
    var pendingPrevious = previous.token && String(previous.token) !== String(consumed || '');
    var scopes = pendingPrevious && previous.eventType === 'EDIT' && type === 'EDIT'
      ? (previous.scopes || []).slice() : [];
    if (scope) scopes.push(scope);
    if (scopes.length > 50) scopes = scopes.slice(scopes.length - 50);
    var token = context.createUuid();
    context.setProperty(key_(module, context), JSON.stringify({
      token: token,
      eventType: pendingPrevious && previous.eventType !== type ? 'CHANGE' : type,
      scopes: scopes,
      at: context.nowMillis()
    }));
    return { ok: true, queued: true, signaled: true };
  }

  function editScope_(range) {
    if (!range || !range.getGridId || !range.getRow || !range.getNumRows) return null;
    try {
      var gridId = Number(range.getGridId());
      var startRow = Number(range.getRow() || 0);
      var numRows = Number(range.getNumRows() || 0);
      if (!(gridId >= 0) || startRow < 1 || numRows < 1) return null;
      return { gridId: gridId, startRow: startRow, numRows: numRows };
    } catch (ignored) {
      return null;
    }
  }

  function parse_(raw) {
    if (!raw) return {};
    try {
      var value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch (ignored) {
      return {};
    }
  }

  function drain(module, context) {
    var key = key_(module, context);
    var raw = context.getProperty(key);
    if (!raw) return { pending: false };
    var signal = JSON.parse(raw);
    if (!signal.token) throw new Error('Malformed Sheet change signal.');
    if (context.getProperty(key + '_CONSUMED') === signal.token) return { pending: false };
    var result = context.enqueue(signal);
    if (!result || result.deferred || result.queued === false) {
      var error = new Error('Sheet signal refresh enqueue failed.');
      if (result && result.deferred) error.refreshDeferred = true;
      throw error;
    }
    // Never delete the signal. A later event racing enqueue/ACK has a different
    // token and is drained on the next tick; interrupted drains safely replay.
    context.setProperty(key + '_CONSUMED', signal.token);
    return { pending: true, queued: true };
  }
  return { register: register, record: record, drain: drain };
})();
