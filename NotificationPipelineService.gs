/** Coordinates notification cache sync with transient-failure hysteresis. */
var NotificationPipelineService = (function () {
  function run(context) {
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
