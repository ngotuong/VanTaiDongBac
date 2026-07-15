'use client';

import { useEffect, useState } from 'react';
import type { ToastDetail } from '../../lib/platform/toast';

function ToastIcon({ kind }: { kind: ToastDetail['kind'] }) {
  if (kind === 'loading') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/></svg>;
  if (kind === 'error') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>;
  if (kind === 'success') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>;
  return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>;
}

export function ToastViewport() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    const receive = (event: Event) => setToast((event as CustomEvent<ToastDetail>).detail);
    window.addEventListener('vtdb:toast', receive);
    return () => window.removeEventListener('vtdb:toast', receive);
  }, []);

  useEffect(() => {
    if (!toast || toast.kind === 'loading') return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const isError = toast.kind === 'error';
  return <div className={`sync-toast platform-toast show${isError ? ' error' : ''}`} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} aria-atomic="true">
    <span className={`sync-toast-icon${toast.kind === 'loading' ? ' spinning' : ''}`}><ToastIcon kind={toast.kind}/></span>
    <span className="platform-toast-message">{toast.message}</span>
    {toast.kind !== 'loading' ? <button type="button" className="platform-toast-close" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</button> : null}
  </div>;
}
