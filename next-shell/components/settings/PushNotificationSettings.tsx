'use client';

import { useEffect, useState } from 'react';
import { showToast } from '../../lib/platform/toast';
import { FundAlertSettings } from './FundAlertSettings';
import { PillSwitch } from './PillSwitch';

type PushStatus = {
  ok: boolean;
  configured: boolean;
  publicKey: string;
  deviceCount: number;
  types: NotificationType[];
  error?: string;
};

type NotificationType = { key: string; label: string; description: string; enabled: boolean };

type SupportState = 'checking' | 'supported' | 'unsupported' | 'ios-browser';

function base64UrlToBytes(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (/macintosh/i.test(window.navigator.userAgent) && window.navigator.maxTouchPoints > 1);
}

async function parseResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Không thực hiện được thao tác thông báo.');
  return payload;
}

async function postPush(action: string, body: Record<string, unknown>) {
  const response = await fetch('/api/push', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-VTDB-CSRF': 'session' },
    body: JSON.stringify({ action, ...body })
  });
  return parseResponse(response);
}

export function PushNotificationSettings({ isAdmin = false }: { isAdmin?: boolean }) {
  const [support, setSupport] = useState<SupportState>('checking');
  const [publicKey, setPublicKey] = useState('');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);
  const [busy, setBusy] = useState('');
  const [types, setTypes] = useState<NotificationType[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      let status: PushStatus;
      try {
        status = await parseResponse(await fetch('/api/push', { credentials: 'same-origin', cache: 'no-store' })) as PushStatus;
        if (active) { setPublicKey(status.publicKey || ''); setDeviceCount(Number(status.deviceCount) || 0); setTypes(status.types || []); }
      } catch (error) {
        if (active) { setSupport('unsupported'); setMessage(error instanceof Error ? error.message : String(error)); }
        return;
      }
      if (isIos() && !isStandalone()) {
        if (active) {
          setSupport('ios-browser');
          setMessage('');
        }
        return;
      }
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (active) { setSupport('unsupported'); setMessage('Thiết bị hoặc phiên bản hệ điều hành này chưa hỗ trợ Web Push. iPhone/iPad cần iOS/iPadOS 16.4 trở lên.'); }
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const current = await registration.pushManager.getSubscription();
        if (!active) return;
        setSubscription(current);
        setSupport('supported');
        setMessage('');
      } catch (error) {
        if (!active) return;
        setSupport('unsupported');
        setMessage(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { active = false; };
  }, []);

  const enable = async () => {
    if (!publicKey) return;
    setBusy('enable');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Quyền thông báo chưa được cấp trên thiết bị.');
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey)
      });
      await postPush('subscribe', { subscription: current.toJSON() });
      setSubscription(current);
      setDeviceCount((count) => Math.max(1, count));
      setMessage('');
      showToast('Đã bật thông báo trên thiết bị này.', 'success');
    } catch (error) {
      const value = error instanceof Error ? error.message : String(error);
      setMessage(value);
      showToast(value, 'error');
    } finally { setBusy(''); }
  };

  const disable = async () => {
    if (!subscription) return;
    setBusy('disable');
    try {
      await postPush('unsubscribe', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      setSubscription(null);
      setDeviceCount((count) => Math.max(0, count - 1));
      setMessage('');
      showToast('Đã tắt thông báo trên thiết bị này.', 'success');
    } catch (error) {
      const value = error instanceof Error ? error.message : String(error);
      setMessage(value);
      showToast(value, 'error');
    } finally { setBusy(''); }
  };

  const sendTest = async () => {
    if (!subscription) return;
    setBusy('test');
    try {
      await postPush('test', { endpoint: subscription.endpoint });
      setMessage('');
      showToast('Đã gửi thông báo thử tới thiết bị này.', 'success');
    } catch (error) {
      const value = error instanceof Error ? error.message : String(error);
      setMessage(value);
      showToast(value, 'error');
    } finally { setBusy(''); }
  };

  const enabled = Boolean(subscription);
  const toggleNotifications = (nextEnabled: boolean) => {
    void (nextEnabled ? enable() : disable());
  };

  const toggleType = async (key: string, nextEnabled: boolean) => {
    setBusy(`type:${key}`);
    try {
      await postPush('setPreference', { notificationKey: key, enabled: nextEnabled });
      setTypes((items) => items.map((item) => item.key === key ? { ...item, enabled: nextEnabled } : item));
      showToast(nextEnabled ? 'Đã bật loại thông báo.' : 'Đã tắt loại thông báo.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setBusy(''); }
  };

  return <article className="info-card push-settings-card">
    <div className="settings-card-header push-settings-header">
      <div>
        <span className={`push-status-dot${enabled ? ' enabled' : ''}`} aria-hidden="true" />
        <h2>Thông báo trên thiết bị</h2>
      </div>
      {support === 'supported' ? <div className="push-switch-control">
        <span>{enabled ? 'Đang bật' : 'Đang tắt'}</span>
        <PillSwitch checked={enabled} disabled={Boolean(busy)} label={`${enabled ? 'Tắt' : 'Bật'} thông báo trên thiết bị này`} onChange={toggleNotifications} />
      </div> : <span className="push-status-badge">{support === 'checking' ? 'Đang kiểm tra' : 'Chưa hỗ trợ'}</span>}
    </div>
    {message ? <div className="push-settings-message" role="status" aria-live="polite">{message}</div> : null}
    {support === 'ios-browser' ? <p className="push-install-guide">
      Cách bật: mở trang này bằng Safari, chọn <strong>Chia sẻ</strong> → <strong>Thêm vào MH chính</strong>, sau đó đóng Safari và mở Vận tải Đông Bắc từ biểu tượng mới.
    </p> : null}
    {deviceCount > 0 ? <p className="push-device-count">Tài khoản hiện có {deviceCount} thiết bị đăng ký.</p> : null}
    {types.length ? <section className="notification-type-settings" aria-labelledby="notification-type-heading">
      <div className="notification-type-heading"><h3 id="notification-type-heading">Loại thông báo</h3></div>
      <div className="notification-type-list">{types.map((item) => <div className={`notification-type-item${item.key === 'fund-low-balance' ? ' fund-alert-type-item' : ''}`} key={item.key}>
        <div className="notification-type-row"><div><strong>{item.label}</strong><span>{item.description}</span></div><PillSwitch checked={item.enabled} disabled={Boolean(busy)} label={`${item.enabled ? 'Tắt' : 'Bật'} ${item.label}`} onChange={(value) => void toggleType(item.key, value)} /></div>
        {item.key === 'fund-low-balance' && isAdmin ? <FundAlertSettings /> : null}
      </div>)}</div>
    </section> : null}
    <div className="push-settings-actions">
      {support === 'supported' && enabled ?
        <button type="button" className="primary" disabled={Boolean(busy)} onClick={sendTest}>{busy === 'test' ? 'Đang gửi...' : 'Gửi thông báo thử'}</button>
      : null}
    </div>
  </article>;
}
