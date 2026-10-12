'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { showToast } from '../../lib/platform/toast';

type NotificationItem = {
  id: string;
  type: 'reconciliation' | 'reconciliation-resolved' | 'reconciliation-resolved-group' | 'hot-bonus' | 'attendance' | 'driver-assignment' | 'fund-low-balance' | 'sync-stale' | 'sync-failure' | 'write-failure';
  notificationKey?: 'trip-reconciliation' | 'fund-low-balance' | 'operations-integrity' | 'system-health';
  severity: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  date: string;
  sourceDate?: string;
  plate?: string;
  project?: string;
  amount?: number;
  excessTrips?: number;
  threshold?: number;
  url?: string;
  legacyIds?: string[];
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
const READ_STORAGE_VERSION = 'v2';
const LEGACY_READ_STORAGE_VERSION = 'v1';
const READ_RETENTION_MS = 120 * 24 * 60 * 60 * 1000;
const READ_LEDGER_MAX_ITEMS = 2000;
const EMPTY_ITEMS: NotificationItem[] = [];
const COPY_LONG_PRESS_MS = 550;
const COPY_MOVE_TOLERANCE_PX = 12;
const NOTIFICATION_REVALIDATE_MS = 60 * 1000;

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
  return item.id;
}

function legacyNotificationKey(item: NotificationItem) {
  return [item.id, item.type, item.title, item.message, item.amount || 0, item.excessTrips || 0].join('|');
}

type ReadLedger = Record<string, number>;

function isNotificationRead(item: NotificationItem, readLedger: ReadLedger) {
  return Object.hasOwn(readLedger, notificationKey(item))
    || Object.hasOwn(readLedger, legacyNotificationKey(item))
    || (item.legacyIds || []).some((key) => Object.hasOwn(readLedger, key));
}

function pruneReadLedger(ledger: ReadLedger, currentTime = Date.now()) {
  const cutoff = currentTime - READ_RETENTION_MS;
  return Object.fromEntries(Object.entries(ledger)
    .filter(([, readAt]) => Number.isFinite(readAt) && readAt >= cutoff)
    .sort((left, right) => right[1] - left[1])
    .slice(0, READ_LEDGER_MAX_ITEMS));
}

function notificationClipboardText(item: NotificationItem) {
  const lines = [item.title, dateLabel(item.date), item.message];
  if (item.type === 'hot-bonus') {
    lines.push(`${Number(item.excessTrips || 0)} chuyến vượt · ${money(item.amount)} đ`);
  }
  return lines.filter(Boolean).join('\n');
}

function legacyCopyText(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto 0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = '0';
  textarea.style.opacity = '0';
  textarea.style.fontSize = '16px';
  document.body.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function writeClipboardText(value: string) {
  if (legacyCopyText(value)) return;
  if (window.navigator.clipboard?.writeText) {
    await window.navigator.clipboard.writeText(value);
    return;
  }
  throw new Error('Không thể sao chép nội dung thông báo.');
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
  const [readLedger, setReadLedger] = useState<ReadLedger>({});
  const [readHydrated, setReadHydrated] = useState(false);
  const [legacyBaselineNeeded, setLegacyBaselineNeeded] = useState(false);
  const [pressingKey, setPressingKey] = useState('');
  const [copyFallback, setCopyFallback] = useState<NotificationItem | null>(null);
  const [targetNotificationId, setTargetNotificationId] = useState('');
  const [anchor, setAnchor] = useState({ top: 72, right: 16 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pressTimerRef = useRef<number | null>(null);
  const copyFallbackRef = useRef<HTMLTextAreaElement>(null);
  const pressStateRef = useRef<{ key: string; startX: number; startY: number; triggered: boolean } | null>(null);
  const suppressClickRef = useRef('');
  const storageKey = `vtdb:notification-read:${READ_STORAGE_VERSION}:${userId}`;
  const legacyStorageKey = `vtdb:notification-read:${LEGACY_READ_STORAGE_VERSION}:${userId}`;

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

  const openFromPush = useCallback((notificationId = '') => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAnchor({ top: Math.round(rect.bottom + 10), right: Math.max(16, Math.round(window.innerWidth - rect.right)) });
    }
    setView('all');
    setTargetNotificationId(notificationId);
    setOpen(true);
    void load(true);
  }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('notifications') !== 'open') return;
    const notificationId = url.searchParams.get('notificationId') || '';
    const timer = window.setTimeout(() => openFromPush(notificationId), 0);
    url.searchParams.delete('notifications');
    url.searchParams.delete('notificationId');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return () => window.clearTimeout(timer);
  }, [openFromPush]);

  useEffect(() => {
    if (!('serviceWorker' in window.navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'OPEN_NOTIFICATION_CENTER') return;
      openFromPush(String(event.data.notificationId || ''));
    };
    window.navigator.serviceWorker.addEventListener('message', onMessage);
    void window.navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
    return () => window.navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [openFromPush]);

  useEffect(() => {
    if (!loaded) return;
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const onVisibilityChange = () => refreshVisible();
    const timer = window.setInterval(refreshVisible, NOTIFICATION_REVALIDATE_MS);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loaded, load]);

  useEffect(() => {
    const hydrate = () => {
      try {
        const storedRaw = window.localStorage.getItem(storageKey);
        const legacyRaw = window.localStorage.getItem(legacyStorageKey);
        const stored = JSON.parse(storedRaw || '{}');
        const legacy = JSON.parse(legacyRaw || '[]');
        const migratedAt = Date.now();
        const migrated = Array.isArray(legacy)
          ? Object.fromEntries(legacy.filter((value): value is string => typeof value === 'string').map((key) => [key, migratedAt]))
          : {};
        const current = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as ReadLedger : {};
        setReadLedger(pruneReadLedger({ ...migrated, ...current }, migratedAt));
        setLegacyBaselineNeeded(!storedRaw && legacyRaw !== null);
      } catch {
        setReadLedger({});
        setLegacyBaselineNeeded(false);
      } finally {
        setReadHydrated(true);
      }
    };
    const timer = window.setTimeout(hydrate, 0);
    const syncTabs = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === legacyStorageKey) hydrate();
    };
    window.addEventListener('storage', syncTabs);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', syncTabs);
    };
  }, [legacyStorageKey, storageKey]);

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
  const unreadItems = readHydrated ? items.filter((item) => !isNotificationRead(item, readLedger)) : [];
  const unreadCount = unreadItems.length;
  const visibleItems = view === 'unread' ? unreadItems : items;

  useEffect(() => {
    if (!open || !loaded || !targetNotificationId) return;
    const timer = window.setTimeout(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-notification-id]'))
        .find((element) => element.dataset.notificationId === targetNotificationId);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loaded, open, targetNotificationId, visibleItems]);

  useEffect(() => {
    if (!readHydrated || !loaded) return;
    if (!legacyBaselineNeeded) return;
    const readAt = Date.now();
    const baseline = Object.fromEntries(items.map((item) => [notificationKey(item), readAt]));
    const baselineTimer = window.setTimeout(() => {
      setReadLedger((current) => ({ ...current, ...baseline }));
      setLegacyBaselineNeeded(false);
    }, 0);
    return () => window.clearTimeout(baselineTimer);
  }, [items, legacyBaselineNeeded, loaded, readHydrated]);

  useEffect(() => {
    if (!readHydrated || !loaded || legacyBaselineNeeded) return;
    const migratedReadAt = Date.now();
    const migrated = items.reduce<ReadLedger>((ledger, item) => {
      if (!Object.hasOwn(readLedger, item.id) && isNotificationRead(item, readLedger)) ledger[item.id] = migratedReadAt;
      return ledger;
    }, {});
    if (Object.keys(migrated).length) {
      const migrationTimer = window.setTimeout(() => setReadLedger((current) => ({ ...current, ...migrated })), 0);
      return () => window.clearTimeout(migrationTimer);
    }
  }, [items, legacyBaselineNeeded, loaded, readHydrated, readLedger]);

  useEffect(() => {
    if (!readHydrated || !loaded || legacyBaselineNeeded) return;
    const pruned = pruneReadLedger(readLedger);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pruned));
      window.localStorage.removeItem(legacyStorageKey);
    } catch {}
    const unchanged = Object.keys(pruned).length === Object.keys(readLedger).length
      && Object.entries(pruned).every(([key, readAt]) => readLedger[key] === readAt);
    const pruneTimer = unchanged ? null : window.setTimeout(() => setReadLedger(pruned), 0);
    return () => { if (pruneTimer !== null) window.clearTimeout(pruneTimer); };
  }, [legacyBaselineNeeded, legacyStorageKey, loaded, readHydrated, readLedger, storageKey]);

  useEffect(() => {
    if (!readHydrated || !loaded) return;
    void updateAppBadge(unreadCount);
  }, [loaded, readHydrated, unreadCount]);

  const markRead = (item: NotificationItem) => {
    const key = notificationKey(item);
    setReadLedger((current) => Object.hasOwn(current, key) ? current : { ...current, [key]: Date.now() });
  };
  const markAllRead = () => {
    const readAt = Date.now();
    setReadLedger((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [notificationKey(item), readAt])) }));
  };
  const clearLongPress = useCallback(() => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    pressStateRef.current = null;
    setPressingKey('');
  }, []);
  const selectFallbackText = useCallback(() => {
    const field = copyFallbackRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
  }, []);
  const copyNotification = useCallback(async (item: NotificationItem, offerFallback = true) => {
    try {
      await writeClipboardText(notificationClipboardText(item));
      showToast('Đã sao chép nội dung thông báo.', 'success');
      setCopyFallback(null);
      window.navigator.vibrate?.(18);
    } catch {
      if (offerFallback) {
        setCopyFallback(item);
        window.setTimeout(selectFallbackText, 0);
        showToast('Safari đang chặn sao chép tự động. Nội dung đã được chọn để bạn sao chép.', 'info');
      } else {
        selectFallbackText();
        showToast('Nội dung đã được chọn. Chạm giữ vùng chữ rồi chọn Sao chép.', 'info');
      }
    }
  }, [selectFallbackText]);
  const beginLongPress = (event: React.PointerEvent<HTMLButtonElement>, item: NotificationItem) => {
    if (event.button !== 0) return;
    clearLongPress();
    const key = notificationKey(item);
    const state = { key, startX: event.clientX, startY: event.clientY, triggered: false };
    pressStateRef.current = state;
    setPressingKey(key);
    pressTimerRef.current = window.setTimeout(() => {
      if (pressStateRef.current !== state) return;
      state.triggered = true;
      suppressClickRef.current = key;
    }, COPY_LONG_PRESS_MS);
  };
  const moveLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = pressStateRef.current;
    if (!state || state.triggered) return;
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > COPY_MOVE_TOLERANCE_PX) clearLongPress();
  };
  const endLongPress = (item?: NotificationItem) => {
    const state = pressStateRef.current;
    const shouldCopy = Boolean(item && state?.triggered && state.key === notificationKey(item));
    clearLongPress();
    if (shouldCopy && item) void copyNotification(item);
  };
  const close = () => {
    clearLongPress();
    setOpen(false);
    setTargetNotificationId('');
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
            <button type="button" className={view === 'all' ? 'active' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>Tất cả <span>{items.length}</span></button>
            <button type="button" className={view === 'unread' ? 'active' : ''} aria-pressed={view === 'unread'} onClick={() => setView('unread')}>Chưa đọc <span>{unreadCount}</span></button>
          </div>
          <div className="notification-toolbar-actions">
            <button type="button" className="notification-toolbar-icon" aria-label="Đánh dấu tất cả là đã đọc" title="Đánh dấu tất cả là đã đọc" disabled={!unreadCount} onClick={markAllRead}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 12.5 4 4L15 8"/><path d="m11 15.5 2 2L21.5 9"/></svg>
            </button>
            <button type="button" className="notification-toolbar-icon" aria-label="Làm mới thông báo" title="Làm mới thông báo" disabled={loading} onClick={() => void load(true)}>
              <svg className={loading ? 'spinning' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
            </button>
          </div>
        </div>
        <div className="notification-panel-body" aria-live="polite">
          {loading && !loaded ? <div className="notification-state"><span className="notification-spinner" aria-hidden="true"/>Đang tải thông báo…</div> : null}
          {error ? <div className="notification-state notification-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(true)}>Thử lại</button></div> : null}
          {!loading && !error && !items.length ? <div className="notification-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg><strong>Không có cảnh báo mới</strong><span>Đối soát, vận hành, Quỹ và đồng bộ hệ thống đang ổn.</span></div> : null}
          {!loading && !error && items.length > 0 && !visibleItems.length ? <div className="notification-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg><strong>Đã xem tất cả thông báo</strong><span>Chọn “Tất cả” để xem lại lịch sử đang hoạt động.</span></div> : null}
          {visibleItems.length ? <ul className="notification-list">{visibleItems.map((item) => {
            const key = notificationKey(item);
            const unread = !isNotificationRead(item, readLedger);
            return <li data-notification-id={key} className={`notification-item ${item.severity}${unread ? ' unread' : ' read'}${targetNotificationId === key ? ' targeted' : ''}`} key={notificationKey(item)}>
              <button
                type="button"
                className={`notification-item-action${pressingKey === key ? ' copy-pressing' : ''}`}
                aria-label={`${unread ? 'Đánh dấu đã đọc' : 'Đã đọc'}: ${item.title}. Nhấn giữ để sao chép nội dung.`}
                aria-keyshortcuts="Control+C Meta+C"
                title="Nhấn giữ để sao chép nội dung"
                onClick={() => {
                  if (suppressClickRef.current === key) {
                    suppressClickRef.current = '';
                    return;
                  }
                  markRead(item);
                }}
                onPointerDown={(event) => beginLongPress(event, item)}
                onPointerMove={moveLongPress}
                onPointerUp={() => endLongPress(item)}
                onPointerCancel={() => endLongPress()}
                onPointerLeave={(event) => { if (event.pointerType === 'mouse') endLongPress(); }}
                onContextMenu={(event) => event.preventDefault()}
                onCopy={(event) => {
                  event.preventDefault();
                  event.clipboardData.setData('text/plain', notificationClipboardText(item));
                  showToast('Đã sao chép nội dung thông báo.', 'success');
                }}
              >
                <span className="notification-item-icon" aria-hidden="true">{item.type === 'hot-bonus' || item.type === 'fund-low-balance' ? '₫' : item.type === 'reconciliation-resolved' || item.type === 'reconciliation-resolved-group' ? '✓' : '!'}</span>
                <div><div className="notification-item-heading"><strong>{item.title}</strong><time dateTime={item.date}>{dateLabel(item.date)}</time></div><p>{item.message}</p>{item.type === 'hot-bonus' ? <div className="notification-item-meta"><span>{Number(item.excessTrips || 0)} chuyến vượt</span><strong>{money(item.amount)} đ</strong></div> : null}</div>
                {unread ? <span className="notification-unread-dot" aria-hidden="true"/> : null}
              </button>
            </li>;
          })}</ul> : null}
        </div>
        <footer className="notification-panel-footer"><span>{items.length} thông báo đang hoạt động</span></footer>
      </section>
      {copyFallback ? <div className="notification-copy-layer" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCopyFallback(null); }}>
        <section className="notification-copy-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-copy-title">
          <header><h3 id="notification-copy-title">Sao chép thông báo</h3><button type="button" aria-label="Đóng vùng sao chép" onClick={() => setCopyFallback(null)}>×</button></header>
          <p>Safari đang chặn sao chép tự động. Nội dung bên dưới đã được chọn; nếu nút vẫn bị chặn, chạm giữ vùng chữ và chọn “Sao chép”.</p>
          <textarea ref={copyFallbackRef} readOnly value={notificationClipboardText(copyFallback)} onFocus={(event) => event.currentTarget.select()} />
          <div className="notification-copy-actions"><button type="button" className="primary" onClick={() => void copyNotification(copyFallback, false)}>Sao chép</button><button type="button" onClick={() => setCopyFallback(null)}>Đóng</button></div>
        </section>
      </div> : null}
    </BodyPortal> : null}
  </div>;
}
