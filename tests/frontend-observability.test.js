const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const OBSERVABILITY_GLOBALS = [
  'loadSupabaseSyncStatus',
  'renderSupabaseSyncStatus',
  'runManageCacheAudit',
  'runReportCacheAudit',
  'formatSyncStatusTime',
  'formatSyncStatusAge'
];

test('observability module owns status, audit, and queue rendering globals', () => {
  const files = fs.readdirSync(root).filter((file) => /^client_.*\.html$/.test(file));
  for (const functionName of OBSERVABILITY_GLOBALS) {
    const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const owners = files.filter((file) => pattern.test(read(file)));
    assert.deepEqual(owners, ['client_observability.html'], `${functionName} must have one frontend owner`);
  }

  const observability = read('client_observability.html');
  assert.match(observability, /getSupabaseSyncStatus/);
  assert.match(observability, /getRecentWriteJobs/);
  assert.match(observability, /getManageCacheAudit/);
  assert.match(observability, /getReportCacheAudit/);
  assert.match(observability, /retryPendingWriteJob/);
});

test('default status load skips heavy audits and keeps quick/deep/all audit contracts', () => {
  const source = read('client_observability.html');
  const loadStart = source.indexOf('function loadSupabaseSyncStatus');
  const renderStart = source.indexOf('function renderSupabaseSyncStatus', loadStart);
  const loadBlock = source.slice(loadStart, renderStart);

  assert.doesNotMatch(loadBlock, /getManageCacheAudit|getReportCacheAudit/);
  assert.match(loadBlock, /manageAudit:\s*\{ ok: true, skipped: true, results: \[\] \}/);
  assert.match(loadBlock, /reportAudit:\s*\{ ok: true, skipped: true, results: \[\] \}/);
  assert.match(source, /const auditLimit = deep \? 500 : 50/);
  assert.match(source, /sheetNames: allSheets \? '' : getCurrentManageAuditSheetName_\(\)/);
  assert.match(source, /months: '05\/2026,06\/2026,07\/2026,Tất cả'/);
});

test('observability include keeps dependency order and generated artifact ownership', () => {
  const template = read('index.template.html');
  const observabilityIndex = template.indexOf("include('client_observability')");
  assert.ok(template.indexOf("include('client_data')") < observabilityIndex);
  assert.ok(template.indexOf("include('client_ui')") < observabilityIndex);

  const ui = read('client_ui.html');
  for (const functionName of OBSERVABILITY_GLOBALS) {
    assert.doesNotMatch(ui, new RegExp(`function\\s+${functionName}\\s*\\(`));
  }
});
