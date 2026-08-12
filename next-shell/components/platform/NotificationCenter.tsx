'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { createClientApiClient } from '../../lib/platform/client-api-client';

type NotificationItem = {
  id: string;
  type: 'reconciliation' | 'hot-bonus' | 'attendance' | 'driver-assignment' | 'fund-low-balance' | 'sync-stale' | 'sync-failure' | 'write-failure';
  notificationKey?: 'trip-reconciliation' | 'fund-low-balance' | 'operations-integrity' | 'system-health';
  severity: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  date: string;
  plate?: string;
  project?: string;
  amount?: number;
  excessTrips?: number;
  threshold?: number;
  url?: string;
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
const READ_STORAGE_VERSION = 'v1';
const EMPTY_ITEMS: NotificationItem[] = [];

type NotificationView = 'all' | 'unread';
type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

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

function notificationKey(item: NotificationItem) {
  return [item.id, item.type, item.title, item.message, item.amount || 0, item.excessTrips || 0].join('|');
}

async function updateAppBadge(count: number) {
  const badgeNavigator = window.navigator as BadgeNavigator;
  try {
    if (count > 0 && badgeNavigator.setAppBadge) await badgeNavigator.setAppBadge(count);
    if (count <= 0 && badgeNavigator.clearAppBadge) await badgeNavigator.clearAppBadge();
  } catch {
    // The in-app badge remains available when the platform or permission blocks OS badging.
  }
  try {
    const registration = await window.navigator.serviceWorker?.getRegistration();
    registration?.active?.postMessage({ type: 'SET_APP_BADGE', count });
  } catch {
    // Service-worker badge sync is a best-effort fallback.
  }
}

export function NotificationCenter({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<NotificationResponse>({ items: [], count: 0 });
  const [view, setView] = useState<NotificationView>('all');
  const [readKeys, setReadKeys] = useState<Set<string>>(() => new Set());
  const [readHydrated, setReadHydrated] = useState(false);
  const [anchor, setAnchor] = useState({ top: 72, right: 16 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const storageKey = `vtdb:notification-read:${READ_STORAGE_VERSION}:${userId}`;

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
    const hydrate = () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
        setReadKeys(new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : []));
      } catch {
        setReadKeys(new Set());
      } finally {
        setReadHydrated(true);
      }
    };
    const timer = window.setTimeout(hydrate, 0);
    const syncTabs = (event: StorageEvent) => {
      if (event.key === storageKey) hydrate();
    };
    window.addEventListener('storage', syncTabs);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', syncTabs);
    };
  }, [storageKey]);

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

  const items = data.items || EMPTY_ITEMS;
  const unreadItems = readHydrated ? items.filter((item) => !readKeys.has(notificationKey(item))) : [];
  const unreadCount = unreadItems.length;
  const visibleItems = view === 'unread' ? unreadItems : items;

  useEffect(() => {
    if (!readHydrated || !loaded) return;
    const activeKeys = new Set(items.map(notificationKey));
    const retainedKeys = [...readKeys].filter((key) => activeKeys.has(key));
    try { window.localStorage.setItem(storageKey, JSON.stringify(retainedKeys)); } catch {}
  }, [items, loaded, readHydrated, readKeys, storageKey]);

  useEffect(() => {
    if (!readHydrated || !loaded) return;
    void updateAppBadge(unreadCount);
  }, [loaded, readHydrated, unreadCount]);

  const markRead = (item: NotificationItem) => {
    const key = notificationKey(item);
    setReadKeys((current) => current.has(key) ? current : new Set([...current, key]));
  };
  const markAllRead = () => setReadKeys(new Set(items.map(notificationKey)));
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
      aria-label={unreadCount ? `Mở thông báo, có ${unreadCount} thông báo chưa đọc` : 'Mở thông báo'}
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
      {unreadCount > 0 ? <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
    </button>
    {open ? <BodyPortal>
      <button type="button" className="notification-backdrop" aria-label="Đóng thông báo" onClick={close}/>
      <section id="platform-notification-panel" className="notification-panel" style={panelStyle} role="dialog" aria-modal="true" aria-labelledby="notification-panel-title">
        <header className="notification-panel-header">
          <div><h2 id="notification-panel-title">Thông báo</h2><p>{unreadCount} chưa đọc · {syncLabel(data.syncedAt)}</p></div>
          <button ref={closeRef} type="button" className="notification-close" aria-label="Đóng thông báo" onClick={close}>×</button>
        </header>
        <div className="notification-panel-toolbar" aria-label="Bộ lọc thông báo">
          <div className="notification-view-switch">
            <button type="button" className={view === 'all' ? 'active' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>Xem tất cả <span>{items.length}</span></button>
            <button type="button" className={view === 'unread' ? 'active' : ''} aria-pressed={view === 'unread'} onClick={() => setView('unread')}>Chưa đọc <span>{unreadCount}</span></button>
          </div>
          <button type="button" className="notification-mark-all" disabled={!unreadCount} onClick={markAllRead}>Đánh dấu tất cả đã đọc</button>
        </div>
        <div className="notification-panel-body" aria-live="polite">
          {loading && !loaded ? <div className="notification-state"><span className="notification-spinner" aria-hidden="true"/>Đang tải thông báo…</div> : null}
          {error ? <div className="notification-state notification-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(true)}>Thử lại</button></div> : null}
          {!loading && !error && !items.length ? <div className="notification-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg><strong>Không có cảnh báo mới</strong><span>Đối soát, vận hành, Quỹ và đồng bộ hệ thống đang ổn.</span></div> : null}
          {!loading && !error && items.length > 0 && !visibleItems.length ? <div className="notification-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg><strong>Đã xem tất cả thông báo</strong><span>Chọn “Xem tất cả” để xem lại lịch sử đang hoạt động.</span></div> : null}
          {visibleItems.length ? <ul className="notification-list">{visibleItems.map((item) => {
            const unread = !readKeys.has(notificationKey(item));
            return <li className={`notification-item ${item.severity}${unread ? ' unread' : ' read'}`} key={notificationKey(item)}>
              <button type="button" className="notification-item-action" aria-label={`${unread ? 'Đánh dấu đã đọc' : 'Đã đọc'}: ${item.title}`} onClick={() => markRead(item)}>
                <span className="notification-item-icon" aria-hidden="true">{item.type === 'hot-bonus' || item.type === 'fund-low-balance' ? '₫' : '!'}</span>
                <div><div className="notification-item-heading"><strong>{item.title}</strong><time dateTime={item.date}>{dateLabel(item.date)}</time></div><p>{item.message}</p>{item.type === 'hot-bonus' ? <div className="notification-item-meta"><span>{Number(item.excessTrips || 0)} chuyến vượt</span><strong>{money(item.amount)} đ</strong></div> : null}</div>
                {unread ? <span className="notification-unread-dot" aria-hidden="true"/> : null}
              </button>
            </li>;
          })}</ul> : null}
        </div>
        <footer className="notification-panel-footer"><span>{items.length} thông báo đang hoạt động</span><button type="button" disabled={loading} onClick={() => void load(true)}>{loading ? 'Đang tải…' : 'Làm mới'}</button></footer>
      </section>
    </BodyPortal> : null}
  </div>;
}
