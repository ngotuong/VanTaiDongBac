'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

type LoginGateProps = { supabaseUrl: string; anonKey: string };

function friendlyLoginError(status: number, message: string) {
  if (status === 400 || status === 401) return 'Tên đăng nhập hoặc mật khẩu không đúng.';
  return message || 'Không thể đăng nhập. Vui lòng thử lại.';
}

export function LoginGate({ supabaseUrl, anonKey }: LoginGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);

  useEffect(() => {
    let active = true;
    async function recoverSession() {
      try {
        const response = await fetch('/api/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && result.ok !== false) {
          window.location.reload();
          return;
        }
        if (response.status >= 500) setStatus(result.error || 'Không thể khôi phục phiên. Bạn vẫn có thể đăng nhập lại.');
      } catch {
        if (active) setStatus('Không thể khôi phục phiên. Bạn vẫn có thể đăng nhập lại.');
      }
      if (active) setRecovering(false);
    }
    recoverSession();
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(normalized)) return setStatus('Tên đăng nhập không hợp lệ.');
    if (!password) return setStatus('Vui lòng nhập mật khẩu.');
    if (!supabaseUrl || !anonKey) return setStatus('Supabase Auth chưa được cấu hình trên frontend.');
    setBusy(true);
    setStatus('Đang xác thực...');
    try {
      const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${normalized}@dongbac.internal`, password })
      });
      const session = await authResponse.json().catch(() => ({}));
      if (!authResponse.ok || !session.access_token || !session.refresh_token) {
        throw Object.assign(new Error(session.error_description || session.msg || ''), { status: authResponse.status });
      }
      const cookieResponse = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-VTDB-CSRF': 'session' },
        body: JSON.stringify({ session: { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in } })
      });
      const cookieResult = await cookieResponse.json().catch(() => ({}));
      if (!cookieResponse.ok || cookieResult.ok === false) throw Object.assign(new Error(cookieResult.error || ''), { status: cookieResponse.status });
      try { localStorage.setItem('dongbac_auth_username', normalized); } catch {}
      window.location.replace('/');
    } catch (error) {
      const failure = error as Error & { status?: number };
      setStatus(friendlyLoginError(failure.status || 0, failure.message));
      setBusy(false);
    }
  }

  if (recovering) return <main className="auth-gate">
    <section className="auth-card" aria-labelledby="authRecoveryTitle" aria-busy="true">
      <Image className="auth-logo" src="/static/assets/apple-touch-icon.png" alt="Logo Vận tải Đông Bắc" width={80} height={80} priority />
      <div className="eyebrow">HỆ THỐNG NỘI BỘ</div>
      <h1 id="authRecoveryTitle">Đang khôi phục phiên</h1>
      <p>Vui lòng chờ trong giây lát…</p>
    </section>
  </main>;

  return <main className="auth-gate">
    <section className="auth-card" aria-labelledby="authTitle">
      <Image className="auth-logo" src="/static/assets/apple-touch-icon.png" alt="Logo Vận tải Đông Bắc" width={80} height={80} priority />
      <div className="eyebrow">HỆ THỐNG NỘI BỘ</div>
      <h1 id="authTitle">Đăng nhập Đông Bắc</h1>
      <p>Dùng tài khoản nội bộ đã được cấp quyền để truy cập hệ thống.</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="authUsername">Tên đăng nhập</label>
        <input id="authUsername" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} autoFocus />
        <label htmlFor="authPassword">Mật khẩu</label>
        <input id="authPassword" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        <p className="auth-remember-note">Ứng dụng sẽ ghi nhớ tên đăng nhập và duy trì phiên an toàn trên thiết bị này. Bạn có thể cho phép trình duyệt lưu mật khẩu để tự điền lần sau.</p>
        <div className="auth-status" role="alert" aria-live="polite">{status}</div>
        <button type="submit" className="primary auth-button" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </section>
  </main>;
}

export function SessionKeepAlive() {
  useEffect(() => {
    let active = true;
    let lastAttemptAt = Date.now();
    async function refreshIfNeeded() {
      if (!active) return;
      lastAttemptAt = Date.now();
      try {
        const response = await fetch('/api/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
        if (active && (response.status === 401 || response.status === 403)) window.location.reload();
      } catch {}
    }
    refreshIfNeeded();
    const interval = window.setInterval(refreshIfNeeded, 40 * 60 * 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAttemptAt >= 40 * 60 * 1000) refreshIfNeeded();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  return null;
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin', headers: { 'X-VTDB-CSRF': 'session' } }).catch(() => null);
    window.location.replace('/');
  }
  return <button type="button" className="ghost" onClick={signOut} disabled={busy}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>;
}
