/** D5 operator-only feature-flag activation and rollback for the foreground lane. */
var SyncGenerationRolloutService = (function () {
  var KEYS = {
    generation: 'SYNC_GENERATION_SHADOW_ENABLED',
    dispatcher: 'SYNC_FOREGROUND_SHADOW_ENABLED',
    publication: 'SYNC_FOREGROUND_PUBLISH_ENABLED',
    allowlist: 'SYNC_FOREGROUND_PUBLISH_SPREADSHEET_IDS',
    audience: 'SYNC_FOREGROUND_PUBLICATION_AUDIENCE',
    expiresAt: 'SYNC_FOREGROUND_PUBLISH_EXPIRES_AT',
    mode: 'SYNC_FOREGROUND_PUBLISH_MODE',
    activatedAt: 'SYNC_FOREGROUND_PUBLISH_ACTIVATED_AT'
  };
  var CANARY_WINDOW_MS = 30 * 60 * 1000;

  function activateProductionCanary(context) {
    var ctx = context || defaultContext_();
    ctx.assertReconciler();
    var workbook = ctx.resolveWorkbook();
    if (!workbook.spreadsheetId || !/^20\d{2}$/.test(workbook.year)) {
      throw new Error('D5 rollout workbook identity không hợp lệ.');
    }
    var expiresAt = new Date(ctx.nowMillis() + CANARY_WINDOW_MS).toISOString();
    ctx.setProperties((function () {
      var values = {};
      values[KEYS.generation] = 'true';
      values[KEYS.dispatcher] = 'true';
      values[KEYS.publication] = 'true';
      values[KEYS.allowlist] = workbook.spreadsheetId;
      values[KEYS.audience] = 'production';
      values[KEYS.expiresAt] = expiresAt;
      values[KEYS.mode] = 'canary';
      values[KEYS.activatedAt] = new Date(ctx.nowMillis()).toISOString();
      return values;
    })());
    return status(ctx);
  }

  function activateProductionSteadyState(context) {
    var ctx = context || defaultContext_();
    ctx.assertReconciler();
    var workbook = ctx.resolveWorkbook();
    if (!workbook.spreadsheetId || !/^20\d{2}$/.test(workbook.year)) {
      throw new Error('D5 rollout workbook identity không hợp lệ.');
    }
    ctx.setProperties((function () {
      var values = {};
      values[KEYS.generation] = 'true';
      values[KEYS.dispatcher] = 'true';
      values[KEYS.publication] = 'true';
      values[KEYS.allowlist] = workbook.spreadsheetId;
      values[KEYS.audience] = 'production';
      values[KEYS.expiresAt] = '';
      values[KEYS.mode] = 'steady';
      values[KEYS.activatedAt] = new Date(ctx.nowMillis()).toISOString();
      return values;
    })());
    return status(ctx);
  }

  function rollback(context) {
    var ctx = context || defaultContext_();
    var values = {};
    values[KEYS.generation] = 'false';
    values[KEYS.dispatcher] = 'false';
    values[KEYS.publication] = 'false';
    values[KEYS.allowlist] = '';
    values[KEYS.audience] = 'preview';
    values[KEYS.mode] = '';
    values[KEYS.activatedAt] = '';
    ctx.setProperties(values);
    ctx.deleteProperty(KEYS.expiresAt);
    return status(ctx);
  }

  function status(context) {
    var ctx = context || defaultContext_();
    var values = ctx.getProperties();
    var expiresAt = String(values[KEYS.expiresAt] || '');
    var expiresMillis = new Date(expiresAt).getTime();
    var mode = String(values[KEYS.mode] || '').trim().toLowerCase();
    var generationEnabled = truthy_(values[KEYS.generation]);
    var dispatcherEnabled = truthy_(values[KEYS.dispatcher]);
    var publicationEnabled = truthy_(values[KEYS.publication]);
    var audience = String(values[KEYS.audience] || 'preview').trim().toLowerCase();
    var allowlistedSpreadsheetIds = String(values[KEYS.allowlist] || '').split(',').map(function (value) {
      return value.trim();
    }).filter(function (value) { return value; });
    return {
      generationEnabled: generationEnabled,
      dispatcherEnabled: dispatcherEnabled,
      publicationEnabled: publicationEnabled,
      allowlistedSpreadsheetIds: allowlistedSpreadsheetIds,
      audience: audience,
      rolloutMode: mode || 'off',
      activatedAt: String(values[KEYS.activatedAt] || ''),
      expiresAt: expiresAt,
      windowActive: mode === 'canary' && isFinite(expiresMillis) && expiresMillis > ctx.nowMillis(),
      steadyStateActive: mode === 'steady' && generationEnabled && dispatcherEnabled && publicationEnabled &&
        audience === 'production' && allowlistedSpreadsheetIds.length === 1 && !expiresAt,
      reconcilerTriggerCount: ctx.reconcilerTriggerCount()
    };
  }

  function truthy_(value) {
    return ['1', 'true', 'yes', 'on'].indexOf(String(value || '').trim().toLowerCase()) !== -1;
  }

  function defaultContext_() {
    var properties = PropertiesService.getScriptProperties();
    return {
      resolveWorkbook: function () {
        AppConfig.activate({ year: String(APP_CONFIG.year || '') });
        return { spreadsheetId: String(APP_CONFIG.spreadsheetId || ''), year: String(APP_CONFIG.year || '') };
      },
      nowMillis: function () { return new Date().getTime(); },
      setProperties: function (values) { properties.setProperties(values, false); },
      getProperties: function () { return properties.getProperties(); },
      deleteProperty: function (key) { properties.deleteProperty(key); },
      reconcilerTriggerCount: function () {
        return ScriptApp.getProjectTriggers().filter(function (trigger) {
          return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'reconcileSyncGenerationShadow';
        }).length;
      },
      assertReconciler: function () {
        var count = this.reconcilerTriggerCount();
        if (count !== 1) throw new Error('D5 rollout yêu cầu đúng một trigger reconcileSyncGenerationShadow; hiện có ' + count + '.');
      }
    };
  }

  return {
    activateProductionCanary: activateProductionCanary,
    activateProductionSteadyState: activateProductionSteadyState,
    rollback: rollback,
    status: status
  };
})();

function activateSyncGenerationProductionCanary() {
  return SyncGenerationRolloutService.activateProductionCanary();
}

function activateSyncGenerationProductionSteadyState() {
  return SyncGenerationRolloutService.activateProductionSteadyState();
}

function rollbackSyncGenerationForeground() {
  return SyncGenerationRolloutService.rollback();
}

function getSyncGenerationRolloutStatus() {
  return SyncGenerationRolloutService.status();
}
