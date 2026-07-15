'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import type { ManageAuditRow, ReportAuditRow, SyncStatusRow, WriteJob } from '../../lib/platform/operations-types';

const DEFAULT_MANAGE_SHEET = 'NL_VanChuyen';
const REPORT_MONTHS = '05/2026,06/2026,07/2026,Tất cả';

function time(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function age(seconds?: number | null, syncedAt?: string) {
  if (typeof seconds === 'number') {
    if (seconds < 60) return `${seconds}s trước`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} giờ trước`;
  }
  return time(syncedAt);
}

export function ObservabilityModule() {
  const { user } = useWorkbookContext();
  const api = useMemo(() => createClientApiClient(), []);
  const [syncRows, setSyncRows] = useState<SyncStatusRow[]>([]);
  const [jobs, setJobs] = useState<WriteJob[]>([]);
  const [manageAudit, setManageAudit] = useState<ManageAuditRow[] | null>(null);
  const [reportAudit, setReportAudit] = useState<ReportAuditRow[] | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [busy, setBusy] = useState(user.role === 'shareholder' ? '' : 'status');
  const [message, setMessage] = useState(user.role === 'shareholder' ? 'Tài khoản cổ đông chỉ có quyền xem dữ liệu.' : 'Đang tải trạng thái nhanh...');
  const [error, setError] = useState(false);

  const report = (value: string, isError = false) => { setMessage(value); setError(isError); };
  const loadStatus = useCallback(async (forceRefresh = false) => {
    if (user.role === 'shareholder') return;
    setBusy('status');
    report(forceRefresh ? 'Đang làm mới trạng thái...' : 'Đang tải trạng thái nhanh...');
    try {
      const [sync, recent] = await Promise.all([
        api.get<{ rows?: SyncStatusRow[]; checkedAt?: string }>('getSupabaseSyncStatus', { params: { limit: 24, forceRefresh } }),
        api.get<{ jobs?: WriteJob[]; checkedAt?: string }>('getRecentWriteJobs', { params: { module: 'transport', limit: 12, forceRefresh } })
      ]);
      setSyncRows(sync.rows || []);
      setJobs(recent.jobs || []);
      setCheckedAt(sync.checkedAt || recent.checkedAt || new Date().toISOString());
      report('Đã tải trạng thái cache và write queue. Audit chưa được chạy.');
    } catch (loadError) {
      report(loadError instanceof Error ? loadError.message : String(loadError), true);
    } finally { setBusy(''); }
  }, [api, user.role]);

  useEffect(() => {
    if (user.role === 'shareholder') return;
    const timer = window.setTimeout(() => { void loadStatus(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus, user.role]);

  const auditManage = async (mode: 'quick' | 'deep' | 'all') => {
    setBusy(mode);
    const allSheets = mode === 'all';
    const limit = mode === 'quick' ? 50 : 500;
    report(allSheets ? 'Đang kiểm tra sâu toàn bộ Vận hành...' : mode === 'deep' ? 'Đang kiểm tra sâu cache Vận hành...' : 'Đang kiểm tra cache Vận hành...');
    try {
      const result = await api.get<{ ok?: boolean; results?: ManageAuditRow[] }>('getManageCacheAudit', { params: { sheetNames: allSheets ? '' : DEFAULT_MANAGE_SHEET, limit, forceRefresh: true } });
      setManageAudit(result.results || []);
      report(result.ok === false ? `Audit Vận hành phát hiện cache lệch (${allSheets ? 'tất cả, ' : ''}${limit} dòng).` : `Audit Vận hành OK (${allSheets ? 'tất cả, ' : ''}${limit} dòng).`, result.ok === false);
    } catch (auditError) { report(auditError instanceof Error ? auditError.message : String(auditError), true); }
    finally { setBusy(''); }
  };

  const auditReports = async () => {
    setBusy('reports');
    report('Đang kiểm tra cache Báo cáo...');
    try {
      const result = await api.get<{ ok?: boolean; results?: ReportAuditRow[] }>('getReportCacheAudit', { params: { months: REPORT_MONTHS, forceRefresh: true } });
      setReportAudit(result.results || []);
      report(result.ok === false ? 'Audit Báo cáo phát hiện cache lệch.' : 'Audit Báo cáo OK.', result.ok === false);
    } catch (auditError) { report(auditError instanceof Error ? auditError.message : String(auditError), true); }
    finally { setBusy(''); }
  };

  const retry = async (job: WriteJob) => {
    if (!job.jobId || !window.confirm(`Đưa job ${job.jobId} về hàng chờ?`)) return;
    setBusy(`retry:${job.jobId}`);
    try {
      await api.post('retryWriteJob', { body: { jobId: job.jobId } });
      report(`Đã đưa job ${job.jobId} về hàng chờ. Worker định kỳ sẽ tiếp tục xử lý.`);
      await loadStatus(true);
    } catch (retryError) { report(retryError instanceof Error ? retryError.message : String(retryError), true); }
    finally { setBusy(''); }
  };

  if (user.role === 'shareholder') {
    return <section id="settingsView" className="view active settings-c2"><div className="settings-grid"><article className="info-card account-password-card"><h2>Trạng thái đồng bộ</h2><p>Tài khoản cổ đông không có quyền truy cập công cụ vận hành này.</p><div className="settings-route-actions inline"><Link className="ghost icon-text-btn settings-route-link" href="/settings" prefetch={false}>Quay lại tài khoản</Link></div></article></div></section>;
  }

  const visibleJobs = jobs.filter((job) => ['pending', 'processing', 'failed'].includes(String(job.status || '').toLowerCase())).slice(0, 8);

  return <section id="settingsView" className="view active settings-c2">
    <div className="settings-route-actions"><Link className="ghost icon-text-btn settings-route-link" href="/settings" prefetch={false}>Tài khoản</Link></div>
    <div className="settings-grid">
      <article className="info-card sync-status-card">
        <div className="settings-card-header">
          <div><h2>Trạng thái đồng bộ</h2><p id="syncStatusCheckedAt">{checkedAt ? `Kiểm tra lúc ${time(checkedAt)}` : 'Theo dõi cache và write queue. Audit chỉ chạy khi bấm kiểm tra.'}</p></div>
          <div className="sync-status-actions">
            <AuditButton id="syncStatusRefreshBtn" title="Tải lại trạng thái đồng bộ nhanh" disabled={busy === 'status'} onClick={() => loadStatus(true)} icon="refresh">{busy === 'status' ? 'Đang tải...' : 'Làm mới'}</AuditButton>
            <AuditButton id="manageAuditBtn" title="So cache Vận hành với Google Sheet" disabled={Boolean(busy)} onClick={() => auditManage('quick')} icon="check">Kiểm tra Vận hành</AuditButton>
            <AuditButton id="manageDeepAuditBtn" title="So sâu 500 dòng cache Vận hành với Google Sheet" disabled={Boolean(busy)} onClick={() => auditManage('deep')} icon="book">Kiểm tra sâu</AuditButton>
            <AuditButton id="manageAllAuditBtn" title="So sâu 500 dòng của toàn bộ sheet Vận hành" disabled={Boolean(busy)} onClick={() => auditManage('all')} icon="list">Kiểm tra tất cả</AuditButton>
            <AuditButton id="reportAuditBtn" title="So cache Báo cáo với Google Sheet" disabled={Boolean(busy)} onClick={auditReports} icon="chart">Kiểm tra Báo cáo</AuditButton>
          </div>
        </div>
        <div id="syncStatusBody" className="sync-status-list">
          <StatusSection title="Cache Supabase"><SyncRows rows={syncRows} /></StatusSection>
          <StatusSection title="Write queue Vận hành"><JobRows jobs={visibleJobs} totalJobs={jobs.length} busy={busy} onRetry={retry} /></StatusSection>
          <StatusSection title="Audit Vận hành"><AuditRows rows={manageAudit} kind="manage" /></StatusSection>
          <StatusSection title="Audit Báo cáo"><AuditRows rows={reportAudit} kind="report" /></StatusSection>
        </div>
      </article>
      <div className={`account-settings-status${message ? error ? ' error' : ' success' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{message}</div>
    </div>
  </section>;
}

function StatusSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="sync-status-section"><div className="sync-status-section-title"><strong>{title}</strong></div><div className="sync-status-list">{children}</div></div>;
}

function SyncRows({ rows }: { rows: SyncStatusRow[] }) {
  if (!rows.length) return <div className="sync-status-empty">Chưa có trạng thái đồng bộ cache.</div>;
  return <>{rows.map((row, index) => <div className="sync-status-row" key={`${row.syncKey}-${index}`}><div className="sync-status-main"><div className="sync-status-key" title={row.syncKey || ''}>{row.syncKey || ''}</div><div className="sync-status-note" title={row.message || ''}>{row.module || ''}{row.message ? ` · ${row.message}` : ''}</div></div><span className={`sync-status-pill ${statusClass(row.status)}`}>{String(row.status || '').toUpperCase()}</span><div className="sync-status-time">{age(row.ageSeconds, row.syncedAt)}</div></div>)}</>;
}

function JobRows({ jobs, totalJobs, busy, onRetry }: { jobs: WriteJob[]; totalJobs: number; busy: string; onRetry: (job: WriteJob) => void }) {
  if (!jobs.length) return <div className="sync-status-empty">{totalJobs ? 'Không có job pending/failed trong các job gần đây.' : 'Chưa có write job gần đây.'}</div>;
  return <>{jobs.map((job, index) => {
    const status = String(job.status || '').toLowerCase();
    const sheetOrForm = job.payload?.sheetName || job.payload?.formType;
    const rowIndex = job.payload?.rowIndex;
    const note = [job.action || '', typeof sheetOrForm === 'string' ? sheetOrForm : '', rowIndex ? `dòng ${String(rowIndex)}` : ''].filter(Boolean).join(' · ');
    return <div className="sync-status-row" key={job.jobId || index}><div className="sync-status-main"><div className="sync-status-key" title={job.jobId || ''}>{job.jobId || ''}</div><div className="sync-status-note" title={job.lastError || note}>{note}{job.lastError ? ` · ${job.lastError}` : ''}</div></div><span className={`sync-status-pill ${status === 'failed' ? 'error' : status === 'synced' ? 'ok' : 'pending'}`}>{String(job.status || '').toUpperCase()}</span>{status === 'failed' ? <button type="button" className="ghost sync-status-retry" disabled={busy === `retry:${job.jobId}`} onClick={() => onRetry(job)}>Thử lại</button> : <div className="sync-status-time">{time(job.updatedAt || job.createdAt)}</div>}</div>;
  })}</>;
}

function AuditRows({ rows, kind }: { rows: ManageAuditRow[] | ReportAuditRow[] | null; kind: 'manage' | 'report' }) {
  if (rows === null) return <div className="sync-status-empty">{kind === 'manage' ? 'Bấm Kiểm tra Vận hành để so cache với Google Sheet.' : 'Bấm Kiểm tra Báo cáo khi cần đối chiếu 05/2026, 06/2026, 07/2026 và Tất cả.'}</div>;
  if (!rows.length) return <div className="sync-status-empty">{kind === 'manage' ? 'Chưa có kết quả audit Vận hành.' : 'Chưa có kết quả audit Báo cáo.'}</div>;
  return <>{rows.map((row, index) => {
    const manage = row as ManageAuditRow;
    const report = row as ReportAuditRow;
    const label = kind === 'manage' ? manage.sheetName : `Báo cáo ${report.month || ''}`;
    return <div className="sync-status-row" key={`${label}-${index}`}><div className="sync-status-main"><div className="sync-status-key">{label || ''}</div><div className="sync-status-note" title={row.message || ''}>{row.message || ''}</div></div><span className={`sync-status-pill ${row.ok ? 'ok' : 'error'}`}>{String(row.status || (row.ok ? 'ok' : 'unknown')).toUpperCase()}</span><div className="sync-status-time">{age(null, row.syncedAt)}</div></div>;
  })}</>;
}

function statusClass(value?: string) {
  const status = String(value || '').toLowerCase();
  return status === 'ok' ? 'ok' : status === 'error' ? 'error' : '';
}

function AuditButton({ id, title, disabled, onClick, icon, children }: { id: string; title: string; disabled: boolean; onClick: () => void; icon: 'refresh' | 'check' | 'book' | 'list' | 'chart'; children: React.ReactNode }) {
  return <button type="button" className="ghost icon-text-btn" id={id} title={title} disabled={disabled} onClick={onClick}><AuditIcon icon={icon} />{children}</button>;
}

function AuditIcon({ icon }: { icon: 'refresh' | 'check' | 'book' | 'list' | 'chart' }) {
  if (icon === 'refresh') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg>;
  if (icon === 'check') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  if (icon === 'book') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>;
  if (icon === 'list') return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
  return <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18" /><path d="M19 9l-5 5-4-4-3 3" /></svg>;
}
