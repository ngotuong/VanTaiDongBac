const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('React Observability preserves legacy labels, controls, IDs, and permission marker', () => {
  const legacy = read('index.template.html');
  const react = read('next-shell/components/Observability.jsx');
  for (const text of ['Trạng thái đồng bộ', 'Theo dõi cache và write queue. Audit chỉ chạy khi bấm kiểm tra.', 'Làm mới', 'Kiểm tra Vận hành', 'Kiểm tra sâu', 'Kiểm tra tất cả', 'Kiểm tra Báo cáo', 'Chọn Cài đặt để tải trạng thái.']) {
    assert.ok(legacy.includes(text), `legacy markup is missing: ${text}`);
    assert.ok(react.includes(text), `React markup is missing: ${text}`);
  }
  for (const id of ['syncStatusCheckedAt', 'syncStatusRefreshBtn', 'manageAuditBtn', 'manageDeepAuditBtn', 'manageAllAuditBtn', 'reportAuditBtn', 'syncStatusBody']) {
    assert.match(react, new RegExp(`id="${id}"`));
  }
  assert.match(react, /data-hide-shareholder="true"/);
});

test('React Observability bridge preserves exact quick, deep, all, report, and retry contracts', () => {
  const component = read('next-shell/components/Observability.jsx');
  const client = read('next-shell/lib/observability-client.js');
  assert.match(component, /call\('loadSupabaseSyncStatus', true\)/);
  assert.match(component, /call\('runManageCacheAudit', false\)/);
  assert.match(component, /call\('runManageCacheAudit', false, true\)/);
  assert.match(component, /call\('runManageCacheAudit', true, true\)/);
  assert.match(component, /call\('runReportCacheAudit'\)/);
  assert.match(client, /getSupabaseSyncStatus/);
  assert.match(client, /limit: 24/);
  assert.match(client, /getRecentWriteJobs/);
  assert.match(client, /module: 'transport', limit: 12/);
  assert.match(client, /deep \? 500 : 50/);
  assert.match(client, /05\/2026,06\/2026,07\/2026,Tất cả/);
  assert.match(client, /retryWriteJob/);
});

test('default React Observability status load never runs heavy audits', () => {
  const client = read('next-shell/lib/observability-client.js');
  const loadStart = client.indexOf('loadStatus:');
  const auditStart = client.indexOf('auditManage:', loadStart);
  assert.doesNotMatch(client.slice(loadStart, auditStart), /getManageCacheAudit|getReportCacheAudit/);
});

test('React Observability canary defaults off with independent legacy rollback', () => {
  const entry = read('react-observability/entry.jsx');
  const template = read('index.template.html');
  assert.match(entry, /if \(!enabled\(window\.__REACT_OBSERVABILITY_ENABLED\)\) return false/);
  assert.match(entry, /legacy\.remove\(\)/);
  assert.match(entry, /window\.mountReactObservability/);
  assert.match(template, /observabilityLegacyRoot/);
  assert.match(template, /observabilityReactRoot/);
  assert.match(template, /observability-react\.js/);
  assert.match(read('.env.example'), /VITE_REACT_OBSERVABILITY_ENABLED=false/);
  assert.match(read('client_observability.html'), /function loadSupabaseSyncStatus/);
});

test('Next shell statically exports the Observability canary route', () => {
  assert.match(read('next-shell/app/observability/page.jsx'), /<Observability/);
  assert.match(read('package.json'), /build-observability-react\.js/);
});
