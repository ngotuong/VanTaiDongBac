/** Calls the Vercel delivery endpoint only after production rollout enables it. */
var NotificationDispatchService = (function () {
  function dispatch(context) {
    var properties = PropertiesService.getScriptProperties();
    if (String(properties.getProperty('NOTIFICATION_DISPATCH_ENABLED') || '').toLowerCase() !== 'true') {
      return { ok: true, skipped: true, reason: 'Notification dispatch is disabled.' };
    }
    var url = String(properties.getProperty('NOTIFICATION_DISPATCH_URL') || '').trim();
    var secret = String(properties.getProperty('NOTIFICATION_DISPATCH_SECRET') || '').trim();
    if (!/^https:\/\//.test(url) || !secret) throw new Error('Thiếu cấu hình notification dispatch URL/secret.');
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ action: 'scheduled', requestedAt: context.nowISOString() }),
      muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (status < 200 || status >= 300) throw new Error('Notification dispatch HTTP ' + status + '.');
    return JSON.parse(response.getContentText() || '{}');
  }

  return { dispatch: dispatch };
})();
