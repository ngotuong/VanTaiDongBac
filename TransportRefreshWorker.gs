/** Durable read-only stages; foreground caches precede historical work. */
var TransportRefreshWorker = (function () {
  function unique_(items) {
    return (items || []).filter(function (item, index, all) { return all.indexOf(item) === index; });
  }

  function reportTasks_(item, context) {
    var months = unique_(item.months).sort().reverse();
    var prioritized = unique_(item.priorityMonths).filter(function (month) { return months.indexOf(month) >= 0; }).sort().reverse();
    var tasks = prioritized.concat(months.filter(function (month) { return prioritized.indexOf(month) < 0; })).filter(function (month) {
      return month !== item.priorityReport && (item.priorityReports || []).indexOf(month) < 0;
    }).map(function (month) { return ['report', month]; });
    if (item.includeAll !== false || item.full) tasks.push(['report', 'Tất cả']);
    if (!tasks.length && !item.priorityReport) throw new Error('Refresh scope has no report months.');
    return tasks;
  }

  function buildCacheTasks(item, context) {
    // A catalog edit must reach its read model before unrelated historical work.
    var tasks = unique_(item.catalogs).map(function (sheet) { return ['catalog', sheet]; });
    var sheets = unique_(item.sheets);
    var pairMonth = unique_(item.priorityMonths).filter(function (month) {
      return (item.months || []).indexOf(month) >= 0;
    }).sort().reverse()[0] || unique_(item.months).sort().reverse()[0] || context.currentMonth || '';
    var fastLane = item.priority === true && item.full !== true && item.refreshDashboard === true && !!pairMonth;
    // A scoped human-edit burst has already observed the 15-second quiet
    // window. Publish Dashboard + Report atomically before manage caches.
    if (fastLane) tasks.push(['publishGeneration', pairMonth], ['background']);
    sheets.forEach(function (sheet) {
      if ((item.fastManagedSheets || []).indexOf(sheet) >= 0) return;
      tasks.push(['manage', sheet]);
      unique_((item.priorityMonths || []).concat(context.currentMonth ? [context.currentMonth] : []))
        .sort().reverse().forEach(function (month) { tasks.push(['manageMonth', sheet, month]); });
    });
    if (!fastLane && !item.fastDashboard && (item.refreshDashboard || item.full || (item.sheets || []).length)) tasks.push(['dashboard']);
    if (item.full) tasks.push(['discoverReports']);
    if (!fastLane) {
      if (tasks.length || (item.catalogs || []).length) tasks.push(['preparePriorityReport']);
      else {
        var reports = reportTasks_(item, context);
        return reports.length > 1 ? [reports[0], ['background']].concat(reports.slice(1)) : reports;
      }
    }
    if (!fastLane) tasks.push(['background']);
    if (item.full) sheets.forEach(function (sheet) { tasks.push(['discoverManage', sheet]); });
    tasks.push(['prepareReports']);
    if ((item.catalogs || []).length) {
      (context.catalogForms || []).forEach(function (form) { tasks.push(['catalogOptions', form]); });
      tasks.push(['startup']);
    }
    return tasks;
  }

  function runStage_(item, context) {
    // Upgrade an interrupted older plan without discarding its business scope.
    if (context.planVersion && item.planVersion !== context.planVersion) {
      delete item.tasks;
      delete item.inputHashes;
      delete item.fastManagedSheets;
      delete item.fastDashboard;
      delete item.priorityReport;
      delete item.priorityReports;
      delete item.reportDataVersion;
      delete item.fundTransactionsCapture;
      item.background = false;
      item.planVersion = context.planVersion;
    }
    if (!Array.isArray(item.tasks)) {
      item.tasks = [];
      if (context.buildTasks) {
        item.tasks = context.buildTasks(item);
      } else {
        item.tasks = buildCacheTasks(item, context);
      }
      context.saveProgress(item);
    }
    var task = item.tasks[0];
    var startedAt = context.nowMillis();
    var stage = task ? task.join(':') : 'complete';
    context.log('refresh_stage_start:' + stage);
    try {
      var added = [];
      var result = { ok: true };
      if (task) {
        var execution = context.runTask && context.runTask(task, item);
        if (execution) {
          result = execution.result;
          added = execution.added || [];
        } else if (task[0] === 'catalog') result = context.syncCatalog(task[1]);
        else if (task[0] === 'catalogOptions') result = context.syncCatalogOptions(task[1]);
        else if (task[0] === 'startup') result = context.syncStartup();
        else if (task[0] === 'discoverManage') {
          var months = unique_(context.manageMonths(task[1])).sort().reverse();
          item.months = unique_((item.months || []).concat(months));
          // Fast publication already covered these keys, including an empty
          // current month after deletion. Still discover cached old months.
          var fastMonths = unique_((item.priorityMonths || []).concat(context.currentMonth ? [context.currentMonth] : []));
          added = months.filter(function (month) { return fastMonths.indexOf(month) < 0; })
            .map(function (month) { return ['manageMonth', task[1], month]; });
        } else if (task[0] === 'discoverReports') {
          item.months = unique_((item.months || []).concat(context.reportMonths()));
          if (!item.months.length) throw new Error('Không tìm thấy tháng báo cáo để đồng bộ.');
        } else if (task[0] === 'preparePriorityReport') {
          var priorityMonths = unique_(item.priorityMonths).filter(function (month) { return (item.months || []).indexOf(month) >= 0; }).sort().reverse();
          if (!priorityMonths.length) priorityMonths = unique_(item.months).sort().reverse().slice(0, 1);
          added = priorityMonths.filter(function (month) {
            return month !== item.priorityReport && (item.priorityReports || []).indexOf(month) < 0;
          }).map(function (month) { return ['report', month]; });
          if (priorityMonths.length) item.priorityReport = priorityMonths[0];
        } else if (task[0] === 'background') item.background = true;
        else if (task[0] === 'prepareReports') added = reportTasks_(item, context);
        else if (task[0] === 'publishGeneration') {
          result = context.syncPublicationPair(task[1], item);
          item.reportDataVersion = String((result && result.dataVersion) || '');
          item.priorityReport = task[1];
          item.priorityReports = unique_((item.priorityReports || []).concat([task[1]]));
        }
        else if (task[0] === 'dashboard') {
          result = context.syncDashboard();
          item.reportDataVersion = String((result && result.dataVersion) || '');
        }
        else if (task[0] === 'manage') result = context.syncManage(task[1]);
        else if (task[0] === 'manageMonth') result = context.syncManageMonth(task[1], task[2]);
        else if (task[0] === 'report') result = context.syncReport(task[1], item);
        else throw new Error('Unknown refresh stage: ' + stage);
      }
      if (!result || result.ok === false) throw new Error(JSON.stringify(result || 'Refresh returned no result.'));
      if (item.background && task && /^(manageMonth|report|fundOverview|fundTransactionsPublish|fundLoans|fundCatalog|catalog)$/.test(task[0])) item.priorityRestarts = 0;
      // Record publication only after syncReport succeeds, never while planning.
      if (task && task[0] === 'report') item.priorityReports = unique_((item.priorityReports || []).concat([task[1]]));
      if (task && task[0] === 'publishGeneration') {
        (result.publications || []).forEach(function (published) {
          var pairPublication = {
            cacheKey: String(published.cacheKey || ''),
            generationAt: Number(item.generationAt || 0),
            generationId: String(item.generationId || ''),
            publishedAt: String(published.publishedAt || result.syncedAt || '')
          };
          item.publicationAcks = uniquePublicationAcks_((item.publicationAcks || []).concat([pairPublication]));
          if (context.recordPublication) {
            try { context.recordPublication(pairPublication); }
            catch (pairPublicationError) { context.log('refresh_publication_status_failed:' + pairPublication.cacheKey); }
          }
        });
      } else if (task && (task[0] === 'dashboard' || task[0] === 'report')) {
        var cacheKey = task[0] === 'dashboard' ? '__dashboard_latest__' : String(result.reportMonth || task[1]);
        var publication = {
          cacheKey: cacheKey,
          generationAt: Number(item.generationAt || 0),
          generationId: String(item.generationId || ''),
          publishedAt: String(result.syncedAt || '')
        };
        item.publicationAcks = uniquePublicationAcks_((item.publicationAcks || []).concat([publication]));
        if (context.recordPublication) {
          try { context.recordPublication(publication); }
          catch (publicationError) { context.log('refresh_publication_status_failed:' + cacheKey); }
        }
      }
      item.tasks = added.concat(item.tasks.slice(1));
      // Persist the completed cursor and yield in one atomic lock operation.
      context.saveProgress(item, item.tasks.length ? 0 : undefined);
      var acknowledgement;
      if (item.tasks.length) {
        acknowledgement = { acknowledged: false, continuing: true };
      } else {
        if (!item.skipVerification && Number(item.verificationPasses || 0) > 0) context.enqueueVerification(item);
        acknowledgement = context.acknowledge(item);
        if (!acknowledgement.acknowledged) throw new Error('Refresh completion lost lease ownership.');
      }
      var elapsedMs = context.nowMillis() - startedAt;
      context.log('refresh_stage_done:' + stage + ':' + elapsedMs + 'ms');
      return { ok: true, mode: 'tick', step: context.step || 'transportReportsPending', stage: stage,
        months: (item.months || []).slice(), full: item.full === true,
        remainingStages: item.tasks.length, elapsedMs: elapsedMs, acknowledgement: acknowledgement };
    } catch (err) {
      if (err && (err.refreshDeferred || err.transportDeferred)) {
        context.log('refresh_stage_deferred:' + stage);
        return { ok: false, deferred: true, mode: 'tick', step: context.step || 'transportReportsPending', stage: stage,
          error: 'Refresh deferred; scope and owned cursor retained.', retryAtMillis: err.retryAtMillis || 0,
          acknowledgement: { acknowledged: false, continuing: true } };
      }
      var error = err && err.message ? err.message : String(err);
      // A hard timeout bypasses catch; the saved lease replays only this read-only
      // stage after expiry. Catchable errors keep this same cursor with backoff.
      var retry = context.requeue(item);
      context.log('refresh_stage_failed:' + stage + ':' + error);
      return { ok: false, mode: 'tick', step: context.step || 'transportReportsPending', stage: stage,
        error: error, retry: retry, acknowledgement: { acknowledged: false, retryQueued: true } };
    }
  }

  function run(item, context) {
    var startedAt = context.nowMillis();
    var deadline = Math.min(startedAt + Number(context.turnBudgetMs || 60000), Number(context.deadlineMillis || Infinity));
    var minStageStartBudgetMs = Math.max(0, Number(context.minStageStartBudgetMs || 0));
    var stages = [];
    var result;
    var maxStages = Math.max(1, Math.min(30, Number(context.maxStages || 1)));
    for (var index = 0; index < maxStages; index++) {
      var remainingBudgetMs = deadline - context.nowMillis();
      if (remainingBudgetMs <= 0 || (index > 0 && remainingBudgetMs < minStageStartBudgetMs)) {
        context.saveProgress(item, 0);
        result = result || { ok: true, mode: 'tick', step: context.step || 'transportReportsPending', skipped: true,
          reason: remainingBudgetMs <= 0 ? 'Refresh deadline elapsed before stage.' : 'Refresh yielded before starting a stage without safe runway.',
          remainingStages: (item.tasks || []).length,
          acknowledgement: { acknowledged: false, continuing: true } };
        break;
      }
      result = runStage_(item, context);
      stages.push(result.stage);
      if (!result.ok || result.acknowledgement.acknowledged ||
          result.stage.indexOf('report:') === 0 || result.stage.indexOf('publishGeneration:') === 0 ||
          (context.shouldYieldAfterStage && context.shouldYieldAfterStage(result, item)) ||
          context.nowMillis() >= deadline ||
          !context.claimNext || index + 1 >= maxStages) break;
      var next;
      try { next = context.claimNext(item); }
      catch (error) {
        if (!error || !(error.refreshDeferred || error.transportDeferred)) throw error;
        result.ok = false; result.deferred = true; result.phase = 'claim';
        result.error = 'Refresh claim deferred; completed cursor retained.';
        context.log('refresh_claim_deferred:' + result.stage);
        break;
      }
      if (!next.due) break;
      item = next.item;
    }
    result.stages = stages;
    // One status publication per bounded turn, instead of one extra RPC per page.
    try {
      var latestPublication = (item.publicationAcks || []).slice(-1)[0];
      context.writeStatus(result.ok ? 'ok' : 'error', result.ok
        ? 'Stage ' + result.stage + ' completed in ' + Number(result.elapsedMs || 0) + 'ms; remaining=' + Number(result.remainingStages || 0) +
          '; generationAt=' + Number(item.generationAt || 0) + (latestPublication
            ? '; published=' + latestPublication.cacheKey + '@' + latestPublication.publishedAt : '') + '.'
        : 'Stage ' + result.stage + ': ' + (result.error || result.reason || 'Deferred'));
    } catch (statusError) { context.log('refresh_stage_status_failed:' + result.stage); }
    return result;
  }

  function uniquePublicationAcks_(acks) {
    var byKey = {};
    (acks || []).forEach(function (ack) {
      if (!ack || !ack.cacheKey) return;
      var current = byKey[String(ack.cacheKey)];
      if (!current || String(ack.publishedAt || '') >= String(current.publishedAt || '')) byKey[String(ack.cacheKey)] = ack;
    });
    return Object.keys(byKey).map(function (key) { return byKey[key]; }).sort(function (left, right) {
      var byTime = String(left.publishedAt || '').localeCompare(String(right.publishedAt || ''));
      return byTime || String(left.cacheKey).localeCompare(String(right.cacheKey));
    }).slice(-12);
  }

  return { run: run, buildCacheTasks: buildCacheTasks };
})();
