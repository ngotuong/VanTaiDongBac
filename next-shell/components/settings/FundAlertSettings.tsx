'use client';

import { useEffect, useState } from 'react';
import { showToast } from '../../lib/platform/toast';
import { PillSwitch } from './PillSwitch';

type Rule = { enabled: boolean; thresholdValue: number; cooldownHours: number; recipientRoles: string[]; notificationBody: string; scheduleTime: string; scheduleManagedByDeployment: boolean; updatedAt?: string | null };
type DryRunResult = { balance: number; threshold: number; underThreshold: boolean; wouldSend: boolean; eligibleUserCount: number; subscriptionCount: number };
const money = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

async function post(action: string, body: Record<string, unknown> = {}) {
  const response = await fetch('/api/fund-alerts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-VTDB-CSRF': 'session' }, body: JSON.stringify({ action, ...body }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Không xử lý được cấu hình cảnh báo Quỹ.');
  return payload;
}

export function FundAlertSettings() {
  const [rule, setRule] = useState<Rule | null>(null);
  const [busy, setBusy] = useState('load');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void post('getSettings').then((payload) => { if (active) setRule(payload.rule); }).catch((value) => { if (active) setError(value instanceof Error ? value.message : String(value)); }).finally(() => { if (active) setBusy(''); }); return () => { active = false; }; }, []);
  const change = <K extends keyof Rule>(key: K, value: Rule[K]) => setRule((current) => current ? { ...current, [key]: value } : current);
  const toggleRole = (role: string, enabled: boolean) => change('recipientRoles', enabled ? [...new Set([...(rule?.recipientRoles || []), role])] : (rule?.recipientRoles || []).filter((item) => item !== role));
  const save = async () => { if (!rule) return; setBusy('save'); setError(''); try { const payload = await post('updateSettings', { rule }); setRule(payload.rule); showToast('Đã lưu cấu hình và ghi nhật ký thay đổi.', 'success'); } catch (value) { const message = value instanceof Error ? value.message : String(value); setError(message); showToast(message, 'error'); } finally { setBusy(''); } };
  const dryRun = async () => { if (!rule) return; setBusy('dry'); setError(''); try { const payload = await post('dryRun', { rule }); setResult(payload); showToast('Đã kiểm tra bản nháp, không gửi thông báo.', 'success'); } catch (value) { const message = value instanceof Error ? value.message : String(value); setError(message); showToast(message, 'error'); } finally { setBusy(''); } };

  return <article className="info-card fund-alert-settings-card">
    <div className="settings-card-header"><div><h2>Quy tắc cảnh báo số dư Quỹ</h2></div>{rule ? <div className="push-switch-control"><span>{rule.enabled ? 'Sẵn sàng' : 'Đang tắt'}</span><PillSwitch checked={rule.enabled} disabled={Boolean(busy)} label={`${rule.enabled ? 'Tắt' : 'Bật'} quy tắc cảnh báo Quỹ`} onChange={(value) => change('enabled', value)} /></div> : <span className="push-status-badge">Đang tải</span>}</div>
    {error ? <p className="account-settings-status error" role="alert">{error}</p> : null}
    {rule ? <details className="fund-alert-disclosure"><summary>Sửa quy tắc và kiểm tra thử</summary><div className="fund-alert-disclosure-body fund-alert-form">
      <label><span>Ngưỡng số dư (đồng)</span><input type="number" min="1000000" max="1000000000" step="100000" value={rule.thresholdValue} onChange={(event) => change('thresholdValue', Number(event.target.value))} /></label>
      <label><span>Gửi lại sau (giờ)</span><input type="number" min="1" max="168" step="1" value={rule.cooldownHours} onChange={(event) => change('cooldownHours', Number(event.target.value))} /></label>
      <fieldset><legend>Nhóm nhận</legend>{[['admin', 'Quản trị viên'], ['shareholder', 'Cổ đông']].map(([value, label]) => <label className="fund-alert-role" key={value}><input type="checkbox" checked={rule.recipientRoles.includes(value)} onChange={(event) => toggleRole(value, event.target.checked)} /><span>{label}</span></label>)}</fieldset>
      <label className="fund-alert-body-field"><span>Nội dung thông báo</span><textarea maxLength={160} rows={3} value={rule.notificationBody} onChange={(event) => change('notificationBody', event.target.value)} /><small>{rule.notificationBody.length}/160 ký tự</small></label>
      <div className="fund-alert-schedule"><strong>Lịch dự kiến</strong><span>08:00 hằng ngày · chưa kích hoạt</span></div>
      <div className="fund-alert-actions"><button id="saveFundAlertRule" type="button" className="primary icon-button settings-icon-button" aria-label="Lưu quy tắc cảnh báo Quỹ" title="Lưu quy tắc" disabled={Boolean(busy)} onClick={save}><svg className={`btn-svg${busy === 'save' ? ' spinning' : ''}`} viewBox="0 0 24 24" aria-hidden="true">{busy === 'save' ? <><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></> : <><path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>}</svg></button><button type="button" className="ghost" disabled={Boolean(busy)} onClick={dryRun}>{busy === 'dry' ? 'Đang kiểm tra...' : 'Kiểm tra bản nháp — không gửi'}</button></div>
      {result ? <div className="fund-alert-dry-run" role="status"><strong>Số dư hiện tại: {money.format(result.balance)}đ</strong><span>{result.underThreshold ? 'Đang dưới ngưỡng.' : 'Đang an toàn.'} {result.wouldSend ? 'Theo bản nháp, lần kiểm tra này sẽ đủ điều kiện gửi.' : 'Theo bản nháp, lần kiểm tra này sẽ không gửi.'}</span><span>{result.eligibleUserCount} người đã chọn loại cảnh báo · {result.subscriptionCount} thiết bị</span></div> : null}
    </div></details> : null}
  </article>;
}
