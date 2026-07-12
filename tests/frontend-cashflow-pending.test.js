const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PENDING_GLOBALS = [
  'normalizePendingFundJob', 'trackPendingFundWriteJob', 'loadRecentFundWriteJobs',
  'pollFundWriteJob', 'retryFundWriteJob'
];

test('cashflow pending-job globals have one frontend owner', () => {
  const files = fs.readdirSync(root).filter((file) => /^client_.*\.html$/.test(file));
  for (const functionName of PENDING_GLOBALS) {
    const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const owners = files.filter((file) => pattern.test(read(file)));
    assert.deepEqual(owners, ['client_cashflow_pending.html'], `${functionName} must have one frontend owner`);
  }
});

test('pending module preserves restore, polling, retry, and synced refresh contracts', () => {
  const source = read('client_cashflow_pending.html');
  assert.match(source, /getRecentWriteJobs/);
  assert.match(source, /module: 'fund'/);
  assert.match(source, /actionName: 'addFundTransactions'/);
  assert.match(source, /\['pending', 'processing', 'failed'\]\.includes\(job\.status\)/);
  assert.match(source, /getWriteJobStatus/);
  assert.match(source, /retryWriteJob/);
  assert.match(source, /loadFundTransactions\(true\)/);
  assert.match(source, /loadFundOverview\(true\)/);
  assert.match(source, /kickWriteJobWorker/);
});

test('pending overlay remains excluded after synced and keeps failure visible', () => {
  const source = read('client_cashflow_pending.html');
  assert.match(source, /job\.status === 'synced'/);
  assert.match(source, /PendingJobStore\.remove\('fund', jobId\)/);
  assert.match(source, /job\.status === 'failed'/);
  assert.match(source, /renderFundTransactions\(fundTransactionsData\)/);
});

test('cashflow pending fragment loads after transaction consumer', () => {
  const template = read('index.template.html');
  const transactions = template.indexOf("include('client_cashflow_transactions')");
  const pending = template.indexOf("include('client_cashflow_pending')");
  assert.ok(transactions >= 0 && pending > transactions);
  assert.ok(pending < template.indexOf("include('client_manage')"));
});
