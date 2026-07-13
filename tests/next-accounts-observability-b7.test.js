const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('B7 exposes independent Next settings and observability routes without legacy bridges', () => {
  const settingsPage = read('next-shell/app/settings/page.jsx');
  const observabilityPage = read('next-shell/app/observability/page.jsx');
  assert.match(settingsPage, /<SettingsModule/);
  assert.match(observabilityPage, /<ObservabilityModule/);
  assert.doesNotMatch(settingsPage + observabilityPage, /bridge=|Accounts\.jsx|Observability\.jsx/);
  assert.match(read('app/settings/page.jsx'), /next-shell\/app\/settings/);
});

test('B7 settings preserves the five proxy-local account actions and keeps secrets client-only', () => {
  const source = read('next-shell/components/settings/SettingsModule.tsx');
  for (const action of ['changeOwnPassword', 'listUsers', 'createUser', 'updateUser', 'resetUserPassword']) {
    assert.match(source, new RegExp(`'${action}'`));
  }
  assert.match(source, /createClientApiClient/);
  assert.match(source, /temporaryPassword/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(source, /createServerApiClient|serviceRole|refreshToken|localStorage|sessionStorage/);
});

test('B7 settings keeps own-password for all roles and account administration admin-only', () => {
  const source = read('next-shell/components/settings/SettingsModule.tsx');
  const shell = read('next-shell/components/platform/AppShell.tsx');
  assert.match(source, /const isAdmin = user\.role === 'admin'/);
  assert.match(source, /\{isAdmin && <section/);
  assert.match(source, /current-password/);
  assert.match(source, /new-password/);
  assert.match(shell, /href: '\/settings'.+ALL_ROLES/);
  assert.match(shell, /href: '\/observability'.+WRITE_ROLES/);
});

test('B7 observability default load is light and never invokes an audit or worker', () => {
  const source = read('next-shell/components/observability/ObservabilityModule.tsx');
  const loadStart = source.indexOf('const loadStatus');
  const auditStart = source.indexOf('const auditManage', loadStart);
  const loadBlock = source.slice(loadStart, auditStart);
  assert.match(loadBlock, /getSupabaseSyncStatus/);
  assert.match(loadBlock, /getRecentWriteJobs/);
  assert.doesNotMatch(loadBlock, /getManageCacheAudit|getReportCacheAudit|processWriteJobs/);
});

test('B7 observability preserves quick deep all report and explicit retry contracts', () => {
  const source = read('next-shell/components/observability/ObservabilityModule.tsx');
  assert.match(source, /mode === 'quick' \? 50 : 500/);
  assert.match(source, /sheetNames: allSheets \? '' : sheetName/);
  assert.match(source, /05\/2026,06\/2026,07\/2026,Tất cả/);
  assert.match(source, /'getManageCacheAudit'/);
  assert.match(source, /'getReportCacheAudit'/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /'retryWriteJob'/);
  assert.doesNotMatch(source, /'processWriteJobs'/);
});

test('B7 operational and account role enforcement remains server-side', () => {
  const policy = read('server/services/authorization-policy.js');
  const accounts = read('server/services/account-service.js');
  assert.match(policy, /shareholder.+!SHAREHOLDER_ACTIONS\.has\(action\)/);
  assert.doesNotMatch(policy, /getSupabaseSyncStatus|getRecentWriteJobs|getManageCacheAudit|getReportCacheAudit|retryWriteJob/);
  const ownPassword = accounts.indexOf("action === 'changeOwnPassword'");
  const adminGuard = accounts.indexOf('assertAdmin(user);', ownPassword);
  assert.ok(ownPassword >= 0 && adminGuard > ownPassword);
  for (const action of ['listUsers', 'createUser', 'updateUser', 'resetUserPassword']) {
    assert.ok(accounts.indexOf(`action === '${action}'`) > adminGuard);
  }
});

test('B7 UI provides accessible feedback, touch targets, responsive tables and dark states', () => {
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const observability = read('next-shell/components/observability/ObservabilityModule.tsx');
  const css = read('next-shell/app/platform.css');
  assert.match(settings + observability, /aria-live="polite"/);
  assert.match(settings, /role=\{error \? 'alert' : 'status'\}/);
  assert.match(observability, /role=\{error \? 'alert' : 'status'\}/);
  assert.match(css, /\.b7-module button\{min-height:44px/);
  assert.match(css, /\.b7-table-wrap\{[^}]*overflow:auto/);
  assert.match(css, /@media\(max-width:640px\).*\.b7-module/);
  assert.match(css, /@media\(prefers-color-scheme:dark\).*\.b7-module/);
});

test('B7 keeps legacy account and observability islands for rollback', () => {
  assert.match(read('next-shell/components/Accounts.jsx'), /data-react-accounts-root/);
  assert.match(read('next-shell/components/Observability.jsx'), /data-hide-shareholder/);
  assert.match(read('react-accounts/entry.jsx'), /window\.mountReactAccounts/);
  assert.match(read('react-observability/entry.jsx'), /window\.mountReactObservability/);
  assert.match(read('.env.example'), /VITE_REACT_ACCOUNTS_ENABLED=false/);
  assert.match(read('.env.example'), /VITE_REACT_OBSERVABILITY_ENABLED=false/);
});
