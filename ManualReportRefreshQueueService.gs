var ManualReportRefreshQueueService = (function () {
  var PROPERTY_KEY = 'SUPABASE_PENDING_TRANSPORT_REPORT_SYNC';
  var DEFAULT_DEBOUNCE_MS = 15000;
  var DEFAULT_RETRY_DELAY_MS = 30000;
  // Outlive the Apps Script six-minute execution limit, including forced exits.
  var DEFAULT_LEASE_MS = 7 * 60 * 1000;

  function enqueue(options, context) {
    var input = options || {};
    return context.withLock(function () {
      var now = context.nowMillis();
      var current = read_(context);
      var incomingMonths = normalizeMonths_(input.months, context.normalizeYearMonthKey);
      var full = Boolean(input.full || current.full);
      var pending = {
        full: full,
        includeAll: input.includeAll !== false || current.includeAll === true,
        months: full ? [] : mergeUnique_(current.months, incomingMonths).sort(),
        priorityMonths: mergeUnique_(current.priorityMonths, isPrioritySource_(input.source) ? incomingMonths : []).sort(),
        priority: current.priority === true || isPrioritySource_(input.source),
        refreshDashboard: current.refreshDashboard === true || input.refreshDashboard === true,
        sheets: mergeUnique_(current.sheets, input.sheets),
        catalogs: mergeUnique_(current.catalogs, input.catalogs),
        verificationPasses: Math.max(
          Number(current.verificationPasses || 0),
          Number(input.verificationPasses || 0)
        ),
        notBefore: Math.max(
          Number(current.notBefore || 0),
          now + Number(input.delayMs === undefined ? context.debounceMs || DEFAULT_DEBOUNCE_MS : input.delayMs)
        ),
        updatedAt: context.nowISOString(),
        sources: mergeUnique_(current.sources, input.source ? [String(input.source)] : []),
        attempts: Math.max(Number(current.attempts || 0), Number(input.attempts || 0))
      };
      context.setProperty(propertyKey_(context), JSON.stringify(pending));
      return summarize_(pending, now);
    });
  }

  function claimDue(context) {
    return context.withLock(function () {
      var now = context.nowMillis();
      var pending = read_(context);
      var lease = readLease_(context);
      if (hasWork_(lease.item) && Number(lease.expiresAt || 0) > now) {
        return {
          due: false,
          pending: true,
          leased: true,
          waitMs: Number(lease.expiresAt) - now,
          item: withLease_(lease.item, lease.id)
        };
      }
      if (hasWork_(lease.item)) {
        var interruptible = lease.item.background === true || (Array.isArray(lease.item.tasks) &&
          lease.item.tasks[0] && /^(fundCapture|fundTransactionsScan|fundTransactionsPublish)$/.test(lease.item.tasks[0][0]));
        if (lease.checkpoint && interruptible && pending.priority === true &&
            hasWork_(pending) && Number(pending.notBefore || 0) <= now && Number(lease.item.priorityRestarts || 0) < 3) {
          // Only a yielded cursor may be replanned. A Fund capture would also
          // restart on the new signal stamp; republish its lists before that.
          // Merge complete scope so history is never ACKed or lost here.
          var refreshed = mergePending_(lease.item, pending, now, context, false);
          refreshed.months = mergeUnique_(lease.item.months, pending.months).sort();
          refreshed.priorityRestarts = Number(lease.item.priorityRestarts || 0) + 1;
          refreshed.planVersion = lease.item.planVersion;
          var prioritized = createLease_(refreshed, now, context);
          context.deleteProperty(propertyKey_(context));
          return prioritized;
        }
        // Resume the interrupted read-only stage before new events. New pending
        // work stays separate, so an edit arriving during a stage is never ACKed.
        var resumed = lease.item;
        resumed.attempts = Number(resumed.attempts || 0) + (lease.checkpoint ? 0 : 1);
        return createLease_(resumed, now, context);
      }
      if (!hasWork_(pending)) {
        if (lease.id) context.deleteProperty(leasePropertyKey_(context));
        return { due: false, pending: false };
      }
      if (Number(pending.notBefore || 0) > now) {
        return { due: false, pending: true, waitMs: Number(pending.notBefore) - now, item: pending };
      }
      var claimed = createLease_(pending, now, context);
      context.deleteProperty(propertyKey_(context));
      return claimed;
    });
  }

  function claimNextDue(candidates, preferredKey) {
    var queues = (Array.isArray(candidates) ? candidates : []).filter(function (candidate) {
      return candidate && candidate.key && candidate.context;
    });
    if (!queues.length) {
      return { due: false, claims: {}, nextPreferredKey: '' };
    }

    var preferredIndex = queues.map(function (candidate) {
      return String(candidate.key);
    }).indexOf(String(preferredKey || ''));
    if (preferredIndex < 0) preferredIndex = 0;
    var ordered = queues.slice(preferredIndex).concat(queues.slice(0, preferredIndex));
    var claims = {};

    for (var index = 0; index < ordered.length; index++) {
      var candidate = ordered[index];
      var key = String(candidate.key);
      var claimed = claimDue(candidate.context);
      claims[key] = claimed;
      if (!claimed.due) continue;

      ordered.forEach(function (remaining) {
        var remainingKey = String(remaining.key);
        if (claims[remainingKey]) return;
        claims[remainingKey] = {
          due: false,
          pending: getPending(remaining.context) !== null
        };
      });
      var baseIndex = queues.indexOf(candidate);
      return {
        due: true,
        key: key,
        item: claimed.item,
        claims: claims,
        nextPreferredKey: String(queues[(baseIndex + 1) % queues.length].key)
      };
    }

    return {
      due: false,
      claims: claims,
      nextPreferredKey: String(queues[preferredIndex].key)
    };
  }

  function requeue(item, context) {
    if (item && Array.isArray(item.tasks)) {
      item.attempts = Number(item.attempts || 0) + 1;
      return saveProgress(item, context, Number(context.retryDelayMs || DEFAULT_RETRY_DELAY_MS));
    }
    return context.withLock(function () {
      var lease = readLease_(context);
      if (!lease.id || !item || String(item.leaseId || '') !== String(lease.id)) {
        throw new Error('Refresh lease ownership changed; refusing stale retry.');
      }
      var now = context.nowMillis();
      var pending = mergePending_(item || {}, read_(context), now, context, false);
      pending.notBefore = now + Number(context.retryDelayMs || DEFAULT_RETRY_DELAY_MS);
      pending.updatedAt = context.nowISOString();
      pending.sources = mergeUnique_(pending.sources, ['retry']);
      pending.attempts = Number(item && item.attempts || 0) + 1;
      context.setProperty(propertyKey_(context), JSON.stringify(pending));
      releaseLease_(item, context);
      return summarize_(pending, now);
    });
  }

  function createLease_(item, now, context) {
    var sequenceKey = leasePropertyKey_(context) + '_SEQUENCE';
    var sequence = Number(context.getProperty(sequenceKey) || 0) + 1;
    context.setProperty(sequenceKey, String(sequence));
    var id = String(now) + ':' + sequence;
    context.setProperty(leasePropertyKey_(context), JSON.stringify({
      id: id, claimedAt: context.nowISOString(),
      expiresAt: now + Number(context.leaseMs || DEFAULT_LEASE_MS), item: item
    }));
    return { due: true, pending: true, leased: true, item: withLease_(item, id) };
  }

  // Persist a plan before execution (no delay), or yield its remaining stages
  // to the next tick. Ownership prevents an expired worker changing a new lease.
  function saveProgress(item, context, delayMs) {
    return context.withLock(function () {
      var lease = readLease_(context);
      if (!lease.id || !item || String(item.leaseId || '') !== String(lease.id)) {
        throw new Error('Refresh lease ownership changed; refusing stale progress.');
      }
      var stored = withLease_(item, lease.id);
      delete stored.leaseId;
      lease.item = stored;
      if (delayMs !== undefined) {
        lease.expiresAt = context.nowMillis() + Math.max(0, Number(delayMs));
        lease.checkpoint = true;
      }
      context.setProperty(leasePropertyKey_(context), JSON.stringify(lease));
      return { queued: true, remaining: (stored.tasks || []).length, attempts: Number(stored.attempts || 0) };
    });
  }

  function acknowledge(item, context) {
    return context.withLock(function () {
      var lease = readLease_(context);
      if (!lease.id || !item || String(item.leaseId || '') !== String(lease.id)) {
        return { acknowledged: false, pending: hasWork_(read_(context)) || hasWork_(lease.item) };
      }
      context.deleteProperty(leasePropertyKey_(context));
      return { acknowledged: true, pending: hasWork_(read_(context)) };
    });
  }

  // Only short property writes belong inside this lock, never Sheet/network RPCs.
  function withOwnedLease(item, context, fn) {
    return context.withLock(function () {
      var lease = readLease_(context);
      if (!lease.id || String(item.leaseId || '') !== String(lease.id) || Number(lease.expiresAt || 0) <= context.nowMillis()) {
        throw new Error('Refresh lease ownership changed before committing source fingerprints.');
      }
      return fn();
    });
  }

  function getPending(context) {
    return context.withLock(function () {
      var pending = read_(context);
      if (hasWork_(pending)) return summarize_(pending, context.nowMillis());
      var lease = readLease_(context);
      if (!hasWork_(lease.item)) return null;
      var summary = summarize_(lease.item, context.nowMillis());
      summary.leased = true;
      summary.leaseExpiresAt = Number(lease.expiresAt || 0);
      return summary;
    });
  }

  // Owner-only rollout adapter; callers must pause/drain and durably back up
  // the exact snapshot before invoking apply. Never exposed as a browser RPC.
  function prepareLegacyRollback(context, options) {
    var input = options || {};
    return context.withLock(function () {
      var pendingRaw = context.getProperty(propertyKey_(context)) || '';
      var leaseRaw = context.getProperty(leasePropertyKey_(context)) || '';
      var lease = readLease_(context);
      if (lease.id && Number(lease.expiresAt || 0) > context.nowMillis()) {
        throw new Error('Refresh lease still active; drain before rollback.');
      }
      var items = [read_(context), lease.item || {}];
      var sheets = [];
      var catalogs = [];
      items.forEach(function (item) {
        sheets = mergeUnique_(sheets, item.sheets);
        catalogs = mergeUnique_(catalogs, item.catalogs);
        (item.tasks || []).forEach(function (task) {
          if (['manage', 'manageMonth', 'discoverManage'].indexOf(task[0]) !== -1) sheets = mergeUnique_(sheets, [task[1]]);
          if (task[0] === 'catalog') catalogs = mergeUnique_(catalogs, [task[1]]);
        });
      });
      var pending = null;
      if (items.some(hasWork_)) {
        pending = mergePending_(items[0], items[1], context.nowMillis(), context, true);
        pending.full = true;
        pending.includeAll = true;
        pending.months = [];
        if (input.targetRuntime === 'staged401') {
          pending.sheets = sheets.slice();
          pending.catalogs = catalogs.slice();
        } else {
          delete pending.sheets;
          delete pending.catalogs;
        }
      }
      var snapshot = { pendingRaw: pendingRaw, leaseRaw: leaseRaw };
      var plan = { snapshot: snapshot, pending: pending, manageSheetsToRefresh: sheets, catalogsToRefresh: catalogs };
      if (input.apply !== true) return plan;
      if (input.expectedPendingRaw !== pendingRaw || input.expectedLeaseRaw !== leaseRaw) throw new Error('Refresh rollback snapshot drift.');
      if (!context.isRuntimePaused || !context.isRuntimePaused()) throw new Error('Pause runtime before refresh rollback.');
      if (!context.backup) throw new Error('Durable refresh rollback backup is required.');
      context.backup(plan);
      if (pending) context.setProperty(propertyKey_(context), JSON.stringify(pending));
      else context.deleteProperty(propertyKey_(context));
      context.deleteProperty(leasePropertyKey_(context));
      return plan;
    });
  }

  function read_(context) {
    return parse_(context.getProperty(propertyKey_(context)));
  }

  function readLease_(context) {
    var value = parse_(context.getProperty(leasePropertyKey_(context)));
    return value && typeof value === 'object' ? value : {};
  }

  function propertyKey_(context) {
    return context && context.propertyKey ? String(context.propertyKey) : PROPERTY_KEY;
  }

  function leasePropertyKey_(context) {
    return context && context.leasePropertyKey
      ? String(context.leasePropertyKey)
      : propertyKey_(context) + '_LEASE';
  }

  function withLease_(item, leaseId) {
    var result = {};
    Object.keys(item || {}).forEach(function (key) { result[key] = item[key]; });
    result.leaseId = leaseId;
    return result;
  }

  function releaseLease_(item, context) {
    var lease = readLease_(context);
    if (lease.id && item && String(item.leaseId || '') === String(lease.id)) {
      context.deleteProperty(leasePropertyKey_(context));
    }
  }

  function mergePending_(left, right, now, context, reclaimingExpiredLease) {
    var first = left || {};
    var second = right || {};
    var full = first.full === true || second.full === true;
    return {
      full: full,
      includeAll: first.includeAll !== false || second.includeAll === true,
      months: full ? [] : mergeUnique_(first.months, second.months).sort(),
      priorityMonths: mergeUnique_(first.priorityMonths, second.priorityMonths),
      priority: first.priority === true || second.priority === true,
      refreshDashboard: first.refreshDashboard === true || second.refreshDashboard === true,
      sheets: mergeUnique_(first.sheets, second.sheets),
      catalogs: mergeUnique_(first.catalogs, second.catalogs),
      verificationPasses: Math.max(Number(first.verificationPasses || 0), Number(second.verificationPasses || 0)),
      notBefore: reclaimingExpiredLease ? now : Math.max(Number(first.notBefore || 0), Number(second.notBefore || 0)),
      updatedAt: context.nowISOString(),
      sources: mergeUnique_(first.sources, second.sources),
      attempts: Math.max(Number(first.attempts || 0), Number(second.attempts || 0)) + (reclaimingExpiredLease ? 1 : 0)
    };
  }

  function parse_(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      var value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch (err) {
      return {};
    }
  }

  function normalizeMonths_(months, normalize) {
    var values = [];
    (Array.isArray(months) ? months : []).forEach(function (month) {
      var normalized = normalize(month);
      if (normalized && values.indexOf(normalized) === -1) values.push(normalized);
    });
    return values.sort();
  }

  function mergeUnique_(left, right) {
    var values = [];
    (Array.isArray(left) ? left : []).concat(Array.isArray(right) ? right : []).forEach(function (value) {
      if (value !== undefined && value !== null && values.indexOf(value) === -1) values.push(value);
    });
    return values;
  }

  function hasWork_(pending) {
    return Boolean(pending && (pending.full === true || (pending.months && pending.months.length) ||
      pending.refreshDashboard === true || (pending.sheets && pending.sheets.length) ||
      (pending.catalogs && pending.catalogs.length) || Array.isArray(pending.tasks)));
  }

  function isPrioritySource_(source) {
    return /^(signal:|sheet:|fund-sheet|poll:|payroll-explanation-stale)/.test(String(source || ''));
  }

  function summarize_(pending, now) {
    return {
      full: pending.full === true,
      includeAll: pending.includeAll !== false,
      months: (pending.months || []).slice(),
      priorityMonths: (pending.priorityMonths || []).slice(),
      priority: pending.priority === true,
      refreshDashboard: pending.refreshDashboard === true,
      sheets: (pending.sheets || []).slice(),
      catalogs: (pending.catalogs || []).slice(),
      remainingStages: Array.isArray(pending.tasks) ? pending.tasks.length : null,
      notBefore: Number(pending.notBefore || 0),
      waitMs: Math.max(0, Number(pending.notBefore || 0) - now),
      updatedAt: pending.updatedAt || '',
      sources: (pending.sources || []).slice(),
      attempts: Number(pending.attempts || 0),
      verificationPasses: Number(pending.verificationPasses || 0)
    };
  }

  return {
    enqueue: enqueue,
    claimDue: claimDue,
    claimNextDue: claimNextDue,
    requeue: requeue,
    saveProgress: saveProgress,
    acknowledge: acknowledge,
    withOwnedLease: withOwnedLease,
    getPending: getPending,
    prepareLegacyRollback: prepareLegacyRollback
  };
})();
