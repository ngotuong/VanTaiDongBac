/** Installable events persist intent without Sheet RPCs or the shared ScriptLock. */
var SheetChangeSignalService = (function () {
  var BINDINGS = 'SUPABASE_SHEET_TRIGGER_BINDINGS_V1';
  function key_(module) { return 'SUPABASE_SHEET_SIGNAL_' + module.toUpperCase(); }

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
    var token = context.createUuid();
    context.setProperty(key_(module), JSON.stringify({ token: token, eventType: type, at: context.nowMillis() }));
    return { ok: true, queued: true, signaled: true };
  }

  function drain(module, context) {
    var key = key_(module);
    var raw = context.getProperty(key);
    if (!raw) return { pending: false };
    var signal = JSON.parse(raw);
    if (!signal.token) throw new Error('Malformed Sheet change signal.');
    if (context.getProperty(key + '_CONSUMED') === signal.token) return { pending: false };
    var result = context.enqueue(signal);
    if (!result || result.deferred || result.queued === false) throw new Error('Sheet signal refresh enqueue failed.');
    // Never delete the signal. A later event racing enqueue/ACK has a different
    // token and is drained on the next tick; interrupted drains safely replay.
    context.setProperty(key + '_CONSUMED', signal.token);
    return { pending: true, queued: true };
  }
  return { register: register, record: record, drain: drain };
})();
