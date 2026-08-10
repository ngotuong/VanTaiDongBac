'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import type { AccountUser } from '../../lib/platform/operations-types';
import type { AppRole } from '../../lib/platform/types';
import { showToast } from '../../lib/platform/toast';
import { PushNotificationSettings } from './PushNotificationSettings';
import { FundAlertSettings } from './FundAlertSettings';
import { PillSwitch } from './PillSwitch';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Quản trị viên',
  operator: 'Nhân viên vận hành',
  shareholder: 'Cổ đông (chỉ xem)'
};

type AccountDraft = { displayName: string; role: AppRole; active: boolean };
type NewAccount = { username: string; displayName: string; role: AppRole; password: string };
type PasswordKey = 'current' | 'next' | 'confirm' | 'create';
type SettingsTab = 'notifications' | 'accounts' | 'sync';
const EMPTY_ACCOUNT: NewAccount = { username: '', displayName: '', role: 'shareholder', password: '' };

export function SettingsModule() {
  const { user } = useWorkbookContext();
  const api = useMemo(() => createClientApiClient(), []);
  const isAdmin = user.role === 'admin';
  const availableTabs: { key: SettingsTab; label: string }[] = [
    { key: 'notifications', label: 'Thông báo' },
    { key: 'accounts', label: 'Tài khoản' },
    ...(user.role !== 'shareholder' ? [{ key: 'sync' as const, label: 'Đồng bộ' }] : [])
  ];
  const [activeTab, setActiveTab] = useState<SettingsTab>('notifications');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [shownPasswords, setShownPasswords] = useState<Record<PasswordKey, boolean>>({ current: false, next: false, confirm: false, create: false });
  const [newAccount, setNewAccount] = useState<NewAccount>(EMPTY_ACCOUNT);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccountDraft>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{ username: string; value: string } | null>(null);

  const report = (value: string, isError = false) => { setMessage(value); setError(isError); showToast(value, isError ? 'error' : 'success'); };
  const togglePassword = (key: PasswordKey) => setShownPasswords((current) => ({ ...current, [key]: !current[key] }));
  const loadUsers = async () => {
    if (!isAdmin || activeTab !== 'accounts') return;
    setLoadingUsers(true);
    try {
      const result = await api.get<{ users?: AccountUser[] }>('listUsers');
      const nextUsers = result.users || [];
      setUsers(nextUsers);
      publishDataSourceMeta(null, 'supabase');
      setDrafts(Object.fromEntries(nextUsers.map((item) => [item.user_id, {
        displayName: item.display_name || '', role: item.role, active: Boolean(item.active)
      }])));
    } catch (loadError) {
      report(loadError instanceof Error ? loadError.message : String(loadError), true);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    publishDataSourceMeta(null, 'supabase');
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => { void loadUsers(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const changePassword = async () => {
    if (!passwords.currentPassword) return report('Vui lòng nhập mật khẩu hiện tại.', true);
    if (passwords.newPassword.length < 6) return report('Mật khẩu mới phải có ít nhất 6 ký tự.', true);
    if (passwords.newPassword !== passwords.confirmPassword) return report('Mật khẩu xác nhận chưa khớp.', true);
    setBusy('password');
    try {
      const result = await api.post<{ message?: string }>('changeOwnPassword', { body: {
        currentPassword: passwords.currentPassword, newPassword: passwords.newPassword
      }});
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      report(result.message || 'Đã đổi mật khẩu thành công.');
    } catch (changeError) {
      report(changeError instanceof Error ? changeError.message : String(changeError), true);
    } finally { setBusy(''); }
  };

  const createUser = async () => {
    const username = newAccount.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return report('Tên đăng nhập không hợp lệ.', true);
    if (!newAccount.displayName.trim()) return report('Vui lòng nhập tên hiển thị.', true);
    if (newAccount.password && newAccount.password.length < 6) return report('Mật khẩu tự nhập phải có ít nhất 6 ký tự.', true);
    setBusy('create');
    try {
      const result = await api.post<{ temporaryPassword?: string }>('createUser', { body: { ...newAccount, username } });
      setTemporaryPassword({ username, value: result.temporaryPassword || '' });
      setNewAccount(EMPTY_ACCOUNT);
      report(`Đã tạo tài khoản ${username}.`);
      await loadUsers();
    } catch (createError) {
      report(createError instanceof Error ? createError.message : String(createError), true);
    } finally { setBusy(''); }
  };

  const saveUser = async (account: AccountUser) => {
    const draft = drafts[account.user_id];
    if (!draft?.displayName.trim()) return report('Tên hiển thị không được để trống.', true);
    setBusy(`save:${account.user_id}`);
    try {
      await api.post('updateUser', { body: { userId: account.user_id, ...draft } });
      report('Đã cập nhật quyền tài khoản.');
      await loadUsers();
    } catch (saveError) {
      report(saveError instanceof Error ? saveError.message : String(saveError), true);
    } finally { setBusy(''); }
  };

  const resetPassword = async (account: AccountUser) => {
    if (!window.confirm(`Đặt lại mật khẩu cho tài khoản ${account.username}?`)) return;
    setBusy(`reset:${account.user_id}`);
    try {
      const result = await api.post<{ temporaryPassword?: string }>('resetUserPassword', { body: { userId: account.user_id } });
      setTemporaryPassword({ username: account.username, value: result.temporaryPassword || '' });
      report(`Đã đặt lại mật khẩu cho ${account.username}.`);
    } catch (resetError) {
      report(resetError instanceof Error ? resetError.message : String(resetError), true);
    } finally { setBusy(''); }
  };

  const deleteUser = async (account: AccountUser) => {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản ${account.username}? Tài khoản này sẽ không thể đăng nhập lại.`)) return;
    setBusy(`delete:${account.user_id}`);
    try {
      const result = await api.post<{ message?: string }>('deleteUser', { body: { userId: account.user_id } });
      report(result.message || `Đã xóa tài khoản ${account.username}.`);
      await loadUsers();
    } catch (deleteError) {
      report(deleteError instanceof Error ? deleteError.message : String(deleteError), true);
    } finally { setBusy(''); }
  };

  const updateDraft = (id: string, patch: Partial<AccountDraft>) => setDrafts((current) => ({
    ...current, [id]: { ...current[id], ...patch }
  }));

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword?.value) return;
    try { await navigator.clipboard.writeText(temporaryPassword.value); report('Đã sao chép mật khẩu tạm.'); }
    catch { report('Không thể tự sao chép. Hãy chọn và sao chép thủ công.', true); }
  };

  return <section id="settingsView" className="view active settings-c2">
    <div className="settings-section-tabs" role="tablist" aria-label="Nhóm cài đặt" style={{ gridTemplateColumns: `repeat(${availableTabs.length}, minmax(0, 1fr))` }}>
      {availableTabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls={`settings-panel-${tab.key}`} id={`settings-tab-${tab.key}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
    </div>
    <div id="settings-panel-notifications" className="settings-tab-panel settings-grid" role="tabpanel" aria-labelledby="settings-tab-notifications" hidden={activeTab !== 'notifications'}>
      <PushNotificationSettings />
      {isAdmin && <FundAlertSettings />}
    </div>

    <div id="settings-panel-accounts" className="settings-tab-panel settings-grid" role="tabpanel" aria-labelledby="settings-tab-accounts" hidden={activeTab !== 'accounts'}>
      <article className="info-card account-password-card">
        <h2>Đổi mật khẩu</h2>
        <p id="currentAccountIdentity" className="account-card-note">{user.displayName || user.username} · {ROLE_LABELS[user.role]}</p>
        <div className="account-form-grid">
          <label>Mật khẩu hiện tại
            <PasswordField id="currentPasswordInput" shown={shownPasswords.current} autoComplete="current-password" value={passwords.currentPassword} onChange={(value) => setPasswords({ ...passwords, currentPassword: value })} onToggle={() => togglePassword('current')} />
          </label>
          <label>Mật khẩu mới
            <PasswordField id="newPasswordInput" shown={shownPasswords.next} autoComplete="new-password" minLength={6} value={passwords.newPassword} onChange={(value) => setPasswords({ ...passwords, newPassword: value })} onToggle={() => togglePassword('next')} />
            <small>Tối thiểu 6 ký tự, không bắt buộc chữ hoa hoặc ký tự đặc biệt.</small>
          </label>
          <label>Xác nhận mật khẩu mới
            <PasswordField id="confirmPasswordInput" shown={shownPasswords.confirm} autoComplete="new-password" minLength={6} value={passwords.confirmPassword} onChange={(value) => setPasswords({ ...passwords, confirmPassword: value })} onToggle={() => togglePassword('confirm')} />
          </label>
        </div>
        <button type="button" className="primary account-submit-btn" id="changePasswordBtn" disabled={busy === 'password'} onClick={changePassword}>{busy === 'password' ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
      </article>

      {isAdmin && <article className="info-card account-management-card">
        <div className="settings-card-header">
          <div><h2>Quản lý tài khoản</h2></div>
          <IconButton icon="refresh" label="Làm mới danh sách tài khoản" busy={loadingUsers} onClick={() => void loadUsers()} />
        </div>
        <details className="account-create-disclosure">
          <summary>Thêm tài khoản</summary>
          <div className="account-create-grid">
            <label>Tên đăng nhập<input type="text" id="newAccountUsername" autoComplete="off" placeholder="vidu: codong01" value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value })} /></label>
            <label>Tên hiển thị<input type="text" id="newAccountDisplayName" autoComplete="name" placeholder="Nguyễn Văn A" value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} /></label>
            <label>Vai trò<select id="newAccountRole" value={newAccount.role} onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value as AppRole })}><option value="shareholder">Cổ đông (chỉ xem)</option><option value="operator">Nhân viên vận hành</option><option value="admin">Quản trị viên</option></select></label>
            <label>Mật khẩu ban đầu (tùy chọn)<PasswordField id="newAccountPassword" shown={shownPasswords.create} autoComplete="new-password" minLength={6} placeholder="Tối thiểu 6 ký tự" value={newAccount.password} onChange={(value) => setNewAccount({ ...newAccount, password: value })} onToggle={() => togglePassword('create')} /></label>
            <button type="button" className="primary" id="createAccountBtn" disabled={busy === 'create'} onClick={createUser}>{busy === 'create' ? 'Đang tạo...' : 'Tạo tài khoản'}</button>
          </div>
        </details>

        {temporaryPassword && <div id="temporaryPasswordBox" className="temporary-password-box" role="status">
          <span>Mật khẩu tạm của <strong id="temporaryPasswordAccount">{temporaryPassword.username}</strong></span>
          <code id="temporaryPasswordValue">{temporaryPassword.value}</code>
          <IconButton icon="copy" label="Sao chép mật khẩu tạm" onClick={() => void copyTemporaryPassword()} />
        </div>}

        <div className="table-wrap account-users-wrap" tabIndex={0} aria-label="Danh sách tài khoản">
          <table className="report-table account-users-table"><thead><tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody id="accountUsersBody">{loadingUsers ? <tr><td colSpan={5} className="account-table-message">Đang tải tài khoản...</td></tr> : users.length ? users.map((account) => {
              const draft = drafts[account.user_id] || { displayName: account.display_name, role: account.role, active: account.active };
              return <tr key={account.user_id}><td data-label="Tên đăng nhập"><strong>{account.username}</strong></td><td data-label="Tên hiển thị"><input className="account-inline-input" aria-label={`Tên hiển thị của ${account.username}`} value={draft.displayName} onChange={(event) => updateDraft(account.user_id, { displayName: event.target.value })} /></td><td data-label="Vai trò"><select className="account-inline-input" aria-label={`Vai trò của ${account.username}`} value={draft.role} onChange={(event) => updateDraft(account.user_id, { role: event.target.value as AppRole })}><option value="admin">Quản trị viên</option><option value="operator">Nhân viên vận hành</option><option value="shareholder">Cổ đông (chỉ xem)</option></select></td><td data-label="Trạng thái"><div className="account-active-toggle"><span>{draft.active ? 'Đang dùng' : 'Đã khóa'}</span><PillSwitch checked={draft.active} disabled={Boolean(busy)} label={`${draft.active ? 'Khóa' : 'Mở'} tài khoản ${account.username}`} onChange={(active) => updateDraft(account.user_id, { active })} /></div></td><td data-label="Thao tác" className="account-row-actions"><IconButton icon="save" label={`Lưu tài khoản ${account.username}`} busy={busy === `save:${account.user_id}`} onClick={() => void saveUser(account)} /><IconButton icon="key" label={`Đặt lại mật khẩu tài khoản ${account.username}`} busy={busy === `reset:${account.user_id}`} onClick={() => void resetPassword(account)} />{account.user_id !== user.id ? <IconButton icon="delete" className="account-delete-button" label={`Xóa tài khoản ${account.username}`} busy={busy === `delete:${account.user_id}`} onClick={() => void deleteUser(account)} /> : null}</td></tr>;
            }) : <tr><td colSpan={5} className="account-table-message">Chưa có tài khoản.</td></tr>}</tbody>
          </table>
        </div>
      </article>}
      <div id="accountSettingsStatus" className={`account-settings-status${message ? error ? ' error' : ' success' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{message}</div>
    </div>

    {user.role !== 'shareholder' ? <div id="settings-panel-sync" className="settings-tab-panel settings-grid" role="tabpanel" aria-labelledby="settings-tab-sync" hidden={activeTab !== 'sync'}>
      <article className="info-card settings-sync-card"><div><h2>Đồng bộ dữ liệu</h2><p>Theo dõi trạng thái cache, hàng đợi và lần đồng bộ gần nhất.</p></div><Link className="ghost icon-text-btn settings-route-link" href="/observability" prefetch={false}><SettingsIcon icon="sync" />Mở trạng thái đồng bộ</Link></article>
    </div> : null}
  </section>;
}

function PasswordField({ id, shown, value, onChange, onToggle, autoComplete, minLength, placeholder }: {
  id: string;
  shown: boolean;
  value: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  autoComplete: string;
  minLength?: number;
  placeholder?: string;
}) {
  const label = shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
  return <span className="password-field"><input type={shown ? 'text' : 'password'} id={id} autoComplete={autoComplete} minLength={minLength} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /><button type="button" className="ghost icon-button settings-icon-button password-toggle-btn" onClick={onToggle} aria-label={label} title={label}><SettingsIcon icon={shown ? 'eyeOff' : 'eye'} /></button></span>;
}

function IconButton({ icon, label, onClick, busy = false, className = '' }: { icon: 'refresh' | 'copy' | 'save' | 'key' | 'delete'; label: string; onClick: () => void; busy?: boolean; className?: string }) {
  return <button type="button" className={`ghost icon-button settings-icon-button ${className}`.trim()} aria-label={label} title={label} disabled={busy} onClick={onClick}><SettingsIcon icon={busy ? 'loading' : icon} /></button>;
}

function SettingsIcon({ icon }: { icon: 'eye' | 'eyeOff' | 'refresh' | 'copy' | 'save' | 'key' | 'delete' | 'sync' | 'loading' }) {
  const common = { className: `btn-svg${icon === 'loading' ? ' spinning' : ''}`, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  if (icon === 'eye') return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>;
  if (icon === 'eyeOff') return <svg {...common}><path d="M3 3l18 18"/><path d="M10.6 6.1A11 11 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a10 10 0 0 0 3-.4"/></svg>;
  if (icon === 'refresh' || icon === 'sync' || icon === 'loading') return <svg {...common}><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>;
  if (icon === 'copy') return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>;
  if (icon === 'save') return <svg {...common}><path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>;
  if (icon === 'delete') return <svg {...common}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>;
  return <svg {...common}><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 3h3v3M12 11l2 2"/></svg>;
}
