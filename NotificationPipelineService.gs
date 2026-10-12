/** Coordinates notification cache sync with transient-failure hysteresis. */
var NotificationPipelineService = (function () {
  function run(context) {
    if (context.cursorKey) return runStaged_(context);
    var nextAt = Number(context.getProperty(context.nextAtKey) || 0);
    if (nextAt > context.nowMillis) return { checked: false };
    context.setProperty(context.nextAtKey, String(context.nowMillis + context.intervalMs));

    var results = [];
    var errors = [];
    context.runStep(results, errors, 'tripNotifications', context.syncTripNotifications);
    context.runStep(results, errors, 'operationalNotifications', context.syncOperationalNotifications);
    context.runStep(results, errors, 'dailyBusinessSummary', context.syncDailyBusinessSummary);

    var previousFailures = failureCount_(context);
    if (errors.length) {
      return recordFailure_(context, results, errors, previousFailures, true);
    }

    if (previousFailures >= context.failureThreshold) {
      context.writeStatus(
        'notification_pipeline',
        'system',
        'ok',
        'Notification bundles synced and delivery evaluated.',
        context.nowISOString
      );
      context.deleteProperty(context.failureCountKey);
      previousFailures = 0;
    }

    var dispatchErrors = [];
    context.runStep(results, dispatchErrors, 'notificationDispatch', context.dispatchNotifications);
    if (dispatchErrors.length) {
      return recordFailure_(context, results, dispatchErrors, previousFailures, false);
    }

    context.deleteProperty(context.failureCountKey);
    context.writeStatus(
      'notification_pipeline',
      'system',
      'ok',
      'Notification bundles synced and delivery evaluated.',
      context.nowISOString
    );
    return { checked: true, ok: true, consecutiveFailures: 0, results: results };
  }

  // Cursor is persisted only after a successful step. A hard crash replays
  // that step; bundle writes are idempotent and delivery remains at-least-once.
  function runStaged_(context) {
    if (Number(context.getProperty(context.nextAtKey) || 0) > context.nowMillis) return { checked: false };
    var cursor = { index: 0 };
    var cursorRaw = context.getProperty(context.cursorKey);
    try { cursor = JSON.parse(cursorRaw || '{"index":0}'); } catch (ignore) {}
    if (!cursor || !(cursor.index >= 0 && cursor.index <= 3 && Math.floor(cursor.index) === cursor.index)) cursor = { index: 0 };
    var steps = [context.syncTripNotifications, context.syncOperationalNotifications, context.syncDailyBusinessSummary, context.dispatchNotifications];
    var names = ['tripNotifications', 'operationalNotifications', 'dailyBusinessSummary', 'notificationDispatch'];
    var results = [], errors = [];
    if (cursor.alertPending && context.now() >= context.deadlineMillis) return { checked: true, ok: true, continuing: true };
    if (cursor.alertPending && cursor.index < 3) {
      var alertErrors = [];
      runStagedStep_(context, results, alertErrors, 'notificationDispatch', context.dispatchNotifications);
      if (!alertErrors.length) delete cursor.alertPending;
      else context.log('notification_pipeline_alert_delivery_failed: notificationDispatch');
      // Alert delivery must not block recovery of the source bundles.
      context.setProperty(context.cursorKey, JSON.stringify(cursor));
    }
    while (cursor.index < steps.length) {
      if (context.now() >= context.deadlineMillis) {
        return { checked: true, ok: true, continuing: true, nextStep: names[cursor.index], results: results };
      }
      // Recover the pipeline status before delivering freshly rebuilt bundles.
      if (cursor.index === 3 && cursor.failureIndex < 3 && failureCount_(context) >= context.failureThreshold) {
        context.writeStatus('notification_pipeline', 'system', 'ok', 'Notification bundles synced and delivery evaluated.', context.nowISOString);
        context.deleteProperty(context.failureCountKey);
        delete cursor.failureIndex;
        context.setProperty(context.cursorKey, JSON.stringify(cursor));
      }
      runStagedStep_(context, results, errors, names[cursor.index], steps[cursor.index]);
      if (errors.length) {
        cursor.failureIndex = cursor.index;
        var failed = recordFailure_(context, results, errors, failureCount_(context), false);
        if (cursor.index < 3 && failed.alertRaised) cursor.alertPending = true;
        context.setProperty(context.cursorKey, JSON.stringify(cursor));
        return failed;
      }
      cursor.index++;
      if (cursor.index === 3) delete cursor.alertPending;
      // Persist index 4 as index 0 only after final status succeeds below.
      if (cursor.index < steps.length) context.setProperty(context.cursorKey, JSON.stringify(cursor));
    }
    context.writeStatus('notification_pipeline', 'system', 'ok', 'Notification bundles synced and delivery evaluated.', context.nowISOString);
    context.deleteProperty(context.failureCountKey);
    context.deleteProperty(context.cursorKey);
    context.setProperty(context.nextAtKey, String(context.now() + context.intervalMs));
    return { checked: true, ok: true, consecutiveFailures: 0, results: results };
  }

  function runStagedStep_(context, results, errors, name, fn) {
    context.runStep(results, errors, name, fn);
    var last = results[results.length - 1];
    if (last && last.name === name && (!last.result || last.result.ok === false)) {
      errors.push({ name: name, error: 'Notification step did not succeed.' });
    }
  }

  function recordFailure_(context, results, errors, previousFailures, dispatchAlert) {
    var count = previousFailures + 1;
    context.setProperty(context.nextAtKey, String(context.nowMillis + context.retryMs));
    context.setProperty(context.failureCountKey, String(count));
    var failedSteps = errors.map(function (entry) { return entry.name; }).join(', ');
    context.log('notification_pipeline_attempt_failed: ' + count + '/' + context.failureThreshold + ' [' + failedSteps + ']');

    if (count === context.failureThreshold) {
      context.writeStatus(
        'notification_pipeline',
        'system',
        'error',
        'Pipeline thông báo không thể hoàn tất sau ' + count + ' lần thử liên tiếp. Vui lòng mở Trạng thái đồng bộ để kiểm tra.',
        context.nowISOString
      );
    }

    if (dispatchAlert && count >= context.failureThreshold) {
      var dispatchErrors = [];
      context.runStep(results, dispatchErrors, 'notificationDispatch', context.dispatchNotifications);
      if (dispatchErrors.length) {
        context.log('notification_pipeline_alert_delivery_failed: notificationDispatch');
        errors = errors.concat(dispatchErrors);
      }
    }

    return {
      checked: true,
      ok: false,
      consecutiveFailures: count,
      alertRaised: count >= context.failureThreshold,
      results: results,
      errors: errors
    };
  }

  function failureCount_(context) {
    var value = Number(context.getProperty(context.failureCountKey) || 0);
    return isNaN(value) || value < 0 ? 0 : Math.floor(value);
  }

  return { run: run };
})();
