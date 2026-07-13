'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import type { ManageAuditRow, ReportAuditRow, SyncStatusRow, WriteJob } from '../../lib/platform/operations-types';

const MANAGE_SHEETS = ['NL_VanChuyen', 'NL_Dau', 'NL_Luong', 'NL_ChiPhiKhac', 'NL_SuaChua', 'NL_TamUng'];
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
  const api = useMemo(() => createClientApiClient(), []);
  const [syncRows, setSyncRows] = useState<SyncStatusRow[]>([]);
  const [jobs, setJobs] = useState<WriteJob[]>([]);
  const [manageAudit, setManageAudit] = useState<ManageAuditRow[] | null>(null);
  const [reportAudit, setReportAudit] = useState<ReportAuditRow[] | null>(null);
  const [sheetName, setSheetName] = useState(MANAGE_SHEETS[0]);
  const [checkedAt, setCheckedAt] = useState('');
  const [busy, setBusy] = useState('status');
  const [message, setMessage] = useState('Đang tải trạng thái nhanh…');
  const [error, setError] = useState(false);

  const report = (value: string, isError = false) => { setMessage(value); setError(isError); };
  const loadStatus = useCallback(async (forceRefresh = false) => {
    setBusy('status');
    report(forceRefresh ? 'Đang làm mới trạng thái…' : 'Đang tải trạng thái nhanh…');
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
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStatus(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  const auditManage = async (mode: 'quick' | 'deep' | 'all') => {
    setBusy(mode);
    const allSheets = mode === 'all';
    const limit = mode === 'quick' ? 50 : 500;
    report(allSheets ? 'Đang kiểm tra sâu toàn bộ Vận hành…' : `Đang kiểm tra ${limit} dòng ${sheetName}…`);
    try {
      const result = await api.get<{ ok?: boolean; results?: ManageAuditRow[] }>('getManageCacheAudit', { params: { sheetNames: allSheets ? '' : sheetName, limit, forceRefresh: true } });
      setManageAudit(result.results || []);
      report(result.ok === false ? 'Audit Vận hành phát hiện cache lệch.' : 'Audit Vận hành hoàn tất.');
      setError(result.ok === false);
    } catch (auditError) { report(auditError instanceof Error ? auditError.message : String(auditError), true); }
    finally { setBusy(''); }
  };

  const auditReports = async () => {
    setBusy('reports');
    report('Đang kiểm tra cache Báo cáo…');
    try {
      const result = await api.get<{ ok?: boolean; results?: ReportAuditRow[] }>('getReportCacheAudit', { params: { months: REPORT_MONTHS, forceRefresh: true } });
      setReportAudit(result.results || []);
      report(result.ok === false ? 'Audit Báo cáo phát hiện cache lệch.' : 'Audit Báo cáo hoàn tất.');
      setError(result.ok === false);
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

  const visibleJobs = jobs.filter((job) => ['pending', 'processing', 'failed'].includes(String(job.status || '').toLowerCase())).slice(0, 8);

  return <main className="b7-module">
    <header className="b7-header"><div><p className="platform-eyebrow">OPERATIONS</p><h1>Trạng thái đồng bộ</h1><p>Quan sát cache và write queue. Các audit chỉ chạy khi bạn chủ động bấm kiểm tra.</p></div><button type="button" disabled={busy === 'status'} onClick={() => loadStatus(true)}>{busy === 'status' ? 'Đang tải…' : 'Làm mới'}</button></header>
    <p className={`b7-message${error ? ' error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{message}{checkedAt ? ` · ${time(checkedAt)}` : ''}</p>

    <section className="b7-card"><div className="b7-card-head"><div><h2>Cache Supabase</h2><p>{syncRows.length} trạng thái gần nhất</p></div></div><div className="b7-status-list">{syncRows.length ? syncRows.map((row, index) => <div className="b7-status-row" key={`${row.syncKey}-${index}`}><div><strong>{row.syncKey || 'Không có sync key'}</strong><p>{[row.module, row.message].filter(Boolean).join(' · ')}</p></div><span className={`b7-pill ${String(row.status || '').toLowerCase()}`}>{String(row.status || 'unknown').toUpperCase()}</span><time>{age(row.ageSeconds, row.syncedAt)}</time></div>) : <div className="b7-empty">Chưa có trạng thái đồng bộ cache.</div>}</div></section>

    <section className="b7-card"><div className="b7-card-head"><div><h2>Write queue Vận hành</h2><p>Chỉ hiển thị job pending, processing hoặc failed gần đây.</p></div></div><div className="b7-status-list">{visibleJobs.length ? visibleJobs.map((job, index) => <div className="b7-status-row" key={job.jobId || index}><div><strong>{job.jobId || 'Không có mã job'}</strong><p>{[job.action, job.lastError].filter(Boolean).join(' · ')}</p></div><span className={`b7-pill ${String(job.status || '').toLowerCase()}`}>{String(job.status || 'unknown').toUpperCase()}</span>{job.status === 'failed' ? <button type="button" disabled={busy === `retry:${job.jobId}`} onClick={() => retry(job)}>Thử lại</button> : <time>{time(job.updatedAt || job.createdAt)}</time>}</div>) : <div className="b7-empty">Không có job pending/failed trong các job gần đây.</div>}</div></section>

    <section className="b7-card"><div className="b7-card-head"><div><h2>Audit Vận hành</h2><p>Quick kiểm tra 50 dòng; deep/all đọc live tối đa 500 dòng và có thể mất thời gian.</p></div></div><div className="b7-audit-controls"><label>Sheet Vận hành<select value={sheetName} onChange={(event) => setSheetName(event.target.value)}>{MANAGE_SHEETS.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select></label><button type="button" disabled={Boolean(busy)} onClick={() => auditManage('quick')}>Kiểm tra 50 dòng</button><button type="button" disabled={Boolean(busy)} onClick={() => auditManage('deep')}>Kiểm tra sâu</button><button type="button" className="b7-warning" disabled={Boolean(busy)} onClick={() => auditManage('all')}>Kiểm tra tất cả</button></div><AuditRows rows={manageAudit} kind="manage" /></section>

    <section className="b7-card"><div className="b7-card-head"><div><h2>Audit Báo cáo</h2><p>Đối chiếu 05/2026, 06/2026, 07/2026 và Tất cả với Google Sheet live.</p></div><button type="button" disabled={Boolean(busy)} onClick={auditReports}>Kiểm tra Báo cáo</button></div><AuditRows rows={reportAudit} kind="report" /></section>
  </main>;
}

function AuditRows({ rows, kind }: { rows: ManageAuditRow[] | ReportAuditRow[] | null; kind: 'manage' | 'report' }) {
  if (rows === null) return <div className="b7-empty">Audit chưa chạy. Chỉ bấm kiểm tra khi cần đối chiếu cache với nguồn live.</div>;
  if (!rows.length) return <div className="b7-empty">Không có kết quả audit.</div>;
  return <div className="b7-status-list">{rows.map((row, index) => {
    const manage = row as ManageAuditRow;
    const report = row as ReportAuditRow;
    const label = kind === 'manage' ? manage.sheetName : `Báo cáo ${report.month || ''}`;
    return <div className="b7-status-row" key={`${label}-${index}`}><div><strong>{label || 'Không xác định'}</strong><p>{row.message || ''}</p></div><span className={`b7-pill ${row.ok ? 'ok' : 'error'}`}>{String(row.status || (row.ok ? 'ok' : 'unknown')).toUpperCase()}</span><time>{time(row.syncedAt)}</time></div>;
  })}</div>;
}
