/**
 * Administrator-only yearly workbook provisioning. Every Sheet mutation is
 * restricted to newly created copies and to exact ranges in an approved
 * manifest. Source workbooks are opened read-only and never edited here.
 */
var YearWorkbookProvisioningService = (function () {
  var YEAR = /^20\d{2}$/;
  var A1_RANGE = /^[A-Z]{1,3}[1-9][0-9]*(?::[A-Z]{1,3}[1-9][0-9]*)?$/;
  var MAX_OPERATION_CELLS = 250000;
  var TRANSPORT_PREFIX = 'SPREADSHEET_ID_';
  var FUND_PREFIX = 'FUND_SPREADSHEET_ID_';
  var CASHFLOW_PREFIX = 'CASHFLOW_SPREADSHEET_ID_';
  var MANIFEST_PREFIX = 'YEAR_ROLLOVER_MANIFEST_';
  var GENERIC_MANIFEST = 'YEAR_ROLLOVER_MANIFEST_JSON';
  var CANARY_ACTIVE_JOB = 'YEAR_ROLLOVER_CANARY_ACTIVE_JOB';
  var CANARY_JOB_PREFIX = 'YEAR_ROLLOVER_CANARY_JOB_';
  var CANARY_TRIGGER_HANDLER = 'runYearRolloverCanaryJob';
  var ROLLOVER_ACTIVE_JOB = 'YEAR_ROLLOVER_ACTIVE_JOB';
  var ROLLOVER_JOB_PREFIX = 'YEAR_ROLLOVER_JOB_';
  var ROLLOVER_AUDIT_RESULT_SUFFIX = '_AUDIT_RESULT_';
  var ROLLOVER_AUDIT_PLAN_VERSION = 2;
  var ROLLOVER_MAX_AUDIT_STEPS = 128;
  var ROLLOVER_PREPARE_TRIGGER_HANDLER = 'runYearRolloverProvisionJob';
  var ROLLOVER_AUDIT_TRIGGER_HANDLER = 'runYearRolloverAuditJob';

  function status(sourceYear, targetYear) {
    var years = years_(sourceYear, targetYear);
    var props = PropertiesService.getScriptProperties();
    var source = sourceIds_(props, years.sourceYear);
    var target = targetIds_(props, years.targetYear);
    var manifest = manifestResult_(props, years);
    var registry = { ready: true, contexts: [], latestRun: null, error: '' };
    try {
      registry.contexts = SupabaseHttpClient.readRows('workbook_contexts', {
        select: 'year,lifecycle_status,source_year,workbook_names,audit_summary,prepared_at,activated_at,updated_at',
        order: 'year.desc'
      }).map(safeContext_);
      var runs = SupabaseHttpClient.readRows('workbook_rollover_runs', {
        select: 'run_id,source_year,target_year,status,manifest_version,plan,audit_report,error_message,created_by,created_at,updated_at',
        target_year: 'eq.' + years.targetYear,
        order: 'updated_at.desc',
        limit: 1
      });
      registry.latestRun = runs.length ? safeRun_(runs[0]) : null;
    } catch (error) {
      registry.ready = false;
      registry.error = errorMessage_(error);
    }
    return {
      ok: true,
      sourceYear: years.sourceYear,
      targetYear: years.targetYear,
      sourceConfigured: Boolean(source.transport && source.cashflow),
      targetConfigured: Boolean(target.transport && target.cashflow),
      manifest: manifest.public,
      registry: registry
    };
  }

  function preview(sourceYear, targetYear, actor) {
    assertAdminActor_(actor);
    var years = years_(sourceYear, targetYear);
    var props = PropertiesService.getScriptProperties();
    var ids = sourceIds_(props, years.sourceYear);
    var manifest = requireManifest_(props, years);
    if (!ids.transport || !ids.cashflow) throw new Error('Năm nguồn chưa có đủ workbook Vận tải và Thu chi.');
    if (targetIds_(props, years.targetYear).transport || targetIds_(props, years.targetYear).cashflow) {
      throw new Error('Năm đích đã có workbook được đăng ký; từ chối tạo bản sao trùng.');
    }
    var sourceTransport = SpreadsheetApp.openById(ids.transport);
    var sourceCashflow = SpreadsheetApp.openById(ids.cashflow);
    var operations = manifest.operations;
    var preflight = inspectCanaryReadiness_(manifest, years, ids, {
      transport: sourceTransport,
      cashflow: sourceCashflow
    });
    return {
      ok: true,
      dryRun: true,
      sourceYear: years.sourceYear,
      targetYear: years.targetYear,
      manifestVersion: manifest.version,
      sourceWorkbookNames: { transport: sourceTransport.getName(), cashflow: sourceCashflow.getName() },
      targetWorkbookNames: manifest.names,
      destinationFolderConfigured: Boolean(manifest.destinationFolderId),
      operationCounts: {
        clearRanges: operations.clearRanges.length,
        formulaReplacements: operations.formulaReplacements.length,
        carryovers: operations.carryovers.length,
        snapshots: operations.snapshots.length,
        setValues: operations.setValues.length
      },
      preflight: preflight,
      safeguards: [
        'Chỉ đọc hai workbook nguồn đã allowlist.',
        'Chỉ sửa hai bản sao vừa tạo và các range chính xác trong manifest.',
        'Giữ nguyên công thức trong mọi vùng clear.',
        'Không kích hoạt năm mới trong bước tạo.'
      ]
    };
  }

  function canary(sourceYear, targetYear, actor) {
    assertAdminActor_(actor);
    var years = years_(sourceYear, targetYear);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Một lượt chuẩn bị năm mới khác đang chạy.');
    try {
      var props = PropertiesService.getScriptProperties();
      var activeRunId = String(props.getProperty(CANARY_ACTIVE_JOB) || '').trim();
      if (activeRunId) {
        var activeJob = readCanaryJob_(props, activeRunId);
        if (activeJob) {
          return {
            ok: true, accepted: true, reused: true, canary: true,
            runId: activeRunId, status: 'running',
            sourceYear: activeJob.sourceYear, targetYear: activeJob.targetYear
          };
        }
        props.deleteProperty(CANARY_ACTIVE_JOB);
      }

      var manifest = requireManifest_(props, years);
      var source = sourceIds_(props, years.sourceYear);
      if (!source.transport || !source.cashflow) throw new Error('Năm nguồn chưa có đủ workbook Vận tải và Thu chi.');
      var existing = targetIds_(props, years.targetYear);
      if (existing.transport || existing.cashflow) throw new Error('Năm đích đã có workbook được đăng ký; không chạy canary trên năm đã tạo.');
      SupabaseHttpClient.readRows('workbook_contexts', { select: 'year', limit: 1 });

      var runId = Utilities.getUuid();
      var now = new Date().toISOString();
      var plan = safePlan_(manifest);
      plan.canary = true;
      writeRun_({
        run_id: runId, source_year: years.sourceYear, target_year: years.targetYear,
        status: 'planned', manifest_version: manifest.version,
        plan: plan, audit_report: {}, error_message: '',
        created_by: actorLabel_(actor), created_at: now, updated_at: now
      });
      props.setProperty(CANARY_JOB_PREFIX + runId, JSON.stringify({
        runId: runId,
        sourceYear: years.sourceYear,
        targetYear: years.targetYear,
        createdAt: now
      }));
      props.setProperty(CANARY_ACTIVE_JOB, runId);
      try {
        ScriptApp.newTrigger(CANARY_TRIGGER_HANDLER).timeBased().after(1000).create();
      } catch (triggerError) {
        props.deleteProperty(CANARY_JOB_PREFIX + runId);
        props.deleteProperty(CANARY_ACTIVE_JOB);
        failRun_(runId, triggerError);
        throw triggerError;
      }
      return {
        ok: true, accepted: true, canary: true, runId: runId,
        status: 'planned', sourceYear: years.sourceYear, targetYear: years.targetYear
      };
    } finally {
      lock.releaseLock();
    }
  }

  function runCanaryJob(event) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Một lượt chuẩn bị năm mới khác đang chạy.');
    var props = PropertiesService.getScriptProperties();
    var runId = String(props.getProperty(CANARY_ACTIVE_JOB) || '').trim();
    try {
      if (!runId) return;
      var job = readCanaryJob_(props, runId);
      if (!job) throw new Error('Không tìm thấy payload canary nền.');
      updateRun_(runId, { status: 'copying', updated_at: new Date().toISOString() });
      var result = executeCanary_(job.sourceYear, job.targetYear, runId);
      updateRun_(runId, {
        status: 'ready',
        audit_report: {
          ok: true, canary: true, cleanedUp: result.cleanedUp === true,
          checks: result.checks || {}, snapshots: result.snapshots || []
        },
        error_message: '', updated_at: new Date().toISOString()
      });
      return result;
    } catch (error) {
      if (runId) failRun_(runId, error);
      throw error;
    } finally {
      if (runId) props.deleteProperty(CANARY_JOB_PREFIX + runId);
      props.deleteProperty(CANARY_ACTIVE_JOB);
      deleteCanaryTriggers_(event);
      lock.releaseLock();
    }
  }

  function executeCanary_(sourceYear, targetYear, runId) {
    var years = years_(sourceYear, targetYear);
    var stage = 'khởi tạo';
    var source = { transport: '', cashflow: '' };
    var manifest = null;
    var transportCopy = null;
    var cashflowCopy = null;
    var result = null;
    var failure = null;
    try {
      var props = PropertiesService.getScriptProperties();
      stage = 'đọc manifest';
      manifest = requireManifest_(props, years);
      stage = 'đọc cấu hình workbook nguồn';
      source = sourceIds_(props, years.sourceYear);
      if (!source.transport || !source.cashflow) throw new Error('Năm nguồn chưa có đủ workbook Vận tải và Thu chi.');
      var existing = targetIds_(props, years.targetYear);
      if (existing.transport || existing.cashflow) throw new Error('Năm đích đã có workbook được đăng ký; không chạy canary trên năm đã tạo.');
      stage = 'kiểm tra registry';
      SupabaseHttpClient.readRows('workbook_contexts', { select: 'year', limit: 1 });
      stage = 'mở file nguồn trên Drive';
      var sourceTransportFile = DriveApp.getFileById(source.transport);
      var sourceCashflowFile = DriveApp.getFileById(source.cashflow);
      stage = 'mở thư mục đích trên Drive';
      var folder = DriveApp.getFolderById(manifest.destinationFolderId);
      var nonce = Utilities.getUuid().slice(0, 8);
      stage = 'tạo bản sao Vận tải';
      transportCopy = sourceTransportFile.makeCopy('__CANARY_ROLLOVER_' + years.targetYear + '_' + nonce + '_TRANSPORT', folder);
      stage = 'tạo bản sao Thu chi';
      cashflowCopy = sourceCashflowFile.makeCopy('__CANARY_ROLLOVER_' + years.targetYear + '_' + nonce + '_CASHFLOW', folder);
      if (runId) updateRun_(runId, { status: 'auditing', updated_at: new Date().toISOString() });
      stage = 'áp manifest';
      try {
        var target = { transport: transportCopy.getId(), cashflow: cashflowCopy.getId() };
        var snapshotEvidence = applyManifest_(manifest, years, source, target);
        stage = 'flush Google Sheets';
        SpreadsheetApp.flush();
        stage = 'audit bản sao';
        var checks = auditCanary_(manifest, years, source, target);
        result = {
          ok: true, canary: true, sourceYear: years.sourceYear, targetYear: years.targetYear,
          manifestVersion: manifest.version, checks: checks, snapshots: snapshotEvidence, cleanedUp: false
        };
      } catch (error) { failure = canaryStageError_(stage, error); }
    } catch (error) {
      failure = canaryStageError_(stage, error);
    }
    var cleanupErrors = [];
    trashCanary_(transportCopy, 'Vận tải', cleanupErrors);
    trashCanary_(cashflowCopy, 'Thu chi', cleanupErrors);
    if (cleanupErrors.length) {
      throw new Error((failure ? errorMessage_(failure) + ' | ' : '') + 'Không dọn sạch canary: ' + cleanupErrors.join(' | '));
    }
    if (failure) throw failure;
    result.cleanedUp = true;
    return result;
  }

  function provision(sourceYear, targetYear, actor) {
    return queueRolloverJob_('provision', sourceYear, targetYear, actor);
  }

  function audit(sourceYear, targetYear, actor) {
    return queueRolloverJob_('audit', sourceYear, targetYear, actor);
  }

  function resume(sourceYear, targetYear, actor) {
    return queueRolloverJob_('resume', sourceYear, targetYear, actor);
  }

  function queueRolloverJob_(mode, sourceYear, targetYear, actor) {
    assertAdminActor_(actor);
    if (['provision', 'resume', 'audit'].indexOf(mode) < 0) throw new Error('Pha chuẩn bị năm mới không hợp lệ.');
    var years = years_(sourceYear, targetYear);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Một lượt chuẩn bị năm mới khác đang chạy.');
    try {
      var props = PropertiesService.getScriptProperties();
      var activeRunId = String(props.getProperty(ROLLOVER_ACTIVE_JOB) || '').trim();
      if (activeRunId) {
        var activeJob = readRolloverJob_(props, activeRunId);
        if (activeJob) {
          ensureRolloverTrigger_(
            activeJob.stage === 'audit' ? ROLLOVER_AUDIT_TRIGGER_HANDLER : ROLLOVER_PREPARE_TRIGGER_HANDLER,
            isRolloverJobStale_(activeJob)
          );
          return {
            ok: true, accepted: true, reused: true, background: true,
            runId: activeRunId, status: activeJob.stage === 'audit' ? 'auditing' : 'copying',
            sourceYear: activeJob.sourceYear, targetYear: activeJob.targetYear
          };
        }
        props.deleteProperty(ROLLOVER_ACTIVE_JOB);
      }

      var manifest = requireManifest_(props, years);
      var source = sourceIds_(props, years.sourceYear);
      if (!source.transport || !source.cashflow) throw new Error('Năm nguồn chưa có đủ workbook Vận tải và Thu chi.');
      var target = targetIds_(props, years.targetYear);
      if (mode === 'provision' && (target.transport || target.cashflow)) {
        throw new Error('Năm đích đã có workbook được đăng ký; hãy tiếp tục bản hiện có.');
      }
      if (mode !== 'provision' && (!target.transport || !target.cashflow)) {
        throw new Error('Năm đích chưa có đủ hai workbook để tiếp tục.');
      }
      SupabaseHttpClient.readRows('workbook_contexts', { select: 'year', limit: 1 });

      var runId = Utilities.getUuid();
      var now = new Date().toISOString();
      var plan = safePlan_(manifest);
      plan.background = true;
      plan.mode = mode;
      writeRun_({
        run_id: runId, source_year: years.sourceYear, target_year: years.targetYear,
        status: 'planned', manifest_version: manifest.version,
        transport_target_id: target.transport || null,
        cashflow_target_id: target.cashflow || null,
        plan: plan, audit_report: {}, error_message: '',
        created_by: actorLabel_(actor), created_at: now, updated_at: now
      });
      var job = {
        runId: runId,
        sourceYear: years.sourceYear,
        targetYear: years.targetYear,
        mode: mode,
        stage: mode === 'audit' ? 'audit' : 'prepare',
        createdBy: actorLabel_(actor),
        createdAt: now,
        updatedAt: now
      };
      props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
      props.setProperty(ROLLOVER_ACTIVE_JOB, runId);
      try {
        ensureRolloverTrigger_(job.stage === 'audit' ? ROLLOVER_AUDIT_TRIGGER_HANDLER : ROLLOVER_PREPARE_TRIGGER_HANDLER);
      } catch (triggerError) {
        clearRolloverJob_(props, runId);
        failRun_(runId, triggerError);
        throw triggerError;
      }
      return {
        ok: true, accepted: true, background: true, runId: runId,
        status: 'planned', sourceYear: years.sourceYear, targetYear: years.targetYear,
        workbookNames: manifest.names
      };
    } finally {
      lock.releaseLock();
    }
  }

  function runProvisionJob(event) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Một lượt chuẩn bị năm mới khác đang chạy.');
    var props = PropertiesService.getScriptProperties();
    var runId = String(props.getProperty(ROLLOVER_ACTIVE_JOB) || '').trim();
    var target = { transport: '', cashflow: '' };
    try {
      if (!runId) return;
      var job = readRolloverJob_(props, runId);
      if (!job) throw new Error('Không tìm thấy payload chuẩn bị workbook nền.');
      if (job.stage !== 'prepare') return;
      var years = years_(job.sourceYear, job.targetYear);
      var manifest = requireManifest_(props, years);
      var source = sourceIds_(props, years.sourceYear);
      if (!source.transport || !source.cashflow) throw new Error('Năm nguồn chưa có đủ workbook Vận tải và Thu chi.');
      target = targetIds_(props, years.targetYear);
      updateRun_(runId, { status: 'copying', updated_at: new Date().toISOString() });

      if (job.mode === 'provision' && !target.transport && !target.cashflow) {
        var folder = DriveApp.getFolderById(manifest.destinationFolderId);
        if (!job.transportTargetId) {
          job.transportTargetId = DriveApp.getFileById(source.transport).makeCopy(manifest.names.transport, folder).getId();
          job.updatedAt = new Date().toISOString();
          props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
        }
        if (!job.cashflowTargetId) {
          job.cashflowTargetId = DriveApp.getFileById(source.cashflow).makeCopy(manifest.names.cashflow, folder).getId();
          job.updatedAt = new Date().toISOString();
          props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
        }
        target = { transport: job.transportTargetId, cashflow: job.cashflowTargetId };
        props.setProperties((function () {
          var values = {};
          values[TRANSPORT_PREFIX + years.targetYear] = target.transport;
          values[FUND_PREFIX + years.targetYear] = target.cashflow;
          values[CASHFLOW_PREFIX + years.targetYear] = target.cashflow;
          return values;
        })(), false);
        registerContexts_(years, source, target, manifest, { role: 'admin', username: job.createdBy || 'admin' });
      } else {
        if (!target.transport || !target.cashflow) throw new Error('Năm đích chưa có đủ hai workbook để tiếp tục.');
      }

      updateRun_(runId, {
        transport_target_id: target.transport,
        cashflow_target_id: target.cashflow,
        status: 'copying',
        updated_at: new Date().toISOString()
      });
      var steps = manifestSteps_(manifest);
      var applyIndex = Math.max(0, Number(job.applyIndex || 0));
      if (applyIndex < steps.length) {
        applyManifestStep_(steps[applyIndex], years, source, target);
        SpreadsheetApp.flush();
        job.applyIndex = applyIndex + 1;
        job.updatedAt = new Date().toISOString();
        props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
        updateRun_(runId, { status: 'copying', updated_at: job.updatedAt });
        replaceRolloverTrigger_(event, ROLLOVER_PREPARE_TRIGGER_HANDLER, ROLLOVER_PREPARE_TRIGGER_HANDLER);
        return {
          ok: true, accepted: true, runId: runId, status: 'copying',
          progress: { completed: job.applyIndex, total: steps.length }
        };
      }
      SpreadsheetApp.flush();
      updateContext_(years.targetYear, { lifecycle_status: 'draft', updated_at: new Date().toISOString() });
      updateRun_(runId, { status: 'auditing', updated_at: new Date().toISOString() });
      job.stage = 'audit';
      job.updatedAt = new Date().toISOString();
      props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
      replaceRolloverTrigger_(event, ROLLOVER_PREPARE_TRIGGER_HANDLER, ROLLOVER_AUDIT_TRIGGER_HANDLER);
      return { ok: true, accepted: true, runId: runId, status: 'auditing' };
    } catch (error) {
      if (runId) failRun_(runId, error);
      try { if (runId) updateContext_(job && job.targetYear || '', { lifecycle_status: 'failed', updated_at: new Date().toISOString() }); } catch (ignore) {}
      clearRolloverJob_(props, runId);
      deleteRolloverTriggers_();
      throw error;
    } finally {
      deleteRolloverTriggers_(event, ROLLOVER_PREPARE_TRIGGER_HANDLER);
      lock.releaseLock();
    }
  }

  function runAuditJob(event) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Một lượt chuẩn bị năm mới khác đang chạy.');
    var props = PropertiesService.getScriptProperties();
    var runId = String(props.getProperty(ROLLOVER_ACTIVE_JOB) || '').trim();
    var clearJob = true;
    var job = null;
    var auditStepName = '';
    var checkpointed = false;
    try {
      if (!runId) return;
      job = readRolloverJob_(props, runId);
      if (!job) throw new Error('Không tìm thấy payload audit workbook nền.');
      if (job.stage !== 'audit') {
        clearJob = false;
        return;
      }
      var years = years_(job.sourceYear, job.targetYear);
      updateRun_(runId, { status: 'auditing', updated_at: new Date().toISOString() });
      checkpointed = typeof YearRolloverMigration.auditSteps === 'function' &&
        typeof YearRolloverMigration.auditStep === 'function' &&
        typeof YearRolloverMigration.combineAuditSteps === 'function';
      var report;
      if (checkpointed) {
        if (Number(job.auditPlanVersion || 0) !== ROLLOVER_AUDIT_PLAN_VERSION || !Array.isArray(job.auditSteps)) {
          clearAuditResults_(props, runId);
          job.auditPlanVersion = ROLLOVER_AUDIT_PLAN_VERSION;
          job.auditSteps = YearRolloverMigration.auditSteps(years.sourceYear, years.targetYear);
          job.auditIndex = 0;
          job.auditAttempts = 0;
          job.lastAuditError = '';
          job.updatedAt = new Date().toISOString();
          props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
          updateRun_(runId, { status: 'auditing', error_message: '', updated_at: job.updatedAt });
        }
        var steps = job.auditSteps.slice();
        var auditIndex = Math.max(0, Number(job.auditIndex || 0));
        if (auditIndex < steps.length) {
          auditStepName = String(steps[auditIndex]);
          if (Number(job.auditAttempts || 0) >= 3) {
            throw new Error('Bước audit ' + auditStepName + ' đã hết 3 lượt thử tự động.');
          }
          job.auditAttempts = Number(job.auditAttempts || 0) + 1;
          job.updatedAt = new Date().toISOString();
          props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
          updateRun_(runId, { status: 'auditing', error_message: '', updated_at: job.updatedAt });
          replaceRolloverTrigger_(event, ROLLOVER_AUDIT_TRIGGER_HANDLER, ROLLOVER_AUDIT_TRIGGER_HANDLER, 7 * 60 * 1000);
          clearJob = false;
          var partial = YearRolloverMigration.auditStep(years.sourceYear, years.targetYear, auditStepName);
          props.setProperty(auditResultKey_(runId, auditIndex), JSON.stringify(partial));
          job.auditIndex = auditIndex + 1;
          job.auditAttempts = 0;
          job.lastAuditError = '';
          job.updatedAt = new Date().toISOString();
          props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
          updateRun_(runId, { status: 'auditing', error_message: '', updated_at: job.updatedAt });
          replaceRolloverTrigger_(event, ROLLOVER_AUDIT_TRIGGER_HANDLER, ROLLOVER_AUDIT_TRIGGER_HANDLER);
          return {
            ok: true, accepted: true, runId: runId, status: 'auditing',
            progress: { completed: job.auditIndex, total: steps.length, step: auditStepName }
          };
        }
        report = YearRolloverMigration.combineAuditSteps(
          years.sourceYear,
          years.targetYear,
          readAuditResults_(props, runId, steps.length)
        );
      } else {
        report = YearRolloverMigration.audit(years.sourceYear, years.targetYear);
      }
      var skipped = report.details && report.details.formulaRisks && report.details.formulaRisks.skippedSheets || [];
      if (skipped.length) report.blockers.push('Có sheet vượt giới hạn audit công thức; cần kiểm tra trước khi kích hoạt.');
      report.ok = report.blockers.length === 0;
      var safe = safeAudit_(report);
      var statusValue = report.ok ? 'ready' : 'failed';
      updateContext_(years.targetYear, {
        lifecycle_status: statusValue,
        audit_summary: safe,
        prepared_at: report.ok ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      });
      updateRun_(runId, {
        status: statusValue,
        audit_report: safe,
        error_message: report.ok ? '' : report.blockers.join(' | '),
        updated_at: new Date().toISOString()
      });
      clearJob = true;
      return { ok: true, auditOk: report.ok, runId: runId, status: statusValue, audit: safe };
    } catch (error) {
      if (runId && job && job.stage === 'audit' && checkpointed && auditStepName && Number(job.auditAttempts || 0) < 3) {
        job.lastAuditError = errorMessage_(error);
        job.updatedAt = new Date().toISOString();
        props.setProperty(ROLLOVER_JOB_PREFIX + runId, JSON.stringify(job));
        updateRun_(runId, {
          status: 'auditing',
          error_message: 'Đang thử lại bước audit ' + auditStepName + ': ' + job.lastAuditError,
          updated_at: job.updatedAt
        });
        replaceRolloverTrigger_(event, ROLLOVER_AUDIT_TRIGGER_HANDLER, ROLLOVER_AUDIT_TRIGGER_HANDLER, 5000);
        clearJob = false;
        return { ok: false, accepted: true, retrying: true, runId: runId, status: 'auditing', step: auditStepName };
      }
      if (runId) failRun_(runId, error);
      try { if (job && job.targetYear) updateContext_(job.targetYear, { lifecycle_status: 'failed', updated_at: new Date().toISOString() }); } catch (ignore) {}
      throw error;
    } finally {
      if (clearJob) clearRolloverJob_(props, runId);
      deleteRolloverTriggers_(event, ROLLOVER_AUDIT_TRIGGER_HANDLER);
      lock.releaseLock();
    }
  }

  function prepare(sourceYear, targetYear, actor) {
    assertAdminActor_(actor);
    var report = YearRolloverMigration.prepare(sourceYear, targetYear);
    return safeAudit_(report, true);
  }

  function activate(sourceYear, targetYear, confirmationToken, actor) {
    assertAdminActor_(actor);
    var years = years_(sourceYear, targetYear);
    var result = YearRolloverMigration.activate(years.sourceYear, years.targetYear, confirmationToken, function () {
      activateRegistry_(years);
    });
    var warnings = [];
    try {
      var runs = SupabaseHttpClient.readRows('workbook_rollover_runs', {
        select: 'run_id', target_year: 'eq.' + years.targetYear, order: 'updated_at.desc', limit: 1
      });
      if (runs.length) updateRun_(runs[0].run_id, { status: 'active', updated_at: new Date().toISOString() });
    } catch (runError) {
      warnings.push('Năm mới đã kích hoạt nhưng chưa cập nhật được nhật ký lượt chạy; hãy làm mới trạng thái.');
    }
    return { ok: true, sourceYear: years.sourceYear, targetYear: years.targetYear, activeYear: result.activeYear, warnings: warnings };
  }

  function activateRegistry_(years) {
    try {
      SupabaseHttpClient.callRpc('activate_workbook_context', {
        p_source_year: years.sourceYear,
        p_target_year: years.targetYear,
        p_activated_at: new Date().toISOString()
      });
      return;
    } catch (rpcError) {
      try {
        var rows = SupabaseHttpClient.readRows('workbook_contexts', {
          select: 'year,lifecycle_status,source_year',
          year: 'in.(' + years.sourceYear + ',' + years.targetYear + ')'
        });
        var source = rows.filter(function (row) { return String(row.year) === years.sourceYear; })[0];
        var target = rows.filter(function (row) { return String(row.year) === years.targetYear; })[0];
        if (source && target && source.lifecycle_status === 'archived' && target.lifecycle_status === 'active' && String(target.source_year) === years.sourceYear) return;
        throw rpcError;
      } catch (readError) {
        if (readError === rpcError) throw rpcError;
        var uncertain = new Error('Không đọc lại được registry: ' + errorMessage_(readError));
        uncertain.preserveActivationState = true;
        throw uncertain;
      }
    }
  }

  function applyManifest_(manifest, years, source, target) {
    var books = {
      source: {
        transport: SpreadsheetApp.openById(source.transport),
        cashflow: SpreadsheetApp.openById(source.cashflow)
      },
      target: {
        transport: SpreadsheetApp.openById(target.transport),
        cashflow: SpreadsheetApp.openById(target.cashflow)
      }
    };
    var snapshots = YearRolloverSnapshotService.captureAll(manifest.operations.snapshots, years, books);
    manifest.operations.clearRanges.forEach(function (operation) {
      var range = targetRange_(books, operation);
      var formulas = range.getFormulas();
      clearNonFormulaCells_(range, formulas);
      if (JSON.stringify(range.getFormulas()) !== JSON.stringify(formulas)) {
        throw new Error('Không khôi phục chính xác công thức trong ' + operation.sheet + '!' + operation.range + '.');
      }
    });
    manifest.operations.formulaReplacements.forEach(function (operation) {
      var range = targetRange_(books, operation);
      var formulas = range.getFormulas();
      var values = range.getValues();
      var fromValue = token_(operation.from, years, source, target);
      var toValue = token_(operation.to, years, source, target);
      var replacements = 0;
      var alreadyApplied = 0;
      var output = formulas.map(function (row, rowIndex) { return row.map(function (formula, columnIndex) {
        if (!formula) return values[rowIndex][columnIndex];
        if (formula.indexOf(toValue) >= 0) alreadyApplied += 1;
        if (formula.indexOf(fromValue) < 0) return formula;
        replacements += 1;
        return formula.split(fromValue).join(toValue);
      }); });
      if (operation.required !== false && replacements === 0 && alreadyApplied === 0) throw new Error('Không tìm thấy giá trị cần thay trong ' + operation.sheet + '!' + operation.range + '.');
      if (replacements > 0) range.setValues(output);
    });
    manifest.operations.carryovers.forEach(function (operation) {
      var sourceRange = exactRange_(books.source, operation.module, operation.sourceSheet, operation.sourceRange);
      var targetRange = exactRange_(books.target, operation.module, operation.targetSheet, operation.targetRange);
      if (sourceRange.getNumRows() !== targetRange.getNumRows() || sourceRange.getNumColumns() !== targetRange.getNumColumns()) {
        throw new Error('Vùng carry-over nguồn và đích không cùng kích thước.');
      }
      targetRange.setValues(sourceRange.getValues());
    });
    YearRolloverSnapshotService.applyAll(snapshots, books);
    manifest.operations.setValues.forEach(function (operation) {
      var range = targetRange_(books, operation);
      if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) throw new Error('setValues chỉ cho phép một ô chính xác.');
      var value = token_(operation.value, years, source, target);
      if (operation.valueType === 'date') {
        var match = String(value).match(/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
        if (!match) throw new Error('Giá trị ngày trong manifest phải có dạng YYYY-MM-DD.');
        value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        if (value.getFullYear() !== Number(match[1]) || value.getMonth() !== Number(match[2]) - 1 || value.getDate() !== Number(match[3])) {
          throw new Error('Giá trị ngày trong manifest không hợp lệ.');
        }
      }
      if (operation.valueType === 'formula') range.setFormula(String(value));
      else range.setValue(value);
      if (operation.numberFormat) range.setNumberFormat(String(operation.numberFormat));
    });
    return snapshots.map(snapshotEvidence_);
  }

  function manifestSteps_(manifest) {
    var steps = [];
    ['clearRanges', 'formulaReplacements', 'carryovers', 'snapshots', 'setValues'].forEach(function (type) {
      (manifest.operations[type] || []).forEach(function (operation) {
        steps.push({ type: type, operation: operation });
      });
    });
    return steps;
  }

  function applyManifestStep_(step, years, source, target) {
    var operation = step.operation;
    var sourceBooks = {};
    var targetBooks = {};
    if (step.type === 'carryovers' || step.type === 'snapshots') {
      sourceBooks[operation.module] = SpreadsheetApp.openById(source[operation.module]);
    }
    targetBooks[operation.module] = SpreadsheetApp.openById(target[operation.module]);
    var books = { source: sourceBooks, target: targetBooks };

    if (step.type === 'clearRanges') {
      var clearRange = targetRange_(books, operation);
      var originalFormulas = clearRange.getFormulas();
      clearNonFormulaCells_(clearRange, originalFormulas);
      if (JSON.stringify(clearRange.getFormulas()) !== JSON.stringify(originalFormulas)) {
        throw new Error('Không khôi phục chính xác công thức trong ' + operation.sheet + '!' + operation.range + '.');
      }
      return;
    }

    if (step.type === 'formulaReplacements') {
      var formulaRange = targetRange_(books, operation);
      var formulas = formulaRange.getFormulas();
      var values = formulaRange.getValues();
      var fromValue = token_(operation.from, years, source, target);
      var toValue = token_(operation.to, years, source, target);
      var replacements = 0;
      var alreadyApplied = 0;
      var output = formulas.map(function (row, rowIndex) { return row.map(function (formula, columnIndex) {
        if (!formula) return values[rowIndex][columnIndex];
        if (formula.indexOf(toValue) >= 0) alreadyApplied += 1;
        if (formula.indexOf(fromValue) < 0) return formula;
        replacements += 1;
        return formula.split(fromValue).join(toValue);
      }); });
      if (operation.required !== false && replacements === 0 && alreadyApplied === 0) throw new Error('Không tìm thấy giá trị cần thay trong ' + operation.sheet + '!' + operation.range + '.');
      if (replacements > 0) formulaRange.setValues(output);
      return;
    }

    if (step.type === 'carryovers') {
      var sourceRange = exactRange_(books.source, operation.module, operation.sourceSheet, operation.sourceRange);
      var targetRange = exactRange_(books.target, operation.module, operation.targetSheet, operation.targetRange);
      if (sourceRange.getNumRows() !== targetRange.getNumRows() || sourceRange.getNumColumns() !== targetRange.getNumColumns()) {
        throw new Error('Vùng carry-over nguồn và đích không cùng kích thước.');
      }
      targetRange.setValues(sourceRange.getValues());
      return;
    }

    if (step.type === 'snapshots') {
      var snapshots = YearRolloverSnapshotService.captureAll([operation], years, books);
      YearRolloverSnapshotService.applyAll(snapshots, books);
      return;
    }

    if (step.type === 'setValues') {
      var valueRange = targetRange_(books, operation);
      if (valueRange.getNumRows() !== 1 || valueRange.getNumColumns() !== 1) throw new Error('setValues chỉ cho phép một ô chính xác.');
      var value = token_(operation.value, years, source, target);
      if (operation.valueType === 'date') {
        var match = String(value).match(/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
        if (!match) throw new Error('Giá trị ngày trong manifest phải có dạng YYYY-MM-DD.');
        value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        if (value.getFullYear() !== Number(match[1]) || value.getMonth() !== Number(match[2]) - 1 || value.getDate() !== Number(match[3])) {
          throw new Error('Giá trị ngày trong manifest không hợp lệ.');
        }
      }
      if (operation.valueType === 'formula') valueRange.setFormula(String(value));
      else valueRange.setValue(value);
      if (operation.numberFormat) valueRange.setNumberFormat(String(operation.numberFormat));
      return;
    }

    throw new Error('Bước áp manifest không hợp lệ.');
  }

  function clearNonFormulaCells_(range, formulas) {
    var sheet = range.getSheet();
    var startRow = range.getRow();
    var startColumn = range.getColumn();
    var rowCount = range.getNumRows();
    var columnCount = range.getNumColumns();
    var clearRanges = [];
    for (var columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
      var runStart = -1;
      for (var rowOffset = 0; rowOffset <= rowCount; rowOffset += 1) {
        var hasFormula = rowOffset < rowCount && Boolean(formulas[rowOffset][columnOffset]);
        if (!hasFormula && rowOffset < rowCount && runStart < 0) runStart = rowOffset;
        if ((hasFormula || rowOffset === rowCount) && runStart >= 0) {
          var columnName = columnName_(startColumn + columnOffset);
          var firstRow = startRow + runStart;
          var lastRow = startRow + rowOffset - 1;
          clearRanges.push(columnName + firstRow + (lastRow === firstRow ? '' : ':' + columnName + lastRow));
          runStart = -1;
        }
      }
    }
    for (var offset = 0; offset < clearRanges.length; offset += 200) {
      sheet.getRangeList(clearRanges.slice(offset, offset + 200)).clearContent();
    }
  }

  function columnName_(column) {
    var value = Number(column);
    var name = '';
    while (value > 0) {
      value -= 1;
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26);
    }
    return name;
  }

  function snapshotEvidence_(snapshot) {
    if (snapshot.kind === 'fund') {
      return {
        kind: 'fund', sourceBalance: snapshot.sourceBalance,
        fundOutstanding: snapshot.fundOutstanding,
        openingBalance: Number(snapshot.cashOpening || 0) + Number(snapshot.bankOpening || 0),
        openLoans: snapshot.loanRows.length, openDebts: snapshot.debtRows.length
      };
    }
    return {
      kind: 'salary', activeBalances: snapshot.rows.length,
      total: snapshot.rows.reduce(function (sum, item) { return sum + Number(item.left[4] || 0); }, 0)
    };
  }

  function auditCanary_(manifest, years, source, target) {
    var sourceBooks = { transport: SpreadsheetApp.openById(source.transport), cashflow: SpreadsheetApp.openById(source.cashflow) };
    var targetBooks = { transport: SpreadsheetApp.openById(target.transport), cashflow: SpreadsheetApp.openById(target.cashflow) };
    var modules = ['transport', 'cashflow'];
    modules.forEach(function (module) {
      var sourceNames = sourceBooks[module].getSheets().map(function (sheet) { return sheet.getName(); });
      var targetNames = targetBooks[module].getSheets().map(function (sheet) { return sheet.getName(); });
      if (JSON.stringify(sourceNames) !== JSON.stringify(targetNames)) throw new Error('Canary làm thay đổi tên hoặc thứ tự sheet của module ' + module + '.');
    });
    var replacements = 0;
    var books = { target: targetBooks };
    manifest.operations.formulaReplacements.forEach(function (operation) {
      var formulas = targetRange_(books, operation).getFormulas();
      var fromValue = String(token_(operation.from, years, source, target));
      var toValue = String(token_(operation.to, years, source, target));
      var joined = JSON.stringify(formulas);
      if (joined.indexOf(fromValue) >= 0) throw new Error('Canary vẫn còn tham chiếu workbook nguồn trong ' + operation.sheet + '!' + operation.range + '.');
      if (operation.required !== false && joined.indexOf(toValue) < 0) throw new Error('Canary thiếu tham chiếu workbook đích trong ' + operation.sheet + '!' + operation.range + '.');
      replacements += 1;
    });
    return { sheetOrderMatches: true, formulaReplacementRanges: replacements, sourceWorkbooksUntouched: true };
  }

  function inspectCanaryReadiness_(manifest, years, source, sourceBooks) {
    var stage = 'mở file nguồn trên Drive';
    try {
      DriveApp.getFileById(source.transport).getName();
      DriveApp.getFileById(source.cashflow).getName();
      stage = 'mở thư mục đích trên Drive';
      DriveApp.getFolderById(manifest.destinationFolderId).getName();
      stage = 'đọc dữ liệu snapshot';
      var snapshots = YearRolloverSnapshotService.captureAll(manifest.operations.snapshots, years, { source: sourceBooks });
      stage = 'kiểm tra công thức cần thay';
      var replacements = 0;
      manifest.operations.formulaReplacements.forEach(function (operation) {
        var range = exactRange_(sourceBooks, operation.module, operation.sheet, operation.range);
        var fromValue = String(token_(operation.from, years, source, {}));
        var joined = JSON.stringify(range.getFormulas());
        if (operation.required !== false && joined.indexOf(fromValue) < 0) {
          throw new Error('Không tìm thấy giá trị cần thay trong ' + operation.sheet + '!' + operation.range + '.');
        }
        replacements += 1;
      });
      return {
        driveReady: true,
        destinationFolderReadable: true,
        snapshotEvidence: snapshots.map(snapshotEvidence_),
        formulaReplacementRanges: replacements
      };
    } catch (error) {
      throw canaryStageError_(stage, error);
    }
  }

  function targetRange_(books, operation) {
    return exactRange_(books.target, operation.module, operation.sheet, operation.range);
  }
  function exactRange_(scope, module, sheetName, a1) {
    if (module !== 'transport' && module !== 'cashflow') throw new Error('Module trong manifest không hợp lệ.');
    if (!A1_RANGE.test(String(a1 || ''))) throw new Error('Manifest phải dùng range A1 hữu hạn và chính xác.');
    var sheet = scope[module].getSheetByName(String(sheetName || ''));
    if (!sheet) throw new Error('Không tìm thấy sheet trong manifest: ' + sheetName + '.');
    var range = sheet.getRange(a1);
    if (range.getNumRows() * range.getNumColumns() > MAX_OPERATION_CELLS) throw new Error('Range trong manifest vượt giới hạn 250.000 ô.');
    return range;
  }

  function manifestResult_(props, years) {
    try {
      var manifest = requireManifest_(props, years);
      return { manifest: manifest, public: { ready: true, version: manifest.version, targetYear: manifest.targetYear, names: manifest.names, destinationFolderConfigured: true } };
    } catch (error) {
      return { manifest: null, public: { ready: false, version: '', targetYear: years.targetYear, names: {}, destinationFolderConfigured: false, error: errorMessage_(error) } };
    }
  }
  function requireManifest_(props, years) {
    var raw = String(props.getProperty(MANIFEST_PREFIX + years.targetYear + '_JSON') || props.getProperty(GENERIC_MANIFEST) || '').trim();
    var manifest;
    if (raw) {
      try { manifest = JSON.parse(raw); } catch (error) { throw new Error('Manifest chuyển năm không phải JSON hợp lệ.'); }
    } else {
      manifest = YearRolloverManifestCatalog.get(years.targetYear);
    }
    if (!manifest) throw new Error('Chưa có manifest được phê duyệt cho năm ' + years.targetYear + '.');
    if (manifest.approved !== true) throw new Error('Manifest chuyển năm chưa được đánh dấu approved=true.');
    var manifestTargetYear = String(manifest.targetYear || '').trim();
    if (manifestTargetYear !== '$TARGET_YEAR' && manifestTargetYear !== years.targetYear) throw new Error('Manifest không khớp năm đích.');
    if (!String(manifest.version || '').trim()) throw new Error('Manifest thiếu version.');
    if (!String(manifest.destinationFolderId || '').trim()) throw new Error('Manifest thiếu thư mục Drive đích.');
    var names = manifest.names || {};
    if (!String(names.transport || '').trim() || !String(names.cashflow || '').trim()) throw new Error('Manifest thiếu tên hai workbook đích.');
    if (String(names.transport).trim() === String(names.cashflow).trim()) throw new Error('Hai workbook đích phải có tên khác nhau.');
    var operations = manifest.operations || {};
    ['clearRanges', 'formulaReplacements', 'carryovers', 'snapshots', 'setValues'].forEach(function (key) {
      if (!Array.isArray(operations[key])) throw new Error('Manifest thiếu danh sách operations.' + key + '.');
    });
    operations.clearRanges.forEach(validateTargetOperation_);
    operations.formulaReplacements.forEach(function (item) {
      validateTargetOperation_(item);
      if (item.from === undefined || item.to === undefined || String(item.from) === String(item.to)) throw new Error('Formula replacement không hợp lệ.');
    });
    operations.carryovers.forEach(function (item) {
      if ((item.module !== 'transport' && item.module !== 'cashflow') || !item.sourceSheet || !item.targetSheet || !A1_RANGE.test(String(item.sourceRange || '')) || !A1_RANGE.test(String(item.targetRange || ''))) {
        throw new Error('Carry-over trong manifest không hợp lệ.');
      }
    });
    operations.snapshots.forEach(validateSnapshotOperation_);
    operations.setValues.forEach(function (item) {
      validateTargetOperation_(item);
      if (item.value === undefined) throw new Error('setValues trong manifest thiếu value.');
      if (item.valueType && ['string', 'number', 'date', 'formula'].indexOf(item.valueType) < 0) throw new Error('setValues có valueType không hợp lệ.');
    });
    return {
      approved: true,
      version: replaceYearTokens_(String(manifest.version).trim(), years),
      targetYear: years.targetYear,
      destinationFolderId: String(manifest.destinationFolderId).trim(),
      names: {
        transport: replaceYearTokens_(String(names.transport).trim(), years),
        cashflow: replaceYearTokens_(String(names.cashflow).trim(), years)
      },
      operations: operations
    };
  }
  function validateTargetOperation_(item) {
    if (!item || (item.module !== 'transport' && item.module !== 'cashflow') || !String(item.sheet || '').trim() || !A1_RANGE.test(String(item.range || ''))) {
      throw new Error('Target operation trong manifest không hợp lệ.');
    }
  }
  function validateSnapshotOperation_(item) {
    if (!item || (item.module !== 'transport' && item.module !== 'cashflow')) throw new Error('Snapshot operation không hợp lệ.');
    if (item.kind === 'salary') {
      validateTargetOperation_(item);
      return;
    }
    if (item.kind !== 'fund' || item.module !== 'cashflow') throw new Error('Snapshot operation không được hỗ trợ.');
    ['transactionSheet', 'transactionRange', 'loanSheet', 'loanRange', 'settingsSheet', 'cashOpeningRange', 'bankOpeningRange', 'dataStartDateRange', 'loanStartDateRange'].forEach(function (key) {
      if (!String(item[key] || '').trim()) throw new Error('Snapshot Quỹ thiếu ' + key + '.');
    });
    ['transactionRange', 'loanRange', 'cashOpeningRange', 'bankOpeningRange', 'dataStartDateRange', 'loanStartDateRange'].forEach(function (key) {
      if (!A1_RANGE.test(String(item[key]))) throw new Error('Snapshot Quỹ phải dùng range A1 hữu hạn cho ' + key + '.');
    });
    var categoryValidation = item.categoryValidation || {};
    ['settingsSheet', 'incomeRange', 'expenseRange', 'mutualExclusionSheet', 'mutualExclusionRange'].forEach(function (key) {
      if (!String(categoryValidation[key] || '').trim()) throw new Error('Snapshot Quỹ thiếu categoryValidation.' + key + '.');
    });
    ['incomeRange', 'expenseRange', 'mutualExclusionRange'].forEach(function (key) {
      if (!A1_RANGE.test(String(categoryValidation[key]))) throw new Error('Validation Thu/Chi phải dùng range A1 hữu hạn cho ' + key + '.');
    });
    if (item.openingBalanceMode !== 'cash' && item.openingBalanceMode !== 'bank') throw new Error('Snapshot Quỹ thiếu quy tắc phân bổ số dư đầu kỳ.');
  }

  function registerContexts_(years, source, target, manifest, actor) {
    var now = new Date().toISOString();
    SupabaseHttpClient.upsertRows('workbook_contexts', [{
      year: years.sourceYear,
      transport_spreadsheet_id: source.transport,
      cashflow_spreadsheet_id: source.cashflow,
      lifecycle_status: 'active',
      source_year: null,
      workbook_names: {}, audit_summary: {},
      created_by: actorLabel_(actor), updated_at: now
    }, {
      year: years.targetYear,
      transport_spreadsheet_id: target.transport,
      cashflow_spreadsheet_id: target.cashflow,
      lifecycle_status: 'draft',
      source_year: years.sourceYear,
      workbook_names: manifest.names, audit_summary: {},
      created_by: actorLabel_(actor), updated_at: now
    }], 'year');
  }
  function updateContext_(year, patch) { SupabaseHttpClient.updateRows('workbook_contexts', patch, { year: 'eq.' + year }); }
  function writeRun_(row) { SupabaseHttpClient.upsertRows('workbook_rollover_runs', [row], 'run_id'); }
  function updateRun_(runId, patch) { SupabaseHttpClient.updateRows('workbook_rollover_runs', patch, { run_id: 'eq.' + runId }); }
  function failRun_(runId, error) {
    try { updateRun_(runId, { status: 'failed', error_message: errorMessage_(error).slice(0, 1000), updated_at: new Date().toISOString() }); } catch (ignore) {}
  }

  function years_(sourceYear, targetYear) {
    var props = PropertiesService.getScriptProperties();
    var source = String(sourceYear || props.getProperty('ACTIVE_WORKBOOK_YEAR') || props.getProperty('DEFAULT_WORKBOOK_YEAR') || APP_CONFIG.year || '').trim();
    var target = String(targetYear || (YEAR.test(source) ? Number(source) + 1 : '')).trim();
    if (!YEAR.test(source) || !YEAR.test(target) || Number(target) !== Number(source) + 1) throw new Error('Chỉ cho phép chuẩn bị năm liền sau năm đang hoạt động.');
    return { sourceYear: source, targetYear: target };
  }
  function sourceIds_(props, year) {
    var ids = targetIds_(props, year);
    if (String(year) !== '2026') return ids;
    ids.transport = ids.transport || String(
      props.getProperty('ACTIVE_SPREADSHEET_ID') ||
      props.getProperty('DEFAULT_SPREADSHEET_ID') ||
      APP_CONFIG.spreadsheetId || ''
    ).trim();
    ids.cashflow = ids.cashflow || String(props.getProperty('FUND_SPREADSHEET_ID') || '').trim();
    if (!ids.cashflow && typeof FundService !== 'undefined' && FundService.resolveFundSpreadsheetId) {
      ids.cashflow = String(FundService.resolveFundSpreadsheetId('2026') || '').trim();
    }
    return ids;
  }
  function targetIds_(props, year) {
    return {
      transport: String(props.getProperty(TRANSPORT_PREFIX + year) || '').trim(),
      cashflow: String(props.getProperty(FUND_PREFIX + year) || props.getProperty(CASHFLOW_PREFIX + year) || '').trim()
    };
  }
  function assertAdminActor_(actor) {
    if (!actor || String(actor.role || '') !== 'admin') throw new Error('Chỉ quản trị viên được chuẩn bị hoặc kích hoạt năm dữ liệu.');
  }
  function actorLabel_(actor) { return String(actor && (actor.username || actor.email || actor.id) || 'admin').slice(0, 160); }
  function errorMessage_(error) { return String(error && error.message || error || 'Lỗi không xác định.'); }
  function canaryStageError_(stage, error) {
    var message = errorMessage_(error);
    if (message.indexOf('Canary thất bại tại pha ') === 0) return error;
    var safeMessage = message.replace(/[A-Za-z0-9_-]{24,}/g, '[đã ẩn định danh]');
    var wrapped = new Error('Canary thất bại tại pha ' + stage + ': ' + safeMessage);
    try { console.error(wrapped.message); } catch (ignore) {}
    return wrapped;
  }
  function token_(value, years, source, target) {
    var tokens = {
      '$SOURCE_YEAR': years.sourceYear,
      '$TARGET_YEAR': years.targetYear,
      '$SOURCE_TRANSPORT_ID': source.transport,
      '$SOURCE_CASHFLOW_ID': source.cashflow,
      '$TARGET_TRANSPORT_ID': target.transport,
      '$TARGET_CASHFLOW_ID': target.cashflow
    };
    if (typeof value !== 'string') return value;
    return Object.keys(tokens).reduce(function (text, key) {
      return text.split(key).join(tokens[key]);
    }, value);
  }
  function replaceYearTokens_(value, years) {
    return String(value || '').split('$SOURCE_YEAR').join(years.sourceYear).split('$TARGET_YEAR').join(years.targetYear);
  }
  function trashNewCopy_(file) { if (file) try { file.setTrashed(true); } catch (ignore) {} }
  function trashCanary_(file, label, errors) {
    if (!file) return;
    try {
      file.setTrashed(true);
      if (typeof file.isTrashed === 'function' && !file.isTrashed()) throw new Error('Drive chưa xác nhận trạng thái thùng rác.');
    } catch (error) {
      errors.push(label + ': ' + errorMessage_(error));
    }
  }
  function readCanaryJob_(props, runId) {
    var raw = String(props.getProperty(CANARY_JOB_PREFIX + runId) || '').trim();
    if (!raw) return null;
    try {
      var job = JSON.parse(raw);
      if (!job || String(job.runId || '') !== String(runId) || !YEAR.test(String(job.sourceYear || '')) || !YEAR.test(String(job.targetYear || ''))) return null;
      return job;
    } catch (error) { return null; }
  }
  function readRolloverJob_(props, runId) {
    var raw = String(props.getProperty(ROLLOVER_JOB_PREFIX + runId) || '').trim();
    if (!raw) return null;
    try {
      var job = JSON.parse(raw);
      if (!job || String(job.runId || '') !== String(runId) || !YEAR.test(String(job.sourceYear || '')) || !YEAR.test(String(job.targetYear || ''))) return null;
      if (['provision', 'resume', 'audit'].indexOf(String(job.mode || '')) < 0) return null;
      if (job.stage !== 'prepare' && job.stage !== 'audit') return null;
      return job;
    } catch (error) { return null; }
  }
  function isRolloverJobStale_(job) {
    var timestamp = new Date(job && (job.updatedAt || job.createdAt) || '').getTime();
    return !isFinite(timestamp) || new Date().getTime() - timestamp > 12 * 60 * 1000;
  }
  function ensureRolloverTrigger_(handler, force) {
    if (force) {
      ScriptApp.getProjectTriggers().forEach(function (trigger) {
        if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
      });
    }
    var exists = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === handler; });
    if (!exists) ScriptApp.newTrigger(handler).timeBased().after(1000).create();
  }
  function replaceRolloverTrigger_(event, currentHandler, nextHandler, delayMs) {
    deleteRolloverTriggers_(event, currentHandler);
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === nextHandler) ScriptApp.deleteTrigger(trigger);
    });
    ScriptApp.newTrigger(nextHandler).timeBased().after(Math.max(1000, Number(delayMs || 1000))).create();
  }
  function clearRolloverJob_(props, runId) {
    if (runId) props.deleteProperty(ROLLOVER_JOB_PREFIX + runId);
    if (runId) clearAuditResults_(props, runId);
    if (!runId || String(props.getProperty(ROLLOVER_ACTIVE_JOB) || '') === String(runId)) props.deleteProperty(ROLLOVER_ACTIVE_JOB);
  }
  function auditResultKey_(runId, index) {
    return ROLLOVER_JOB_PREFIX + String(runId) + ROLLOVER_AUDIT_RESULT_SUFFIX + String(index);
  }
  function clearAuditResults_(props, runId) {
    if (typeof props.getProperties === 'function') {
      var prefix = ROLLOVER_JOB_PREFIX + String(runId) + ROLLOVER_AUDIT_RESULT_SUFFIX;
      Object.keys(props.getProperties()).forEach(function (key) {
        if (key.indexOf(prefix) === 0) props.deleteProperty(key);
      });
      return;
    }
    for (var index = 0; index < ROLLOVER_MAX_AUDIT_STEPS; index += 1) {
      props.deleteProperty(auditResultKey_(runId, index));
    }
  }
  function readAuditResults_(props, runId, count) {
    var results = [];
    for (var index = 0; index < count; index += 1) {
      var raw = String(props.getProperty(auditResultKey_(runId, index)) || '').trim();
      if (!raw) throw new Error('Thiếu checkpoint audit tại bước ' + String(index + 1) + '.');
      results.push(JSON.parse(raw));
    }
    return results;
  }
  function deleteRolloverTriggers_(event, onlyHandler) {
    var triggerUid = String(event && event.triggerUid || '');
    try {
      ScriptApp.getProjectTriggers().forEach(function (trigger) {
        var handler = trigger.getHandlerFunction();
        if ([ROLLOVER_PREPARE_TRIGGER_HANDLER, ROLLOVER_AUDIT_TRIGGER_HANDLER].indexOf(handler) < 0) return;
        if (onlyHandler && handler !== onlyHandler) return;
        if (triggerUid && typeof trigger.getUniqueId === 'function' && String(trigger.getUniqueId()) !== triggerUid) return;
        ScriptApp.deleteTrigger(trigger);
      });
    } catch (ignore) {}
  }
  function deleteCanaryTriggers_(event) {
    var triggerUid = String(event && event.triggerUid || '');
    try {
      ScriptApp.getProjectTriggers().forEach(function (trigger) {
        if (trigger.getHandlerFunction() !== CANARY_TRIGGER_HANDLER) return;
        if (triggerUid && typeof trigger.getUniqueId === 'function' && String(trigger.getUniqueId()) !== triggerUid) return;
        ScriptApp.deleteTrigger(trigger);
      });
    } catch (ignore) {}
  }
  function safeContext_(row) {
    return {
      year: String(row.year || ''), status: String(row.lifecycle_status || ''), sourceYear: String(row.source_year || ''),
      workbookNames: row.workbook_names || {}, auditSummary: row.audit_summary || {},
      preparedAt: row.prepared_at || null, activatedAt: row.activated_at || null, updatedAt: row.updated_at || null
    };
  }
  function safeRun_(row) {
    var statusValue = String(row.status || '');
    var updatedAt = row.updated_at || null;
    var running = ['planned', 'copying', 'auditing'].indexOf(statusValue) >= 0;
    var stale = running && (!updatedAt || new Date().getTime() - new Date(updatedAt).getTime() > 12 * 60 * 1000);
    return {
      runId: row.run_id, sourceYear: row.source_year, targetYear: row.target_year, status: statusValue, stale: stale,
      manifestVersion: row.manifest_version, plan: row.plan || {}, audit: row.audit_report || {},
      error: row.error_message || '', createdBy: row.created_by || '', createdAt: row.created_at, updatedAt: updatedAt
    };
  }
  function safePlan_(manifest) {
    return {
      version: manifest.version, targetYear: manifest.targetYear, names: manifest.names,
      operationCounts: {
        clearRanges: manifest.operations.clearRanges.length,
        formulaReplacements: manifest.operations.formulaReplacements.length,
        carryovers: manifest.operations.carryovers.length,
        snapshots: manifest.operations.snapshots.length,
        setValues: manifest.operations.setValues.length
      }
    };
  }
  function safeAudit_(report, keepToken) {
    var details = report.details || {};
    var formulaRisks = details.formulaRisks || {};
    return {
      ok: report.ok === true,
      sourceYear: report.sourceYear,
      targetYear: report.targetYear,
      activationReady: report.activationReady === true,
      confirmationToken: keepToken ? report.confirmationToken || '' : undefined,
      blockers: (report.blockers || []).slice(),
      warnings: (report.warnings || []).slice(),
      transportStructure: report.transportStructure || null,
      fundStructure: report.fundStructure || null,
      details: {
        formulaRisks: {
          oldWorkbookReferences: (formulaRisks.oldWorkbookReferences || []).slice(),
          sourceYearReferences: (formulaRisks.sourceYearReferences || []).slice(),
          allowedSourceYearReferences: (formulaRisks.allowedSourceYearReferences || []).slice(),
          skippedSheets: (formulaRisks.skippedSheets || []).map(function (value) { return String(value).split(':').slice(1).join(':') || 'sheet'; })
        },
        transportHeaders: details.transportHeaders || null,
        fundHeaders: details.fundHeaders || null,
        staleInputs: details.staleInputs || [],
        carryover: details.carryover || null,
        queues: details.queues || { pending: [], errors: [] }
      },
      steps: report.steps || []
    };
  }

  return {
    status: status,
    preview: preview,
    canary: canary,
    runCanaryJob: runCanaryJob,
    provision: provision,
    resume: resume,
    audit: audit,
    runProvisionJob: runProvisionJob,
    runAuditJob: runAuditJob,
    prepare: prepare,
    activate: activate
  };
})();

function getYearRolloverStatus(sourceYear, targetYear) {
  return YearWorkbookProvisioningService.status(sourceYear, targetYear);
}

function manageYearRollover(operation, sourceYear, targetYear, confirmationToken, requestUser) {
  var action = String(operation || '').trim();
  if (action === 'preview') return YearWorkbookProvisioningService.preview(sourceYear, targetYear, requestUser);
  if (action === 'canary') return YearWorkbookProvisioningService.canary(sourceYear, targetYear, requestUser);
  if (action === 'provision') return YearWorkbookProvisioningService.provision(sourceYear, targetYear, requestUser);
  if (action === 'resume') return YearWorkbookProvisioningService.resume(sourceYear, targetYear, requestUser);
  if (action === 'audit') return YearWorkbookProvisioningService.audit(sourceYear, targetYear, requestUser);
  if (action === 'prepare') return YearWorkbookProvisioningService.prepare(sourceYear, targetYear, requestUser);
  if (action === 'activate') return YearWorkbookProvisioningService.activate(sourceYear, targetYear, confirmationToken, requestUser);
  throw new Error('Thao tác chuyển năm không hợp lệ.');
}

function runYearRolloverCanaryJob(event) {
  return YearWorkbookProvisioningService.runCanaryJob(event || {});
}

function runYearRolloverProvisionJob(event) {
  return YearWorkbookProvisioningService.runProvisionJob(event || {});
}

function runYearRolloverAuditJob(event) {
  return YearWorkbookProvisioningService.runAuditJob(event || {});
}
