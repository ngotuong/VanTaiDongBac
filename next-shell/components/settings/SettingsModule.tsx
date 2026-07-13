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
const EMPTY_ACCOUNT: NewAccount = { username: '', displayName: '', role: 'shareholder', password: '' };

export function SettingsModule() {
  const { user } = useWorkbookContext();
  const api = useMemo(() => createClientApiClient(), []);
  const isAdmin = user.role === 'admin';
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [newAccount, setNewAccount] = useState<NewAccount>(EMPTY_ACCOUNT);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccountDraft>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{ username: string; value: string } | null>(null);

  const report = (value: string, isError = false) => { setMessage(value); setError(isError); };
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
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return report('Tên đăng nhập phải dài 3–40 ký tự và chỉ dùng chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.', true);
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
      report(`Đã cập nhật tài khoản ${account.username}.`);
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

  return <section className="b7-module">
    <header className="b7-header">
      <div><p className="platform-eyebrow">CÀI ĐẶT</p><h1>Tài khoản</h1><p>Đổi mật khẩu cá nhân và quản lý quyền truy cập theo vai trò.</p></div>
      {user.role !== 'shareholder' ? <Link className="b7-header-link" href="/observability" prefetch={false}>Trạng thái đồng bộ</Link> : null}
    </header>
    <p className={`b7-message${error ? ' error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p>

    <section className="b7-card" aria-labelledby="password-title">
      <div className="b7-card-head"><div><h2 id="password-title">Đổi mật khẩu</h2><p>{user.displayName} · {ROLE_LABELS[user.role]}</p></div></div>
      <div className="b7-form-grid password-grid">
        <label>Mật khẩu hiện tại<input type={showPasswords ? 'text' : 'password'} autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
        <label>Mật khẩu mới<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /><small>Tối thiểu 6 ký tự và phải khác mật khẩu hiện tại.</small></label>
        <label>Xác nhận mật khẩu mới<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} /></label>
      </div>
      <div className="b7-form-actions">
        <label className="b7-checkbox"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} /> Hiện mật khẩu</label>
        <button type="button" className="b7-primary" disabled={busy === 'password'} onClick={changePassword}>{busy === 'password' ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
      </div>
    </section>

    {isAdmin && <section className="b7-card" aria-labelledby="accounts-title">
      <div className="b7-card-head"><div><h2 id="accounts-title">Quản lý tài khoản</h2><p>Chỉ quản trị viên được tạo, đổi vai trò, khóa hoặc đặt lại mật khẩu.</p></div><button type="button" disabled={loadingUsers} onClick={loadUsers}>{loadingUsers ? 'Đang tải…' : 'Làm mới'}</button></div>
      <div className="b7-form-grid account-create-grid">
        <label>Tên đăng nhập<input autoComplete="off" value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value })} placeholder="vidu: codong01" /></label>
        <label>Tên hiển thị<input autoComplete="name" value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} /></label>
        <label>Vai trò<select value={newAccount.role} onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value as AppRole })}>{Object.entries(ROLE_LABELS).reverse().map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Mật khẩu ban đầu (tùy chọn)<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={newAccount.password} onChange={(event) => setNewAccount({ ...newAccount, password: event.target.value })} placeholder="Để trống để tự sinh" /></label>
        <div className="b7-create-action"><button type="button" className="b7-primary" disabled={busy === 'create'} onClick={createUser}>{busy === 'create' ? 'Đang tạo…' : 'Tạo tài khoản'}</button></div>
      </div>

      {temporaryPassword && <div className="b7-temporary" role="status"><div><strong>Mật khẩu tạm của {temporaryPassword.username}</strong><p>Chỉ hiển thị trong phiên này. Hãy chuyển cho người dùng qua kênh an toàn.</p></div><code>{temporaryPassword.value}</code><button type="button" onClick={copyTemporaryPassword}>Sao chép</button><button type="button" onClick={() => setTemporaryPassword(null)}>Ẩn</button></div>}

      <div className="b7-table-wrap" tabIndex={0} aria-label="Danh sách tài khoản">
        <table><thead><tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{loadingUsers ? <tr><td colSpan={5} className="b7-empty">Đang tải tài khoản…</td></tr> : users.length ? users.map((account) => {
            const draft = drafts[account.user_id] || { displayName: account.display_name, role: account.role, active: account.active };
            return <tr key={account.user_id}><td><strong>{account.username}</strong></td><td><input aria-label={`Tên hiển thị của ${account.username}`} value={draft.displayName} onChange={(event) => updateDraft(account.user_id, { displayName: event.target.value })} /></td><td><select aria-label={`Vai trò của ${account.username}`} value={draft.role} onChange={(event) => updateDraft(account.user_id, { role: event.target.value as AppRole })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><label className="b7-checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft(account.user_id, { active: event.target.checked })} />{draft.active ? 'Đang dùng' : 'Đã khóa'}</label></td><td><div className="b7-row-actions"><button type="button" disabled={busy === `save:${account.user_id}`} onClick={() => saveUser(account)}>Lưu</button><button type="button" disabled={busy === `reset:${account.user_id}`} onClick={() => resetPassword(account)}>Đặt lại MK</button></div></td></tr>;
          }) : <tr><td colSpan={5} className="b7-empty">Chưa có tài khoản.</td></tr>}</tbody>
        </table>
      </div>
    </section>}
  </section>;
}
