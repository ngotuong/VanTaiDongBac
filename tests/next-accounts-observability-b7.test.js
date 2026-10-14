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

test('B7 settings preserves the six proxy-local account actions and keeps secrets client-only', () => {
  const source = read('next-shell/components/settings/SettingsModule.tsx');
  for (const action of ['changeOwnPassword', 'listUsers', 'createUser', 'updateUser', 'resetUserPassword', 'deleteUser']) {
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
  assert.match(source, /\{isAdmin && <article className="info-card account-management-card"/);
  assert.match(source, /current-password/);
  assert.match(source, /new-password/);
  assert.match(shell, /href: '\/settings'.+ALL_ROLES/);
  assert.match(shell, /href: '\/settings'.+aliases: \['\/observability'\].+ALL_ROLES/);
  assert.match(source, /user\.role !== 'shareholder'.+href="\/observability"/s);
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

test('B7 observability preserves quick deep all report and explicit cancel/retry contracts', () => {
  const source = read('next-shell/components/observability/ObservabilityModule.tsx');
  assert.match(source, /mode === 'quick' \? 50 : 500/);
  assert.match(source, /DEFAULT_MANAGE_SHEET = 'NL_VanChuyen'/);
  assert.match(source, /sheetNames: allSheets \? '' : DEFAULT_MANAGE_SHEET/);
  assert.doesNotMatch(source, /05\/2026,06\/2026,07\/2026,Tất cả/);
  assert.match(source, /'getReportCacheAudit'.+forceRefresh: true/);
  assert.match(source, /for \(const month of reportAuditMonths\(\)\)/);
  assert.match(source, /params: \{ months: month, forceRefresh: true \}/);
  assert.match(source, /Mã đối chiếu:/);
  assert.match(source, /'getManageCacheAudit'/);
  assert.match(source, /'getReportCacheAudit'/);
  assert.doesNotMatch(source.slice(source.indexOf('const cancel'), source.indexOf('if (user.role', source.indexOf('const cancel'))), /window\.confirm/);
  assert.match(source, /'retryWriteJob'/);
  assert.match(source, /'cancelWriteJob'/);
  assert.match(source, /ĐÃ HỦY/);
  assert.match(source, /Xác nhận hủy/);
  assert.match(source, /Bỏ qua/);
  assert.match(source, /status === 'pending'.+onCancel/s);
  assert.match(source, /status === 'failed' && !canceled/);
  assert.doesNotMatch(source, /'processWriteJobs'/);
});

test('B7 operational and account role enforcement remains server-side', () => {
  const policy = read('server/services/authorization-policy.js');
  const accounts = read('server/services/account-service.js');
  assert.match(policy, /shareholder.+!SHAREHOLDER_ACTIONS\.has\(action\)/);
  assert.doesNotMatch(policy, /getSupabaseSyncStatus|getRecentWriteJobs|getManageCacheAudit|getReportCacheAudit|retryWriteJob|cancelWriteJob/);
  const ownPassword = accounts.indexOf("action === 'changeOwnPassword'");
  const adminGuard = accounts.indexOf('assertAdmin(user);', ownPassword);
  assert.ok(ownPassword >= 0 && adminGuard > ownPassword);
  for (const action of ['listUsers', 'createUser', 'updateUser', 'resetUserPassword', 'deleteUser']) {
    assert.ok(accounts.indexOf(`action === '${action}'`) > adminGuard);
  }
});

test('C3.6 Settings and Observability reuse the exact C2 golden structure without B7 redesign classes', () => {
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const observability = read('next-shell/components/observability/ObservabilityModule.tsx');
  const css = read('next-shell/app/c2-golden.css');
  assert.match(settings + observability, /aria-live="polite"/);
  assert.match(settings, /role=\{error \? 'alert' : 'status'\}/);
  assert.match(observability, /role=\{error \? 'alert' : 'status'\}/);
  assert.match(settings, /id="settingsView" className="view active settings-c2"/);
  for (const id of ['currentAccountIdentity', 'currentPasswordInput', 'newPasswordInput', 'confirmPasswordInput', 'changePasswordBtn', 'newAccountUsername', 'newAccountDisplayName', 'newAccountRole', 'newAccountPassword', 'createAccountBtn', 'temporaryPasswordBox', 'temporaryPasswordAccount', 'temporaryPasswordValue', 'accountUsersBody', 'accountSettingsStatus']) {
    assert.match(settings, new RegExp(`id="${id}"`));
  }
  for (const className of ['account-password-card', 'account-form-grid', 'password-field', 'password-toggle-btn', 'account-management-card', 'account-create-grid', 'temporary-password-box', 'account-users-table', 'account-inline-input', 'account-active-toggle', 'account-row-actions']) {
    assert.match(settings, new RegExp(className));
  }
  for (const id of ['syncStatusCheckedAt', 'syncStatusRefreshBtn', 'manageAuditBtn', 'manageDeepAuditBtn', 'manageAllAuditBtn', 'reportAuditBtn', 'syncStatusBody']) {
    assert.match(observability, new RegExp(`id="${id}"`));
  }
  for (const className of ['sync-status-card', 'settings-card-header', 'sync-status-actions', 'sync-status-section', 'sync-status-row', 'sync-status-main', 'sync-status-key', 'sync-status-note', 'sync-status-pill', 'sync-status-time', 'sync-status-empty', 'sync-status-retry', 'sync-status-cancel', 'sync-status-confirm-actions']) {
    assert.match(observability, new RegExp(className));
  }
  assert.match(observability, /M21\.5 2v6h-6M21\.34 15\.57/);
  assert.doesNotMatch(settings + observability, /b7-/);
  assert.match(css, /\.account-form-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.password-toggle-btn \{ min-width: 58px; min-height: 44px/);
  assert.match(css, /\.account-users-table \{ min-width: 860px/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.account-form-grid,[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sync-status-row \{[\s\S]*grid-template-columns: 1fr/);
});

test('C3.6 Observability blocks shareholder client loading as well as server actions', () => {
  const source = read('next-shell/components/observability/ObservabilityModule.tsx');
  const loadStart = source.indexOf('const loadStatus');
  const effectStart = source.indexOf('useEffect', loadStart);
  assert.match(source.slice(loadStart, effectStart), /user\.role === 'shareholder'/);
  assert.match(source, /if \(user\.role === 'shareholder'\) \{/);
  assert.match(source, /Tài khoản cổ đông không có quyền truy cập công cụ vận hành này/);
});

test('D1 keeps B7 exclusively on independent Next modules', () => {
  assert.equal(fs.existsSync(path.join(root, 'next-shell/components/Accounts.jsx')), false);
  assert.equal(fs.existsSync(path.join(root, 'next-shell/components/Observability.jsx')), false);
  assert.doesNotMatch(read('.env.example'), /VITE_REACT_/);
});
