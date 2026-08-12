'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { createClientApiClient } from '../../lib/platform/client-api-client';

type NotificationItem = {
  id: string;
  type: 'reconciliation' | 'hot-bonus';
  severity: 'warning' | 'success';
  title: string;
  message: string;
  date: string;
  plate?: string;
  project?: string;
  amount?: number;
  excessTrips?: number;
};

type NotificationResponse = {
  ok?: boolean;
  error?: string;
  count?: number;
  items?: NotificationItem[];
  syncedAt?: string | null;
  lookbackDays?: number;
};

const api = createClientApiClient();

function BodyPortal({ children }: { children: React.ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body);
}

function dateLabel(value?: string) {
  if (!value) return '';
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function money(value?: number) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function syncLabel(value?: string | null) {
  if (!value) return 'Chưa có dữ liệu đồng bộ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Đã đồng bộ';
  return `Cập nhật ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString('vi-VN')}`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<NotificationResponse>({ items: [], count: 0 });
  const [anchor, setAnchor] = useState({ top: 72, right: 16 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (force = false) => {
    if (loading || (loaded && !force)) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.get<NotificationResponse>('getNotifications');
      if (result.ok === false) throw new Error(result.error || 'Không tải được thông báo.');
      setData({ ...result, items: Array.isArray(result.items) ? result.items : [] });
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 900);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const items = data.items || [];
  const count = Number(data.count ?? items.length);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const panelStyle = {
    '--notification-anchor-top': `${anchor.top}px`,
    '--notification-anchor-right': `${anchor.right}px`
  } as CSSProperties;

  return <div className={`notification-center${open ? ' open' : ''}`}>
    <button
      ref={buttonRef}
      type="button"
      className="ghost icon-button notification-trigger"
      aria-label={count ? `Mở thông báo, có ${count} cảnh báo` : 'Mở thông báo'}
      aria-expanded={open}
      aria-controls="platform-notification-panel"
      title="Thông báo"
      onClick={() => {
        const nextOpen = !open;
        if (nextOpen && buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          setAnchor({ top: Math.round(rect.bottom + 10), right: Math.max(16, Math.round(window.innerWidth - rect.right)) });
        }
        setOpen(nextOpen);
        if (nextOpen) void load();
      }}
    >
      <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      {count > 0 ? <span className="notification-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null}
    </button>
    {open ? <BodyPortal>
      <button type="button" className="notification-backdrop" aria-label="Đóng thông báo" onClick={close}/>
      <section id="platform-notification-panel" className="notification-panel" style={panelStyle} role="dialog" aria-modal="true" aria-labelledby="notification-panel-title">
        <header className="notification-panel-header">
          <div><h2 id="notification-panel-title">Thông báo</h2><p>{syncLabel(data.syncedAt)}</p></div>
          <button ref={closeRef} type="button" className="notification-close" aria-label="Đóng thông báo" onClick={close}>×</button>
        </header>
        <div className="notification-panel-body" aria-live="polite">
          {loading && !loaded ? <div className="notification-state"><span className="notification-spinner" aria-hidden="true"/>Đang tải thông báo…</div> : null}
          {error ? <div className="notification-state notification-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(true)}>Thử lại</button></div> : null}
          {!loading && !error && !items.length ? <div className="notification-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg><strong>Không có cảnh báo mới</strong><span>Dữ liệu đối soát {data.lookbackDays || 45} ngày gần đây đang ổn.</span></div> : null}
          {items.length ? <ul className="notification-list">{items.map((item) => <li className={`notification-item ${item.severity}`} key={item.id}>
            <span className="notification-item-icon" aria-hidden="true">{item.type === 'hot-bonus' ? '₫' : '!'}</span>
            <div><div className="notification-item-heading"><strong>{item.title}</strong><time dateTime={item.date}>{dateLabel(item.date)}</time></div><p>{item.message}</p>{item.type === 'hot-bonus' ? <div className="notification-item-meta"><span>{Number(item.excessTrips || 0)} chuyến vượt</span><strong>{money(item.amount)} đ</strong></div> : null}</div>
          </li>)}</ul> : null}
        </div>
        <footer className="notification-panel-footer"><span>Nguồn: XL_DoiSoatChuyen</span><button type="button" disabled={loading} onClick={() => void load(true)}>{loading ? 'Đang tải…' : 'Làm mới'}</button></footer>
      </section>
    </BodyPortal> : null}
  </div>;
}
