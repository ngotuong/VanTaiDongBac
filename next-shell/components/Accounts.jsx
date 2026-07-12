'use client';
import React from 'react';

export default function Accounts({ bridge, identity = '', isAdmin = false }) {
  const call = (name, ...args) => bridge && typeof bridge[name] === 'function' ? bridge[name](...args) : undefined;
  return <div className="settings-grid" data-react-accounts-root="true" style={{ display: 'contents' }}>
    <article className="info-card account-password-card">
      <h2>Đổi mật khẩu</h2><p id="currentAccountIdentity" className="account-card-note">{identity}</p>
      <div className="account-form-grid">
        <label>Mật khẩu hiện tại<span className="password-field"><input type="password" id="currentPasswordInput" autoComplete="current-password"/><button type="button" className="ghost password-toggle-btn" onClick={(e) => call('togglePasswordVisibility','currentPasswordInput',e.currentTarget)} aria-label="Hiện mật khẩu">Hiện</button></span></label>
        <label>Mật khẩu mới<span className="password-field"><input type="password" id="newPasswordInput" autoComplete="new-password" minLength={6}/><button type="button" className="ghost password-toggle-btn" onClick={(e) => call('togglePasswordVisibility','newPasswordInput',e.currentTarget)} aria-label="Hiện mật khẩu">Hiện</button></span><small>Tối thiểu 6 ký tự, không bắt buộc chữ hoa hoặc ký tự đặc biệt.</small></label>
        <label>Xác nhận mật khẩu mới<span className="password-field"><input type="password" id="confirmPasswordInput" autoComplete="new-password" minLength={6}/><button type="button" className="ghost password-toggle-btn" onClick={(e) => call('togglePasswordVisibility','confirmPasswordInput',e.currentTarget)} aria-label="Hiện mật khẩu">Hiện</button></span></label>
      </div>
      <button type="button" className="primary account-submit-btn" id="changePasswordBtn" onClick={() => call('changeOwnPassword')}>Đổi mật khẩu</button>
    </article>
    <article className="info-card account-management-card" data-admin-only="true" hidden={!isAdmin}>
      <div className="settings-card-header"><div><h2>Quản lý tài khoản</h2><p>Tạo tài khoản và chọn quyền truy cập phù hợp.</p></div><button type="button" className="ghost" onClick={() => call('loadUsers')}>Làm mới</button></div>
      <div className="account-create-grid">
        <label>Tên đăng nhập<input type="text" id="newAccountUsername" autoComplete="off" placeholder="vidu: codong01"/></label>
        <label>Tên hiển thị<input type="text" id="newAccountDisplayName" autoComplete="name" placeholder="Nguyễn Văn A"/></label>
        <label>Vai trò<select id="newAccountRole" defaultValue="shareholder"><option value="shareholder">Cổ đông (chỉ xem)</option><option value="operator">Nhân viên vận hành</option><option value="admin">Quản trị viên</option></select></label>
        <label>Mật khẩu ban đầu (tùy chọn)<span className="password-field"><input type="password" id="newAccountPassword" autoComplete="new-password" minLength={6} placeholder="Tối thiểu 6 ký tự"/><button type="button" className="ghost password-toggle-btn" onClick={(e) => call('togglePasswordVisibility','newAccountPassword',e.currentTarget)} aria-label="Hiện mật khẩu">Hiện</button></span></label>
        <button type="button" className="primary" id="createAccountBtn" onClick={() => call('createUserAccount')}>Tạo tài khoản</button>
      </div>
      <div id="temporaryPasswordBox" className="temporary-password-box" hidden><span>Mật khẩu tạm của <strong id="temporaryPasswordAccount"></strong></span><code id="temporaryPasswordValue"></code><button type="button" className="ghost" onClick={() => call('copyTemporaryPassword')}>Sao chép</button></div>
      <div className="table-wrap account-users-wrap"><table className="report-table account-users-table"><thead><tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="accountUsersBody"><tr><td colSpan={5} className="account-table-message">Chọn Cài đặt để tải tài khoản.</td></tr></tbody></table></div>
    </article>
    <div id="accountSettingsStatus" className="account-settings-status" role="status" aria-live="polite"></div>
  </div>;
}
