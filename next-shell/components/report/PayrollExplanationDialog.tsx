'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { exportCardAsImage } from '../../lib/platform/export-card';
import { payrollExplanationView } from '../../lib/platform/payroll-explanation';
import type { PayrollExplanationResponse } from '../../lib/platform/payroll-explanation-types';
import { useDialogFocusTrap } from '../platform/useDialogFocusTrap';
import { useSwipeDismiss } from '../platform/useSwipeDismiss';

type Props = { employeeName: string; month: string; onClose: () => void };

function Icon({ kind }: { kind: 'close' | 'image' | 'retry' }) {
  if (kind === 'close') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>;
  if (kind === 'image') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 1 0 2 5.3"/><path d="M20 4v7h-7"/></svg>;
}

function MatchStatus({ matched, label }: { matched: boolean; label?: string }) {
  if (!matched) return <span className="is-unmatched">{label || 'Cần kiểm tra'}</span>;
  return <span className="payroll-explanation-check" role="img" aria-label={label || 'Đã khớp'} title={label || 'Đã khớp'}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 10 3 3 6-6"/></svg></span>;
}

export function PayrollExplanationDialog({ employeeName, month, onClose }: Props) {
  const api = useMemo(() => createClientApiClient(), []);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const modalRef = useDialogFocusTrap<HTMLElement>({ active: true, onClose });
  const refreshRequestedRef = useRef('');
  const pollCountRef = useRef(0);
  const identityRef = useRef('');
  const [response, setResponse] = useState<PayrollExplanationResponse | null>(null);
  const [responseKey, setResponseKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);
  const swipeDismiss = useSwipeDismiss({ direction: 'down', onDismiss: onClose });

  useEffect(() => {
    const controller = new AbortController();
    let pollTimer = 0;
    const refreshKey = `${month}:${employeeName}`;
    if (identityRef.current !== refreshKey) {
      identityRef.current = refreshKey;
      refreshRequestedRef.current = '';
      pollCountRef.current = 0;
    }
    api.get<PayrollExplanationResponse>('getPayrollExplanation', {
      signal: controller.signal,
      params: { month, employee: employeeName, year: month.slice(-4) }
    }).then(async (result) => {
      if (controller.signal.aborted) return;
      setError('');
      setResponse(result);
      setResponseKey(refreshKey);
      if (!result.stale) return;
      if (refreshRequestedRef.current !== refreshKey) {
        await api.post<{ ok: true; queued: true }>('requestPayrollExplanationRefresh', {
          signal: controller.signal,
          body: { month }
        });
        if (controller.signal.aborted) return;
        refreshRequestedRef.current = refreshKey;
      }
      pollCountRef.current += 1;
      if (pollCountRef.current > 120) throw new Error('Giải trình chưa đồng bộ xong sau khoảng tám phút. Vui lòng thử lại.');
      pollTimer = window.setTimeout(() => setRequestKey((value) => value + 1), 4000);
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setResponseKey(refreshKey);
        setError(requestError instanceof Error ? requestError.message : 'Không tải được giải trình lương.');
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (pollTimer) window.clearTimeout(pollTimer); };
  }, [api, employeeName, month, requestKey]);

  useEffect(() => {
    document.body.classList.add('payroll-explanation-open');
    return () => document.body.classList.remove('payroll-explanation-open');
  }, []);

  const currentKey = `${month}:${employeeName}`;
  const currentResponse = responseKey === currentKey ? response : null;
  const displayLoading = loading || responseKey !== currentKey;
  const explanation = currentResponse?.explanation;
  const view = useMemo(() => explanation ? payrollExplanationView(explanation) : null, [explanation]);
  const retry = () => {
    refreshRequestedRef.current = '';
    pollCountRef.current = 0;
    setLoading(true);
    setError('');
    setResponse(null);
    setResponseKey('');
    setRequestKey((value) => value + 1);
  };

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="payroll-explanation-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section ref={modalRef} tabIndex={-1} className={`payroll-explanation-modal${swipeDismiss.closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="payroll-explanation-title" {...swipeDismiss.gestureProps}>
      <div className="payroll-explanation-swipe-handle" data-swipe-dismiss-handle aria-hidden="true"><span/></div>
      <header className="payroll-explanation-modal-head">
        <div className="payroll-explanation-modal-title"><p>Giải trình bảng lương</p><div className="payroll-explanation-title-row"><h2 id="payroll-explanation-title" ref={titleRef} tabIndex={-1}>{employeeName}</h2>{view?.status.tone === 'matched' ? <MatchStatus matched label="Dữ liệu lương đã khớp"/> : view ? <span className={`payroll-explanation-evidence-status is-${view.status.tone}`}>{view.status.label}</span> : null}</div><span>{view?.subtitle || month}</span></div>
        <div className="payroll-explanation-modal-actions" data-export-hidden>
          {view && explanation ? <button type="button" className="payroll-explanation-icon-button" aria-label="Xuất ảnh giải trình lương" title="Xuất ảnh" data-export-target=".payroll-explanation-modal" onClick={(event) => void exportCardAsImage(event.currentTarget, `giai-trinh-luong-${employeeName}-${month}`)}><Icon kind="image"/></button> : null}
          <button type="button" className="payroll-explanation-icon-button" aria-label="Đóng giải trình lương" title="Đóng" data-export-hidden onClick={onClose}><Icon kind="close"/></button>
        </div>
      </header>
      <div className="payroll-explanation-scroll" data-overlay-scroll>
        {displayLoading ? <div className="payroll-explanation-state" role="status"><span className="payroll-explanation-spinner"/>Đang tổng hợp dữ liệu giải trình…</div> : null}
        {!displayLoading && currentResponse?.stale && !error ? <div className="payroll-explanation-state" role="status" aria-live="polite"><span className="payroll-explanation-spinner"/><strong>Đang đồng bộ theo Báo cáo mới</strong><span>Dữ liệu cũ đã được ẩn để tránh giải trình sai. Hệ thống sẽ tự tải lại khi hoàn tất.</span></div> : null}
        {!displayLoading && error ? <div className="payroll-explanation-state payroll-explanation-error" role="alert"><strong>Không tải được giải trình</strong><span>{error}</span><button type="button" className="payroll-explanation-retry" onClick={retry}><Icon kind="retry"/>Thử lại</button></div> : null}
        {!displayLoading && view && explanation ? <article className="table-card payroll-explanation-card">
          <section className="payroll-explanation-section" aria-labelledby="payroll-summary-title"><h4 id="payroll-summary-title">Tổng quan</h4><div className="payroll-explanation-summary">{view.summary.map((item) => <div key={item.label}><span>{item.label}</span><strong className={item.tone ? `is-${item.tone}` : undefined}>{item.value}</strong></div>)}</div></section>
          {!view.compactRoleOnly ? <section className="payroll-explanation-section" aria-labelledby="payroll-components-title"><h4 id="payroll-components-title">Các thành phần lương</h4><div className="payroll-explanation-components">{view.components.map((item) => <div key={item.label}><span>{item.label}</span><strong className={item.tone ? `is-${item.tone}` : undefined}>{item.value}</strong></div>)}</div><p className="payroll-explanation-formula">Thực nhận = Tổng lương − Ứng lương − Phạt − BHXH</p></section> : null}
          {view.roleEvidence ? <section className="payroll-explanation-section payroll-explanation-role-evidence" aria-labelledby="payroll-role-evidence-title">
            <h4 id="payroll-role-evidence-title">{view.roleEvidence.title}</h4>
            <p className="payroll-explanation-section-help">{view.roleEvidence.help}</p>
            <div className="payroll-explanation-role-summary">{view.roleEvidence.summary.map((item) => <div key={item.label}><span>{item.label}</span><strong className={item.tone ? `is-${item.tone}` : undefined}>{item.value}</strong></div>)}</div>
            {view.roleEvidence.kind === 'manager' ? <><h5 className="payroll-explanation-role-subtitle">Thưởng KPI theo xe và dự án</h5><div className="payroll-explanation-table-wrap payroll-explanation-role-table-wrap"><table className="payroll-explanation-role-table"><thead><tr><th>Xe</th><th>Dự án</th><th className="is-trip-column">Chuyến</th><th>Mốc 112</th><th>Mốc 140</th><th>Mốc 168</th><th>Thưởng KPI</th><th>Ngày QL</th></tr></thead><tbody>{view.roleEvidence.managerVehicles.flatMap((vehicle) => vehicle.projects.map((project, index) => <tr key={`${vehicle.vehicle}-${project.project}-${index}`}>{index === 0 ? <td rowSpan={vehicle.projects.length}><strong>{vehicle.vehicle}</strong></td> : null}<td>{project.project}</td><td className="is-trip-column">{project.trips}</td><td>{project.milestone112}</td><td>{project.milestone140}</td><td>{project.milestone168}</td><td>{project.bonus}</td><td>{project.days}</td></tr>))}</tbody></table></div></> : null}
            {view.roleEvidence.recruitedPeople.length ? <><h5 className="payroll-explanation-role-subtitle">Thưởng tuyển người</h5><div className="payroll-explanation-table-wrap payroll-explanation-role-table-wrap"><table className="payroll-explanation-recruit-table"><thead><tr><th>Nhân sự được tuyển</th><th>Số ngày</th><th>Tiền thưởng</th><th>Kỳ tính thưởng</th><th>Công ty</th></tr></thead><tbody>{view.roleEvidence.recruitedPeople.map((row, index) => <tr key={`${row.employeeName}-${row.rewardPeriod}-${index}`}><td>{row.employeeName}</td><td>{row.eligibleDays}</td><td>{row.bonus}</td><td>{row.rewardPeriod}</td><td>{row.company}</td></tr>)}</tbody></table></div></> : null}
          </section> : null}
          {!view.compactRoleOnly ? <section className="payroll-explanation-section" aria-labelledby="payroll-lines-title">
            <h4 id="payroll-lines-title">Lương chuyến theo xe</h4>
            {view.salaryLines.length ? <div className="payroll-explanation-lines">{view.salaryLines.map((line, index) => <section className="payroll-explanation-line" key={`${line.vehicle}-${index}`} aria-label={`Giải trình xe ${line.vehicle}`}>
              <div className="payroll-explanation-line-head">
                <div><span className="payroll-explanation-vehicle-label">Biển số xe</span><strong>{line.vehicle}</strong><span>{line.operationsGroup} · {line.type}</span></div>
                {line.dailyStatus.tone !== 'matched' ? <span className={`payroll-explanation-evidence-status is-${line.dailyStatus.tone}`}>{line.dailyStatus.label}</span> : null}
              </div>
              <div className="payroll-explanation-line-summary">
                <div><span>Số chuyến</span><strong>{line.trips}</strong></div>
                <div><span>Đơn giá</span><strong>{line.rate}</strong></div>
                <div><span>Lương chuyến</span><strong className="is-positive">{line.salary}</strong></div>
                <div><span>Điều chỉnh KPI</span><strong>{line.kpi}</strong></div>
              </div>
              {line.breakdown ? <div className="payroll-explanation-evidence-block"><h5>Tổng hợp theo loại lái</h5><div className="payroll-explanation-table-wrap"><table className="payroll-explanation-breakdown-table"><thead><tr><th>Loại</th><th>Số ngày</th><th>Số chuyến</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{line.breakdown.map((row) => <tr key={row.label} className={row.tone === 'total' ? 'is-total' : undefined}><td>{row.label}</td><td>{row.days}</td><td>{row.trips}</td><td>{row.rate}</td><td>{row.salary}</td></tr>)}</tbody></table></div></div> : null}
              {line.rateBasis || line.dailyEvidence.length ? <details className="payroll-explanation-details"><summary><span>Xem cách tính chi tiết</span><small>{line.dailyEvidence.length ? `${line.dailyEvidence.length} ngày chạy` : 'Cơ sở đơn giá'}</small></summary>
                {line.rateBasis ? <div className="payroll-explanation-evidence-block"><h5>Cơ sở chọn đơn giá</h5><p className="payroll-explanation-evidence-help">Số chuyến dùng chọn giá chỉ tính trong thời gian tài xế còn làm việc. Nếu nghỉ giữa tháng, chuyến sau ngày nghỉ không dùng để chọn bậc; sau đó hệ thống cộng điều chỉnh KPI.</p><div className="payroll-explanation-rate-basis">{line.rateBasis.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></div> : null}
                {line.dailyEvidence.length ? <div className="payroll-explanation-evidence-block"><h5>Chi tiết từng ngày</h5><div className="payroll-explanation-table-wrap payroll-explanation-daily-wrap"><table className="payroll-explanation-daily-table"><thead><tr><th>Ngày</th><th>Số lái</th><th>Loại</th><th>Chuyến cá nhân</th><th>Tổng chuyến xe</th><th>Đơn giá</th><th>Thành tiền</th><th>Kiểm tra</th></tr></thead><tbody>{line.dailyEvidence.map((row, rowIndex) => <tr key={`${row.date}-${rowIndex}`}><td>{row.date}</td><td>{row.driverCount}</td><td>{row.type}</td><td>{row.individualTrips}</td><td>{row.vehicleTrips}</td><td>{row.rate}</td><td>{row.amount}</td><td><MatchStatus matched={row.matched} label={row.status}/></td></tr>)}</tbody></table></div></div> : null}
              </details> : null}
              {line.warnings.length ? <div className="payroll-explanation-line-warnings" role="note"><strong>Cảnh báo chi tiết</strong><ul>{line.warnings.map((warning, warningIndex) => <li key={warningIndex}>{warning}</li>)}</ul></div> : null}
            </section>)}</div> : <div className="payroll-explanation-role-note"><strong>Không có lương chuyến theo xe</strong><span>Các khoản tạo nên mức thực nhận được liệt kê ở phần “Các thành phần lương” phía trên.</span></div>}
          </section> : null}
          {!view.compactRoleOnly && view.attendance.length ? <section className="payroll-explanation-section" aria-labelledby="payroll-attendance-title"><h4 id="payroll-attendance-title">Nghỉ phép và giảm trừ</h4><div className="payroll-explanation-table-wrap"><table><thead><tr><th>Thời gian</th><th>Loại</th><th>Số ngày</th><th>Xử lý lương cứng</th><th>Ghi chú</th></tr></thead><tbody>{view.attendance.map((row, index) => <tr key={`${row.period}-${index}`}><td>{row.period}</td><td>{row.type}</td><td>{row.days}</td><td>{row.treatment}</td><td>{row.note}</td></tr>)}</tbody></table></div></section> : null}
          <details className="payroll-explanation-audit"><summary><span>Kiểm tra dữ liệu nguồn</span><small>{view.status.label}</small></summary><div className="payroll-explanation-section" aria-labelledby="payroll-reconciliation-title"><h4 id="payroll-reconciliation-title">Đối chiếu với bảng lương</h4><div className="payroll-explanation-table-wrap payroll-explanation-reconciliation-wrap"><table><thead><tr><th>Thành phần</th><th>Tính lại</th><th>BC_BangLuong</th><th>Chênh lệch</th><th>Trạng thái</th></tr></thead><tbody>{view.reconciliation.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.calculated}</td><td>{item.reported}</td><td>{item.difference}</td><td><MatchStatus matched={item.matched}/></td></tr>)}</tbody></table></div></div></details>
          {view.warnings.length ? <section className="payroll-explanation-warnings" role="note" aria-labelledby="payroll-warnings-title"><h4 id="payroll-warnings-title">Cần kiểm tra</h4><ul>{view.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section> : null}
          <footer className="payroll-explanation-source-note">{view.footer}</footer>
        </article> : null}
      </div>
    </section>
  </div>, document.body);
}
