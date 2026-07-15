'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import type { AccountUser } from '../../lib/platform/operations-types';
import type { AppRole } from '../../lib/platform/types';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Quản trị viên',
  operator: 'Nhân viên vận hành',
  shareholder: 'Cổ đông (chỉ xem)'
};

type AccountDraft = { displayName: string; role: AppRole; active: boolean };
type NewAccount = { username: string; displayName: string; role: AppRole; password: string };
type PasswordKey = 'current' | 'next' | 'confirm' | 'create';
const EMPTY_ACCOUNT: NewAccount = { username: '', displayName: '', role: 'shareholder', password: '' };

export function SettingsModule() {
  const { user } = useWorkbookContext();
  const api = useMemo(() => createClientApiClient(), []);
  const isAdmin = user.role === 'admin';
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

  const report = (value: string, isError = false) => { setMessage(value); setError(isError); };
  const togglePassword = (key: PasswordKey) => setShownPasswords((current) => ({ ...current, [key]: !current[key] }));
  const loadUsers = async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const result = await api.get<{ users?: AccountUser[] }>('listUsers');
      const nextUsers = result.users || [];
      setUsers(nextUsers);
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
    if (!isAdmin) return;
    const timer = window.setTimeout(() => { void loadUsers(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const updateDraft = (id: string, patch: Partial<AccountDraft>) => setDrafts((current) => ({
    ...current, [id]: { ...current[id], ...patch }
  }));

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword?.value) return;
    try { await navigator.clipboard.writeText(temporaryPassword.value); report('Đã sao chép mật khẩu tạm.'); }
    catch { report('Không thể tự sao chép. Hãy chọn và sao chép thủ công.', true); }
  };

  return <section id="settingsView" className="view active settings-c2">
    {user.role !== 'shareholder' ? <div className="settings-route-actions"><Link className="ghost icon-text-btn settings-route-link" href="/observability" prefetch={false}>Trạng thái đồng bộ</Link></div> : null}
    <div className="settings-grid">
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
          <div><h2>Quản lý tài khoản</h2><p>Tạo tài khoản và chọn quyền truy cập phù hợp.</p></div>
          <button type="button" className="ghost" disabled={loadingUsers} onClick={loadUsers}>{loadingUsers ? 'Đang tải...' : 'Làm mới'}</button>
        </div>
        <div className="account-create-grid">
          <label>Tên đăng nhập<input type="text" id="newAccountUsername" autoComplete="off" placeholder="vidu: codong01" value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value })} /></label>
          <label>Tên hiển thị<input type="text" id="newAccountDisplayName" autoComplete="name" placeholder="Nguyễn Văn A" value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} /></label>
          <label>Vai trò<select id="newAccountRole" value={newAccount.role} onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value as AppRole })}><option value="shareholder">Cổ đông (chỉ xem)</option><option value="operator">Nhân viên vận hành</option><option value="admin">Quản trị viên</option></select></label>
          <label>Mật khẩu ban đầu (tùy chọn)<PasswordField id="newAccountPassword" shown={shownPasswords.create} autoComplete="new-password" minLength={6} placeholder="Tối thiểu 6 ký tự" value={newAccount.password} onChange={(value) => setNewAccount({ ...newAccount, password: value })} onToggle={() => togglePassword('create')} /></label>
          <button type="button" className="primary" id="createAccountBtn" disabled={busy === 'create'} onClick={createUser}>{busy === 'create' ? 'Đang tạo...' : 'Tạo tài khoản'}</button>
        </div>

        {temporaryPassword && <div id="temporaryPasswordBox" className="temporary-password-box" role="status">
          <span>Mật khẩu tạm của <strong id="temporaryPasswordAccount">{temporaryPassword.username}</strong></span>
          <code id="temporaryPasswordValue">{temporaryPassword.value}</code>
          <button type="button" className="ghost" onClick={copyTemporaryPassword}>Sao chép</button>
        </div>}

        <div className="table-wrap account-users-wrap" tabIndex={0} aria-label="Danh sách tài khoản">
          <table className="report-table account-users-table"><thead><tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody id="accountUsersBody">{loadingUsers ? <tr><td colSpan={5} className="account-table-message">Đang tải tài khoản...</td></tr> : users.length ? users.map((account) => {
              const draft = drafts[account.user_id] || { displayName: account.display_name, role: account.role, active: account.active };
              return <tr key={account.user_id}><td><strong>{account.username}</strong></td><td><input className="account-inline-input" aria-label={`Tên hiển thị của ${account.username}`} value={draft.displayName} onChange={(event) => updateDraft(account.user_id, { displayName: event.target.value })} /></td><td><select className="account-inline-input" aria-label={`Vai trò của ${account.username}`} value={draft.role} onChange={(event) => updateDraft(account.user_id, { role: event.target.value as AppRole })}><option value="admin">Quản trị viên</option><option value="operator">Nhân viên vận hành</option><option value="shareholder">Cổ đông (chỉ xem)</option></select></td><td><label className="account-active-toggle"><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft(account.user_id, { active: event.target.checked })} /> <span>{draft.active ? 'Đang dùng' : 'Đã khóa'}</span></label></td><td className="account-row-actions"><button type="button" className="ghost" disabled={busy === `save:${account.user_id}`} onClick={() => saveUser(account)}>Lưu</button><button type="button" className="ghost" disabled={busy === `reset:${account.user_id}`} onClick={() => resetPassword(account)}>Đặt lại MK</button></td></tr>;
            }) : <tr><td colSpan={5} className="account-table-message">Chưa có tài khoản.</td></tr>}</tbody>
          </table>
        </div>
      </article>}
      <div id="accountSettingsStatus" className={`account-settings-status${message ? error ? ' error' : ' success' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{message}</div>
    </div>
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
  return <span className="password-field"><input type={shown ? 'text' : 'password'} id={id} autoComplete={autoComplete} minLength={minLength} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /><button type="button" className="ghost password-toggle-btn" onClick={onToggle} aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{shown ? 'Ẩn' : 'Hiện'}</button></span>;
}
