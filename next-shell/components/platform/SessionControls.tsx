'use client';

import { useState } from 'react';

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

  return <main className="platform-auth-shell">
    <section className="platform-auth-card" aria-labelledby="platform-auth-title">
      <div className="platform-auth-brand" aria-hidden="true">ĐB</div>
      <p className="platform-eyebrow">NỀN TẢNG NỘI BỘ</p>
      <h1 id="platform-auth-title">Đăng nhập Đông Bắc</h1>
      <p className="platform-auth-copy">Sử dụng tài khoản nội bộ để truy cập Vận tải và Thu chi.</p>
      <form onSubmit={submit} className="platform-auth-form">
        <label htmlFor="platform-auth-username">Tên đăng nhập</label>
        <input id="platform-auth-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} autoFocus />
        <label htmlFor="platform-auth-password">Mật khẩu</label>
        <input id="platform-auth-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        <button type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <p className="platform-auth-status" role="status" aria-live="polite">{status}</p>
    </section>
  </main>;
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin', headers: { 'X-VTDB-CSRF': 'session' } }).catch(() => null);
    window.location.replace('/');
  }
  return <button type="button" className="platform-signout" onClick={signOut} disabled={busy}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>;
}
