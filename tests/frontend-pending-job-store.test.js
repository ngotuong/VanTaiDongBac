const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stripScript = (source) => source.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

function loadStore() {
  const context = vm.createContext({ console });
  context.window = context;
  new vm.Script(stripScript(read('client_pending_job_store.html')), { filename: 'client_pending_job_store.html' }).runInContext(context);
  return context;
}

test('pending store owns transport/fund state and compatibility globals', () => {
  const config = read('client_config.html');
  const store = read('client_pending_job_store.html');
  assert.doesNotMatch(config, /let pending(?:Fund)?WriteJobs\s*=/);
  assert.match(store, /Object\.defineProperty\(window, 'pendingWriteJobs'/);
  assert.match(store, /Object\.defineProperty\(window, 'pendingFundWriteJobs'/);

  const context = loadStore();
  assert.deepEqual(Array.from(context.pendingWriteJobs), []);
  assert.deepEqual(Array.from(context.pendingFundWriteJobs), []);
  context.pendingWriteJobs = [{ jobId: 'T1', status: 'pending' }];
  context.pendingFundWriteJobs = [{ jobId: 'F1', status: 'failed' }];
  assert.equal(context.pendingWriteJobs[0].jobId, 'T1');
  assert.equal(context.pendingFundWriteJobs[0].jobId, 'F1');
});

test('store upsert/update/remove and limits preserve one job per id', () => {
  const context = loadStore();
  vm.runInContext(`
    PendingJobStore.upsert('transport', { jobId: 'A', status: 'pending' });
    PendingJobStore.upsert('transport', { jobId: 'B', status: 'processing' });
    PendingJobStore.upsert('transport', { jobId: 'A', status: 'failed' }, { limit: 2 });
    PendingJobStore.update('transport', 'B', { lastError: 'x' });
    PendingJobStore.remove('transport', 'A');
  `, context);
  assert.equal(context.pendingWriteJobs.length, 1);
  assert.deepEqual({ ...context.pendingWriteJobs[0] }, { jobId: 'B', status: 'processing', lastError: 'x' });
});

test('mergeRecent restores only new jobs and subscription can be removed', () => {
  const context = loadStore();
  vm.runInContext(`
    var pendingNotifications = 0;
    var unsubscribePending = PendingJobStore.subscribe('fund', () => pendingNotifications++);
    PendingJobStore.replace('fund', [{ jobId: 'F1', status: 'pending' }]);
    PendingJobStore.mergeRecent('fund', [
      { jobId: 'F1', status: 'failed' },
      { jobId: 'F2', status: 'processing' }
    ], { limit: 2 });
    unsubscribePending();
    PendingJobStore.remove('fund', 'F2');
  `, context);
  assert.equal(context.pendingNotifications, 2);
  assert.deepEqual(Array.from(context.pendingFundWriteJobs, (job) => job.jobId), ['F1']);
});

test('transport and fund mutations delegate to the shared store', () => {
  const entry = read('client_entry.html');
  const fund = read('client_cashflow_pending.html');
  assert.match(entry, /PendingJobStore\.upsert\('transport'/);
  assert.match(entry, /PendingJobStore\.update\('transport'/);
  assert.match(entry, /PendingJobStore\.remove\('transport'/);
  assert.match(entry, /PendingJobStore\.mergeRecent\('transport'/);
  assert.match(fund, /PendingJobStore\.upsert\('fund'/);
  assert.match(fund, /PendingJobStore\.replace\('fund'/);
  assert.match(fund, /PendingJobStore\.remove\('fund'/);
});

test('pending store loads after config and before every consumer in both bundles', () => {
  for (const file of ['index.template.html', 'client.html']) {
    const html = read(file);
    const store = html.indexOf("include('client_pending_job_store')");
    assert.ok(html.indexOf("include('client_config')") < store);
    for (const consumer of ['client_cashflow_transactions', 'client_cashflow_pending', 'client_dashboard', 'client_entry', 'client_manage']) {
      assert.ok(store < html.indexOf(`include('${consumer}')`), `${file}: store must load before ${consumer}`);
    }
  }
});
