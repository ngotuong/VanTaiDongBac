'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { formatVietnameseNumberInput } from '../../lib/platform/numeric-input';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import type { EntryCatalogs, EntryFormType, EntryRow, WriteJob } from '../../lib/platform/entry-types';
import { showToast } from '../../lib/platform/toast';

const FORMS: Record<EntryFormType, { label: string; note: string; fields: Array<[string, string, string, boolean?]> }> = {
  vanChuyen: {
    label: 'Vận chuyển',
    note: 'Số chuyến theo xe & dự án',
    fields: [
      ['date', 'Ngày', 'date'],
      ['vehicle', 'Biển số', 'vehicles'],
      ['project', 'Dự án', 'projects'],
      ['trips', 'Số chuyến', 'number'],
      ['tickets', 'Số phiếu', 'text', false],
      ['note', 'Ghi chú', 'textarea', false],
      ['actualVolume', 'Khối lượng thực tế (m³)', 'number', false],
    ],
  },
  taiXe: {
    label: 'Tài xế',
    note: 'Ghi nhận chuyến theo nhóm vận hành',
    fields: [
      ['date', 'Ngày', 'date'],
      ['vehicle', 'Biển số', 'vehicles'],
      ['operationGroup', 'Nhóm vận hành', 'operationGroups'],
      ['driver', 'Tài xế', 'drivers'],
      ['trips', 'Số chuyến', 'number'],
      ['note', 'Ghi chú', 'textarea', false],
    ],
  },
  dau: {
    label: 'Dầu lẻ',
    note: 'Nhiên liệu và giá dầu áp dụng',
    fields: [
      ['date', 'Ngày tiếp dầu', 'date'],
      ['vehicle', 'Biển số xe nhận', 'vehicles'],
      ['source', 'Nguồn cung cấp', 'fuelSources'],
      ['liters', 'Số lít dầu', 'number'],
      ['price', 'Giá dầu / lít', 'number'],
      ['sourcePay', 'Nguồn chi', 'fuelPaymentSources'],
      ['note', 'Ghi chú', 'textarea', false],
    ],
  },
  chamCong: {
    label: 'Chấm công',
    note: 'Nghỉ phép, trừ công, nghỉ việc',
    fields: [
      ['fromDate', 'Từ ngày', 'date'],
      ['toDate', 'Đến ngày (Gồm cả)', 'date'],
      ['person', 'Nhân sự nghỉ', 'people'],
      ['workdayType', 'Loại ngày nghỉ', 'chamCongTypes'],
      ['note', 'Ghi chú thêm', 'textarea', false],
    ],
  },
  phat: {
    label: 'Phạt nội bộ',
    note: 'Khấu trừ vi phạm nội bộ',
    fields: [
      ['date', 'Ngày lập biên bản', 'date'],
      ['person', 'Nhân sự vi phạm', 'people'],
      ['penaltyCode', 'Mã vi phạm nội bộ', 'penalties'],
      ['note', 'Ghi chú nội dung', 'textarea', false],
    ],
  },
  nghiVanHanh: {
    label: 'Nghỉ vận hành',
    note: 'Báo nghỉ mỏ & giảm KPI',
    fields: [
      ['date', 'Ngày báo nghỉ', 'date'],
      ['vehicle', 'Phạm vi xe nghỉ', 'stopVehicles'],
      ['operationGroup', 'Nhóm vận hành', 'operationGroups'],
      ['stopType', 'Lý do dừng máy', 'nghiVanHanhTypes'],
      ['hours', 'Số giờ dừng máy', 'number'],
      ['note', 'Ghi chú chi tiết', 'textarea', false],
    ],
  },
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = (type: EntryFormType): EntryRow => Object.fromEntries(FORMS[type].fields.map(([key, , kind]) => [key, kind === 'date' ? today() : '']));
const api = createClientApiClient();
const FORM_TYPES = Object.keys(FORMS) as EntryFormType[];
const catalogsForAllForms = (value: EntryCatalogs) => Object.fromEntries(FORM_TYPES.map((type) => [type, value])) as Record<string, EntryCatalogs>;
function options(c: EntryCatalogs, source: string) {
  const item = (value: string, label = value) => ({ value, label });
  if (source === 'vehicles') return (c.activeVehicles?.length ? c.activeVehicles : c.vehicles || []).map((x) => item(x.plate || '')).filter((x) => x.value);
  if (source === 'projects') return (c.projects || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'operationGroups') return (c.operationGroups || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'stopVehicles') return [item('TẤT CẢ XE'), ...(c.activeVehicles?.length ? c.activeVehicles : c.vehicles || []).map((x) => item(x.plate || '')).filter((x) => x.value)];
  if (source === 'drivers') return (c.activeDrivers?.length ? c.activeDrivers : c.people || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'people') return (c.activePeople?.length ? c.activePeople : c.people || []).map((x) => item(x.name || '', `${x.name || ''}${x.role ? ' - ' + x.role : ''}`)).filter((x) => x.value);
  if (source === 'penalties') return (c.activePenalties || []).map((x) => item(x.code || '', `${x.code || ''} - ${x.content || ''}`)).filter((x) => x.value);
  if (source === 'fuelSources') return (c.fuelSources || []).map((x) => item(x));
  if (source === 'fuelPaymentSources') return (c.fuelPaymentSources || []).map((x) => item(x));
  if (source === 'chamCongTypes') return (c.chamCongTypes || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'nghiVanHanhTypes') return (c.nghiVanHanhTypes || []).map((x) => item(x));
  return [];
}
function normalizeJob(value: unknown): WriteJob {
  const raw = value as { job?: WriteJob } & WriteJob;
  return raw.job || raw;
}

function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return 'Chọn ngày';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return isoDate;
}

export function EntryModule({ initialCatalogs, initialError = '', initialForm = 'vanChuyen', onClose }: { initialCatalogs: EntryCatalogs; initialError?: string; initialForm?: EntryFormType; onClose?: () => void }) {
  const hasInitialCatalogs = Object.keys(initialCatalogs).length > 0;
  const context = useWorkbookContext();
  const [form, setForm] = useState<EntryFormType>(initialForm);
  const [catalogs, setCatalogs] = useState<Record<string, EntryCatalogs>>(hasInitialCatalogs ? catalogsForAllForms(initialCatalogs) : {});
  const initialCatalogsRequested = useRef(Object.keys(initialCatalogs).length > 0);
  const [rows, setRows] = useState<EntryRow[]>([blank(initialForm)]);
  const [jobs, setJobs] = useState<WriteJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(!hasInitialCatalogs);
  const [message, setMessage] = useState(initialError);
  const [error, setError] = useState(Boolean(initialError));
  const report = (text: string, isError = false) => {
    setMessage(text);
    setError(isError);
    showToast(text, isError ? 'error' : 'success');
  };
  const currentCatalogs = catalogs[form] || {};
  const config = FORMS[form];
  const canWrite = context.user.role === 'admin' || context.user.role === 'operator';
  useEffect(() => {
    if (!canWrite || initialCatalogsRequested.current) return;
    initialCatalogsRequested.current = true;
    let active = true;
    setCatalogLoading(true);
    api
      .get<EntryCatalogs & { catalogs?: EntryCatalogs }>('getCatalogs', { params: { formType: '' } })
      .then((res) => {
        if (active) setCatalogs(catalogsForAllForms(res.catalogs || res));
      })
      .catch((loadError) => {
        if (active) {
          const text = loadError instanceof Error ? loadError.message : String(loadError);
          setMessage(text);
          setError(true);
          showToast(text, 'error');
        }
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canWrite]);
  useEffect(() => {
    publishDataSourceMeta(initialCatalogs);
  }, [initialCatalogs]);
  useEffect(() => {
    if (!canWrite) return;
    let active = true;
    api
      .get<{ jobs?: WriteJob[] }>('getRecentWriteJobs', { params: { module: 'transport', actionName: 'submitRows', limit: '12' } })
      .then((res) => {
        if (active) setJobs((res.jobs || []).filter((j) => ['pending', 'processing', 'failed'].includes(j.status)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canWrite]);
  useEffect(() => {
    const pending = jobs.filter((j) => j.jobId && ['pending', 'processing'].includes(j.status));
    if (!pending.length) return;
    const timer = window.setTimeout(() => {
      Promise.all(pending.map((j) => api.get<WriteJob | { job: WriteJob }>('getWriteJobStatus', { params: { jobId: j.jobId } }).then(normalizeJob)))
        .then((updated) => setJobs((old) => old.map((job) => updated.find((item) => item.jobId === job.jobId) || job).filter((job) => job.status !== 'synced')))
        .catch(() => {});
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [jobs]);
  const valid = useMemo(() => rows.every((row) => config.fields.every(([key, , , required = true]) => !required || String(row[key] || '').trim())), [rows, config]);
  const switchForm = (type: EntryFormType) => {
    setForm(type);
    setRows([blank(type)]);
    setMessage('');
    setError(false);
  };
  const update = (index: number, key: string, value: string) => setRows((old) => old.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const submit = async () => {
    if (!valid) return report('Vui lòng điền đủ các trường bắt buộc.', true);
    setBusy(true);
    setError(false);
    setMessage('Đang gửi lệnh ghi dữ liệu…');
    showToast('Đang gửi lệnh ghi dữ liệu…', 'loading');
    try {
      const queued = normalizeJob(await api.post<WriteJob>('submitRows', { body: { formType: form, rows } }));
      if (!queued.jobId) throw new Error('API không trả về mã write job.');
      setJobs((old) => [queued, ...old.filter((j) => j.jobId !== queued.jobId)].slice(0, 12));
      setRows([blank(form)]);
      report('Đã nhận lệnh. Dữ liệu sẽ được đồng bộ nền.');
      void api.post('processWriteJobs', { body: { maxJobs: 2 } }).catch(() => {});
      onClose?.();
    } catch (submitError) {
      report(submitError instanceof Error ? submitError.message : String(submitError), true);
    } finally {
      setBusy(false);
    }
  };
  const retry = async (jobId: string) => {
    showToast('Đang đưa lệnh về hàng chờ…', 'loading');
    try {
      const job = normalizeJob(await api.post<WriteJob>('retryWriteJob', { body: { jobId } }));
      setJobs((old) => old.map((item) => (item.jobId === jobId ? job : item)));
      report(`Đã đưa job ${jobId} về hàng chờ.`);
      void api.post('processWriteJobs', { body: { maxJobs: 2 } }).catch(() => {});
    } catch (retryError) {
      report(retryError instanceof Error ? retryError.message : String(retryError), true);
    }
  };
  if (!canWrite)
    return (
      <section className="entry-shell">
        <div className="panel entry-permission" role="alert">
          <div className="panel-body">
            <h2>Không có quyền nhập liệu</h2>
            <p>Tài khoản cổ đông chỉ được xem dữ liệu Vận hành.</p>
          </div>
        </div>
      </section>
    );
  return (
    <section id="entryShell" className="entry-shell entry-shell-visible" data-next-entry="true" aria-labelledby="entry-title">
      <aside className="form-list" role="tablist" aria-label="Loại chứng từ">
        {FORM_TYPES.map((type, index) => (
          <button type="button" role="tab" aria-selected={form === type} className={`form-tab${form === type ? ' active' : ''}`} onClick={() => switchForm(type)} key={type}>
            <span className="form-tab-icon">{String(index + 1).padStart(2, '0')}</span>
            <span>
              <span className="form-tab-title">{FORMS[type].label}</span>
              <span className="form-tab-note">{FORMS[type].note}</span>
            </span>
          </button>
        ))}
      </aside>
      <section className="panel grow entry-panel">
        <div className="panel-head" data-swipe-dismiss-handle={onClose ? true : undefined}>
          <div>
            <h2 className="panel-title" id="entry-title">
              Nhập {config.label.toLocaleLowerCase('vi-VN')}
            </h2>
            <div className="panel-note">
              {config.note} · {rows.length} dòng kê
            </div>
          </div>
        </div>
        {message || catalogLoading ? (
          <div className={`status show ${error ? 'err' : message ? 'ok' : 'warn'}`} role={error ? 'alert' : 'status'} aria-live="polite">
            {message || 'Đang tải danh mục từ bộ nhớ đệm…'}
          </div>
        ) : null}
        <div className="panel-body entry-rows" id="rows" aria-busy={catalogLoading}>
          {rows.map((row, index) => (
            <article className="entry-row" key={index}>
              <header className="entry-row-head">
                <div className="entry-row-title">
                  <span className="row-number">{index + 1}</span>Dòng chứng từ {index + 1}
                </div>
                {rows.length > 1 ? (
                  <button type="button" className="outline btn-table-action entry-danger" title="Xóa dòng" aria-label={`Xóa dòng ${index + 1}`} onClick={() => setRows((old) => old.filter((_, i) => i !== index))}>
                    <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                ) : null}
              </header>
              <div className="fields">
                {config.fields.map(([key, label, kind, required = true]) => {
                  const isSearchableCatalog = kind === 'vehicles' || kind === 'drivers';
                  const datalistId = `entry-${form}-${kind}-${index}`;
                  return (
                    <label className={kind === 'textarea' || key === 'tickets' ? 'full' : ''} key={key}>
                      <span>
                        {label}
                        {required ? ' *' : ''}
                      </span>
                      {kind === 'textarea' ? (
                        <textarea value={row[key] || ''} onChange={(e) => update(index, key, e.target.value)} />
                      ) : kind === 'date' ? (
                        <div className="custom-date-box">
                          <span className="date-display-text">{formatDisplayDate(row[key] || '')}</span>
                          <input type="date" className="native-date-input vi-date-input" value={row[key] || ''} onChange={(e) => update(index, key, e.target.value)} />
                        </div>
                      ) : isSearchableCatalog ? (
                        <>
                          <input className="entry-searchable-catalog" type="text" list={datalistId} autoComplete="off" disabled={catalogLoading} value={row[key] || ''} placeholder={catalogLoading ? 'Đang tải danh mục…' : `Chọn hoặc nhập ${label.toLocaleLowerCase('vi-VN')}`} onChange={(e) => update(index, key, e.target.value)} />
                          <datalist id={datalistId}>
                            {options(currentCatalogs, kind).map((option) => (
                              <option value={option.value} key={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </datalist>
                        </>
                      ) : ['text', 'number'].includes(kind) ? (
                        <input type={kind === 'number' ? 'text' : kind} inputMode={kind === 'number' ? 'decimal' : key === 'tickets' ? 'text' : undefined} autoCapitalize={key === 'tickets' ? 'none' : undefined} value={row[key] || ''} onChange={(e) => update(index, key, kind === 'number' ? formatVietnameseNumberInput(e.target.value) : e.target.value)} />
                      ) : (
                        <select value={row[key] || ''} disabled={catalogLoading} onChange={(e) => update(index, key, e.target.value)}>
                          <option value="">{catalogLoading ? 'Đang tải danh mục…' : `Chọn ${label.toLocaleLowerCase('vi-VN')}`}</option>
                          {options(currentCatalogs, kind).map((option) => (
                            <option value={option.value} key={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
        <div className="submit-bar">
          <button type="button" className="primary grow" id="submitBtn" onClick={() => void submit()} disabled={busy || !valid}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {busy ? 'Đang gửi…' : 'Cập nhật'}
          </button>
          <button type="button" className="ghost icon-button" id="cloneBtn" title="Nhân bản dòng cuối" aria-label="Nhân bản dòng cuối" onClick={() => setRows((old) => [...old, { ...old.at(-1)! }])}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button type="button" className="secondary icon-button" id="addBtn" title="Thêm dòng" aria-label="Thêm dòng" onClick={() => setRows((old) => [...old, blank(form)])}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {onClose ? (
            <button type="button" id="closeMobileEntryBtn" className="outline icon-button" title="Hủy bỏ/Đóng" aria-label="Hủy bỏ/Đóng" onClick={onClose}>
              <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>
      </section>
      {jobs.length ? (
        <section className="panel entry-job-panel" aria-labelledby="job-title">
          <div className="panel-head">
            <div>
              <h2 className="panel-title" id="job-title">
                Trạng thái đồng bộ
              </h2>
              <div className="panel-note">Pending → processing → synced hoặc failed</div>
            </div>
          </div>
          <div className="panel-body entry-jobs">
            {jobs.map((job) => (
              <article key={job.jobId}>
                <div>
                  <strong>{job.status}</strong>
                  <code>{job.jobId}</code>
                  {job.lastError ? <p>{job.lastError}</p> : null}
                </div>
                {job.status === 'failed' ? (
                  <button type="button" className="outline" onClick={() => void retry(job.jobId)}>
                    Thử lại
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
