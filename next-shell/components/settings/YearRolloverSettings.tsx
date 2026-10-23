'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { showToast } from '../../lib/platform/toast';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';

type Audit = {
  ok?: boolean;
  canary?: boolean;
  cleanedUp?: boolean;
  activationReady?: boolean;
  confirmationToken?: string;
  blockers?: string[];
  warnings?: string[];
};

type RolloverStatus = {
  ok: boolean;
  sourceYear: string;
  targetYear: string;
  sourceConfigured: boolean;
  targetConfigured: boolean;
  manifest: { ready: boolean; version?: string; names?: { transport?: string; cashflow?: string }; error?: string };
  registry: {
    ready: boolean;
    error?: string;
    contexts?: Array<{ year: string; status: string; workbookNames?: { transport?: string; cashflow?: string }; auditSummary?: Audit; preparedAt?: string | null; activatedAt?: string | null; updatedAt?: string | null }>;
    latestRun?: { runId: string; status: string; stale?: boolean; error?: string; plan?: { canary?: boolean; background?: boolean; mode?: string }; audit?: Audit; updatedAt?: string } | null;
  };
};

type OperationResult = {
  ok: boolean;
  accepted?: boolean;
  runId?: string;
  canary?: boolean;
  cleanedUp?: boolean;
  auditOk?: boolean;
  dryRun?: boolean;
  status?: string;
  sourceYear?: string;
  targetYear?: string;
  sourceWorkbookNames?: { transport?: string; cashflow?: string };
  targetWorkbookNames?: { transport?: string; cashflow?: string };
  operationCounts?: Record<string, number>;
  safeguards?: string[];
  audit?: Audit;
  confirmationToken?: string;
  blockers?: string[];
  warnings?: string[];
  activationReady?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bản nháp', ready: 'Sẵn sàng kiểm thử', active: 'Đang hoạt động', archived: 'Chỉ xem', failed: 'Cần xử lý'
};

export function YearRolloverSettings() {
  const { workbook } = useWorkbookContext();
  const api = useMemo(() => createClientApiClient(), []);
  const sourceYear = workbook.activeYear;
  const targetYear = String(Number(sourceYear) + 1);
  const [status, setStatus] = useState<RolloverStatus | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [busy, setBusy] = useState('');
  const [confirmCanary, setConfirmCanary] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [activationText, setActivationText] = useState('');
  const [lastError, setLastError] = useState('');

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const next = await api.get<RolloverStatus>('getYearRolloverStatus', { params: { sourceYear, targetYear } });
      setStatus(next);
      setLastError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      showToast(message, 'error');
    } finally { setBusy(''); }
  }, [api, sourceYear, targetYear]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const latestRun = status?.registry.latestRun || null;
  const context = status?.registry.contexts?.find((item) => item.year === targetYear);
  const canaryRun = latestRun?.plan?.canary ? latestRun : null;
  const canaryRunning = Boolean(canaryRun && ['planned', 'copying', 'auditing'].includes(canaryRun.status));
  const canaryPassed = Boolean(canaryRun?.status === 'ready' && canaryRun.audit?.canary && canaryRun.audit?.cleanedUp);
  const realRun = latestRun && !latestRun.plan?.canary ? latestRun : null;
  const realRunStale = Boolean(realRun && ['planned', 'copying', 'auditing'].includes(realRun.status) && realRun.stale);
  const realRunRunning = Boolean(realRun && ['planned', 'copying', 'auditing'].includes(realRun.status) && !realRunStale);
  const rolloverRunning = canaryRunning || realRunRunning;

  useEffect(() => {
    if (!rolloverRunning || busy) return;
    const timer = window.setTimeout(() => { void load(); }, 3000);
    return () => window.clearTimeout(timer);
  }, [busy, load, latestRun?.updatedAt, rolloverRunning]);

  const operate = async (operation: 'preview' | 'canary' | 'provision' | 'resume' | 'audit' | 'prepare' | 'activate') => {
    setBusy(operation);
    setLastError('');
    try {
      const confirmationToken = operation === 'activate' ? result?.confirmationToken || '' : '';
      const next = await api.post<OperationResult>('manageYearRollover', {
        body: { operation, sourceYear, targetYear, confirmationToken }
      });
      setResult(next);
      setConfirmCanary(false);
      setConfirmCreate(false);
      setActivationText('');
      if (next.accepted) {
        showToast(operation === 'canary'
          ? 'Canary đã được đưa vào hàng đợi nền. Trang này sẽ tự cập nhật kết quả.'
          : operation === 'audit'
            ? 'Audit đã chạy nền. Trang này sẽ tự cập nhật kết quả.'
            : operation === 'resume'
              ? 'Đã tiếp tục chuẩn bị hai workbook hiện có ở chế độ nền.'
              : 'Đã bắt đầu tạo và chuẩn bị hai workbook ở chế độ nền.', 'success');
        await load();
        return;
      }
      const auditFailed = next.auditOk === false || next.audit?.ok === false;
      showToast(auditFailed ? 'Hai workbook đã được giữ ở trạng thái cần xử lý; xem blocker bên dưới.' : operation === 'preview' ? 'Kế hoạch tạo năm mới đã qua kiểm tra khô.'
        : operation === 'canary' ? 'Canary đã qua kiểm tra và hai bản sao tạm đã được dọn sạch.'
        : operation === 'provision' ? 'Đã tạo và kiểm tra hai workbook bản nháp.'
          : operation === 'audit' ? 'Đã kiểm tra lại workbook năm mới.'
            : operation === 'prepare' ? 'Đã tạo snapshot xác nhận kích hoạt.'
              : `Đã kích hoạt năm dữ liệu ${targetYear}.`, auditFailed ? 'error' : 'success');
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      showToast(message, 'error');
      if (operation !== 'preview') await load();
    } finally { setBusy(''); }
  };

  const contextAuditIsNewer = Boolean(context?.updatedAt && (!latestRun?.updatedAt || new Date(context.updatedAt).getTime() >= new Date(latestRun.updatedAt).getTime()));
  const audit = result?.audit || (contextAuditIsNewer ? context?.auditSummary : latestRun?.audit) || context?.auditSummary || null;
  const blockers = result?.blockers || audit?.blockers || [];
  const warnings = result?.warnings || audit?.warnings || [];
  const readyForActivation = Boolean(result?.activationReady && result?.confirmationToken);

  return <div className="settings-grid year-rollover-settings">
    <article className="info-card year-rollover-card">
      <div className="settings-card-header">
        <div><h2>Năm dữ liệu</h2><p>Tạo riêng workbook Vận tải và Thu chi cho năm mới, kiểm tra trước khi kích hoạt.</p></div>
        <button type="button" className="ghost icon-text-btn" disabled={Boolean(busy)} onClick={() => void load()}>{busy === 'load' ? 'Đang tải…' : 'Làm mới'}</button>
      </div>
      <div className="year-rollover-route" aria-label="Luồng chuyển năm">
        <span><small>Năm nguồn</small><strong>{sourceYear}</strong><em>Đang hoạt động</em></span>
        <b aria-hidden="true">→</b>
        <span><small>Năm mới</small><strong>{targetYear}</strong><em>{context ? STATUS_LABELS[context.status] || context.status : 'Chưa tạo'}</em></span>
      </div>
      <div className="year-rollover-readiness">
        <StatusRow ok={Boolean(status?.sourceConfigured)} label="Đủ hai workbook nguồn" />
        <StatusRow ok={Boolean(status?.registry.ready)} label="Registry server-only migration 020" detail={status?.registry.error} />
        <StatusRow ok={Boolean(status?.manifest.ready)} label="Manifest range/công thức đã phê duyệt" detail={status?.manifest.error} />
        <StatusRow ok={Boolean(status?.targetConfigured)} pending label="Hai workbook năm mới" />
      </div>
      {status?.manifest.names ? <div className="year-rollover-names">
        <span><small>Vận tải</small><strong>{status.manifest.names.transport}</strong></span>
        <span><small>Thu chi</small><strong>{status.manifest.names.cashflow}</strong></span>
      </div> : null}
      <div className="year-rollover-actions">
        <button type="button" className="ghost" disabled={Boolean(busy) || !status?.manifest.ready || status?.targetConfigured} onClick={() => void operate('preview')}>{busy === 'preview' ? 'Đang kiểm tra…' : 'Kiểm tra kế hoạch'}</button>
        {!status?.targetConfigured && !confirmCanary ? <button type="button" className="ghost" disabled={Boolean(busy) || rolloverRunning || !status?.sourceConfigured || !status?.registry.ready || !status?.manifest.ready} onClick={() => setConfirmCanary(true)}>{canaryRunning ? 'Canary đang chạy…' : 'Chạy canary an toàn'}</button> : null}
        {!status?.targetConfigured && !confirmCreate ? <button type="button" className="primary" disabled={Boolean(busy) || rolloverRunning || !status?.sourceConfigured || !status?.registry.ready || !status?.manifest.ready} onClick={() => setConfirmCreate(true)}>Tạo workbook {targetYear}</button> : null}
      </div>
      {lastError ? <div className="year-rollover-issues error" role="alert"><strong>Lỗi chuyển năm</strong><p>{lastError}</p></div> : null}
      {confirmCanary ? <div className="year-rollover-confirm" role="group" aria-label="Xác nhận chạy canary chuyển năm">
        <p>Hệ thống sẽ tạo hai bản sao tạm, áp manifest và audit, rồi đưa cả hai bản sao tạm vào thùng rác. Canary không đăng ký workbook năm {targetYear}.</p>
        <div><button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void operate('canary')}>{busy === 'canary' ? 'Đang chạy canary…' : 'Xác nhận chạy canary'}</button><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => setConfirmCanary(false)}>Bỏ qua</button></div>
      </div> : null}
      {confirmCreate ? <div className="year-rollover-confirm" role="group" aria-label="Xác nhận tạo workbook năm mới">
        <p>Hệ thống sẽ tạo hai bản sao trong thư mục đã cấu hình và chỉ sửa các range có trong manifest. Năm {sourceYear} vẫn hoạt động.</p>
        <div><button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void operate('provision')}>{busy === 'provision' ? 'Đang tạo…' : `Xác nhận tạo năm ${targetYear}`}</button><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => setConfirmCreate(false)}>Bỏ qua</button></div>
      </div> : null}
    </article>

    {result?.dryRun ? <article className="info-card year-rollover-card">
      <h2>Kế hoạch đã kiểm tra</h2>
      <p>{result.sourceWorkbookNames?.transport} và {result.sourceWorkbookNames?.cashflow} sẽ được sao chép thành {result.targetWorkbookNames?.transport} và {result.targetWorkbookNames?.cashflow}.</p>
      <ul>{(result.safeguards || []).map((item) => <li key={item}>{item}</li>)}</ul>
    </article> : null}

    {canaryRunning ? <article className="info-card year-rollover-card">
      <h2>Canary đang chạy nền</h2>
      <p>Hệ thống đang sao chép, áp manifest và audit. Bạn có thể rời trang; trạng thái sẽ được lưu trên server.</p>
    </article> : null}

    {canaryRun?.status === 'failed' ? <article className="info-card year-rollover-card">
      <h2>Canary cần xử lý</h2>
      <p>{canaryRun.error || 'Tác vụ nền không hoàn tất; hãy kiểm tra nhật ký trước khi chạy lại.'}</p>
    </article> : null}

    {(result?.canary && result.cleanedUp) || canaryPassed ? <article className="info-card year-rollover-card">
      <h2>Canary đã qua</h2>
      <p>Hai bản sao tạm đã áp manifest và audit thành công, sau đó được đưa vào thùng rác. Chưa có workbook năm {targetYear} nào được đăng ký.</p>
    </article> : null}

    {realRunRunning ? <article className="info-card year-rollover-card">
      <h2>Đang chuẩn bị workbook {targetYear}</h2>
      <p>Hệ thống đang xử lý từng pha nền và tự audit sau khi áp manifest. Bạn có thể rời trang; trạng thái được lưu trên server.</p>
    </article> : null}

    {status?.targetConfigured ? <article className="info-card year-rollover-card">
      <div className="settings-card-header"><div><h2>Kiểm tra và kích hoạt</h2><p>Kích hoạt không xóa workbook năm cũ; năm {sourceYear} chuyển sang chỉ xem.</p></div><button type="button" className="ghost" disabled={Boolean(busy) || rolloverRunning} onClick={() => void operate('audit')}>{busy === 'audit' ? 'Đang xếp audit…' : 'Chạy audit lại'}</button></div>
      {(context?.status === 'failed' || realRunStale) ? <div className="year-rollover-confirm"><p>Lượt chuẩn bị trước chưa hoàn tất. Hệ thống sẽ áp lại đúng manifest trên hai workbook đã đăng ký rồi audit ở tác vụ nền mới; không tạo thêm bản sao.</p><button type="button" className="primary" disabled={Boolean(busy) || realRunRunning} onClick={() => void operate('resume')}>{busy === 'resume' ? 'Đang tiếp tục…' : 'Tiếp tục chuẩn bị'}</button></div> : null}
      {blockers.length ? <IssueList title="Cần xử lý" kind="error" items={blockers} /> : <p className="year-rollover-pass">Không có blocker trong audit gần nhất.</p>}
      {warnings.length ? <IssueList title="Cần đối chiếu" kind="warning" items={warnings} /> : null}
      {!readyForActivation ? <button type="button" className="primary" disabled={Boolean(busy) || rolloverRunning || blockers.length > 0 || context?.status !== 'ready'} onClick={() => void operate('prepare')}>{busy === 'prepare' ? 'Đang chốt snapshot…' : 'Chuẩn bị kích hoạt'}</button> : <div className="year-rollover-activation">
        <label>Nhập <strong>{targetYear}</strong> để xác nhận<input type="text" inputMode="numeric" value={activationText} onChange={(event) => setActivationText(event.target.value.trim())} /></label>
        <button type="button" className="primary danger" disabled={Boolean(busy) || activationText !== targetYear} onClick={() => void operate('activate')}>{busy === 'activate' ? 'Đang kích hoạt…' : `Kích hoạt năm ${targetYear}`}</button>
        <small>Server chỉ chấp nhận khi lệnh ghi đã tạm dừng, hàng đợi rỗng và confirmation token còn khớp audit.</small>
      </div>}
    </article> : null}
  </div>;
}

function StatusRow({ ok, pending = false, label, detail }: { ok: boolean; pending?: boolean; label: string; detail?: string }) {
  return <div className={`year-rollover-status ${ok ? 'ok' : pending ? 'pending' : 'error'}`}><span aria-hidden="true">{ok ? '✓' : pending ? '○' : '!'}</span><div><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</div></div>;
}

function IssueList({ title, kind, items }: { title: string; kind: 'error' | 'warning'; items: string[] }) {
  return <div className={`year-rollover-issues ${kind}`}><strong>{title}</strong><ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>;
}
