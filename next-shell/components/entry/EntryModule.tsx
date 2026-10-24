'use client';
import { ENTRY_FIELD_SPANS, type BusinessField } from '../../lib/platform/business-form-schema';
import { fuelAmountPreview, formatFuelAmountPreview } from '../../lib/platform/fuel-amount-preview';
import { BusinessButton, BusinessGrid, BusinessFieldControl, BusinessAmountSummary } from '../platform/BusinessPrimitives';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { createRetrySafeWriteClient } from '../../lib/platform/retry-safe-write-client';
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
      ['sourcePay', 'Nguồn chi', 'fuelPaymentSources', false],
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
const CANCELED_JOB_PREFIX = 'CANCELED_BY_OPERATOR:';
const catalogsForAllForms = (value: EntryCatalogs) => Object.fromEntries(FORM_TYPES.map((type) => [type, value])) as Record<string, EntryCatalogs>;
const isActiveEntryJob = (job: WriteJob) => ['pending', 'processing', 'failed'].includes(job.status) && !String(job.lastError || '').startsWith(CANCELED_JOB_PREFIX);
const isWorkbookJob = (job: WriteJob, year: string, activeYear: string) => job.payload?.year ? job.payload.year === year : year === activeYear;
const jobFormLabel = (job: WriteJob) => {
  const formType = job.payload?.formType;
  return formType && FORMS[formType] ? FORMS[formType].label : 'Nhập liệu';
};
function options(c: EntryCatalogs, source: string) {
  const item = (value: string, label = value) => ({ value, label });
  if (source === 'vehicles') return (c.activeVehicles?.length ? c.activeVehicles : c.vehicles || []).map((x) => item(x.plate || '')).filter((x) => x.value);
  if (source === 'projects') return (c.projects || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'operationGroups') return (c.operationGroups || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'stopVehicles') return [item('TẤT CẢ XE'), ...(c.activeVehicles?.length ? c.activeVehicles : c.vehicles || []).map((x) => item(x.plate || '')).filter((x) => x.value)];
  if (source === 'drivers') return (c.activeDrivers?.length ? c.activeDrivers : c.people || []).map((x) => item(x.name || '')).filter((x) => x.value);
  if (source === 'people') return (c.activePeople?.length ? c.activePeople : c.people || []).map((x) => item(x.name || '')).filter((x) => x.value);
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



export function EntryModule({ initialCatalogs, initialError = '', initialForm = 'vanChuyen', onClose, onSubmitted, onDirtyChange }: { initialCatalogs: EntryCatalogs; initialError?: string; initialForm?: EntryFormType; onClose?: () => void; onSubmitted?: (submission: { form: EntryFormType; rows: EntryRow[] }) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const hasInitialCatalogs = Object.keys(initialCatalogs).length > 0;
  const context = useWorkbookContext();
  const [writeApi] = useState(() => createRetrySafeWriteClient(api));
  const [form, setForm] = useState<EntryFormType>(initialForm);
  const [catalogs, setCatalogs] = useState<Record<string, EntryCatalogs>>(hasInitialCatalogs ? catalogsForAllForms(initialCatalogs) : {});
  const initialCatalogsRequested = useRef(Object.keys(initialCatalogs).length > 0);
  const [rows, setRows] = useState<EntryRow[]>([blank(initialForm)]);
  const [jobs, setJobs] = useState<WriteJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(!hasInitialCatalogs);
  const [message, setMessage] = useState(initialError);
  const [error, setError] = useState(Boolean(initialError));
  const formTabsRef = useRef<HTMLElement | null>(null);
  const report = (text: string, isError = false) => {
    setMessage(text);
    setError(isError);
    showToast(text, isError ? 'error' : 'success');
  };
  const currentCatalogs = catalogs[form] || {};
  const config = FORMS[form];
  const canWrite = !context.workbook.readOnly && (context.user.role === 'admin' || context.user.role === 'operator');
  useEffect(() => {
    if (!canWrite || initialCatalogsRequested.current) return;
    initialCatalogsRequested.current = true;
    let active = true;
    setCatalogLoading(true);
    api
      .get<EntryCatalogs & { catalogs?: EntryCatalogs }>('getCatalogs', { params: { formType: '', year: context.workbook.year } })
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
  }, [canWrite, context.workbook.year]);
  useEffect(() => {
    publishDataSourceMeta(initialCatalogs);
  }, [initialCatalogs]);
  useEffect(() => {
    if (!canWrite) return;
    let active = true;
    api
      .get<{ jobs?: WriteJob[] }>('getRecentWriteJobs', { params: { module: 'transport', actionName: 'submitRows', limit: '12', year: context.workbook.year } })
      .then((res) => {
        if (active) setJobs((res.jobs || []).filter(isActiveEntryJob).filter((job) => isWorkbookJob(job, context.workbook.year, context.workbook.activeYear)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canWrite, context.workbook.activeYear, context.workbook.year]);
  useEffect(() => {
    const pending = jobs.filter((j) => j.jobId && ['pending', 'processing'].includes(j.status));
    if (!pending.length) return;
    const timer = window.setTimeout(() => {
      Promise.all(pending.map((j) => api.get<WriteJob | { job: WriteJob }>('getWriteJobStatus', { params: { jobId: j.jobId } }).then(normalizeJob)))
        .then((updated) => setJobs((old) => old.map((job) => ({ ...job, ...(updated.find((item) => item.jobId === job.jobId) || {}) })).filter(isActiveEntryJob)))
        .catch(() => {});
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [jobs]);
  const valid = useMemo(() => rows.every((row) => config.fields.every(([key, , , required = true]) => !required || String(row[key] || '').trim())), [rows, config]);
  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify([blank(form)]), [form, rows]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  const switchForm = (type: EntryFormType) => {
    setForm(type);
    setRows([blank(type)]);
    setMessage('');
    setError(false);
  };
  useEffect(() => {
    const activeTab = formTabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    activeTab?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [form]);
  const handleFormTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % FORM_TYPES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + FORM_TYPES.length) % FORM_TYPES.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = FORM_TYPES.length - 1;
    else return;
    event.preventDefault();
    switchForm(FORM_TYPES[nextIndex]);
    window.requestAnimationFrame(() => formTabsRef.current?.querySelector<HTMLElement>(`#entry-form-tab-${FORM_TYPES[nextIndex]}`)?.focus());
  };
  const update = (index: number, key: string, value: string) => setRows((old) => old.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const submit = async () => {
    if (!valid) return report('Vui lòng điền đủ các trường bắt buộc.', true);
    setBusy(true);
    setError(false);
    setMessage('Đang gửi lệnh ghi dữ liệu…');
    showToast('Đang gửi lệnh ghi dữ liệu…', 'loading');
    try {
      const submittedRows = rows.map((row) => ({ ...row }));
      const queued = { ...normalizeJob(await writeApi.post<WriteJob>('submitRows', { body: { year: context.workbook.year, formType: form, rows } })), payload: { formType: form, year: context.workbook.year } };
      if (!queued.jobId) throw new Error('API không trả về mã write job.');
      setJobs((old) => [queued, ...old.filter((j) => j.jobId !== queued.jobId)].slice(0, 12));
      setRows([blank(form)]);
      report('Đã nhận lệnh. Dữ liệu sẽ được đồng bộ nền.');
      void api.post('processWriteJobs', { body: { maxJobs: 2 } }).catch(() => {});
      if (onSubmitted) onSubmitted({ form, rows: submittedRows });
      else onClose?.();
    } catch (submitError) {
      report(submitError instanceof Error ? submitError.message : String(submitError), true);
    } finally {
      setBusy(false);
    }
  };
  const retry = async (jobId: string) => {
    showToast('Đang đưa lệnh về hàng chờ…', 'loading');
    try {
      const job = normalizeJob(await api.post<WriteJob>('retryWriteJob', { body: { jobId, year: context.workbook.year } }));
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
            <p>{context.workbook.readOnly ? `Năm ${context.workbook.year} đã lưu trữ và chỉ được xem.` : 'Tài khoản cổ đông chỉ được xem dữ liệu Vận hành.'}</p>
          </div>
        </div>
      </section>
    );
  return (
    <section id="entryShell" className="entry-shell entry-shell-visible" data-next-entry="true" aria-labelledby="entry-title">
      <aside ref={formTabsRef} className="form-list entry-form-tabs" role="tablist" aria-label="Loại chứng từ">
        {FORM_TYPES.map((type, index) => (
          <button type="button" id={`entry-form-tab-${type}`} role="tab" aria-controls="entry-form-panel" aria-selected={form === type} tabIndex={form === type ? 0 : -1} className={`form-tab${form === type ? ' active' : ''}`} onClick={() => switchForm(type)} onKeyDown={(event) => handleFormTabKeyDown(event, index)} key={type}>
            <span className="form-tab-icon">{String(index + 1).padStart(2, '0')}</span>
            <span>
              <span className="form-tab-title">{FORMS[type].label}</span>
              <span className="form-tab-note">{FORMS[type].note}</span>
            </span>
          </button>
        ))}
      </aside>
      <section id="entry-form-panel" className="panel grow entry-panel" role="tabpanel" aria-labelledby={`entry-form-tab-${form}`}>
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
                  <BusinessButton variant="outline" type="button" className="btn-table-action entry-danger" title="Xóa dòng" aria-label={`Xóa dòng ${index + 1}`} onClick={() => setRows((old) => old.filter((_, i) => i !== index))}>
                    <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </BusinessButton>
                ) : null}
              </header>
              <BusinessGrid>
                {config.fields.map(([key, label, kind, required = true]) => {
                  const searchable = kind === 'vehicles' || kind === 'drivers';
                  const datalistId = `entry-${form}-${kind}-${index}`;
                  const choices = options(currentCatalogs, kind);
                  const field: BusinessField = { key, label, required, span: ENTRY_FIELD_SPANS[form]?.[key] || 'full', kind: searchable ? 'text' : ['text','number','date','textarea'].includes(kind) ? kind as BusinessField['kind'] : 'select' };
                  return <div key={key} data-span={field.span} style={{ minWidth: 0, gridColumn: field.span === 'full' ? '1 / -1' : undefined }}>
                    <BusinessFieldControl field={field} value={row[key] || ''} disabled={catalogLoading && !['text','number','date','textarea'].includes(kind)} options={choices.map(option=>option.value)} optionLabels={Object.fromEntries(choices.map(option=>[option.value,option.label]))} inputList={searchable ? datalistId : undefined} placeholder={searchable ? 'Chọn hoặc nhập' : undefined} onChange={value=>update(index,key,kind==='number'?formatVietnameseNumberInput(value):value)}/>
                    {searchable ? <datalist id={datalistId}>{choices.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</datalist> : null}
                  </div>;
                })}
              </BusinessGrid>
              {form === 'dau' ? <BusinessAmountSummary value={formatFuelAmountPreview(fuelAmountPreview(row.liters || '',row.price || ''))} hint="Số lít × đơn giá. Đây là thành tiền dầu, chưa xác nhận đã thanh toán."/> : null}
            </article>
          ))}
        </div>
        <div className="submit-bar">
          <BusinessButton variant="primary" type="button" className="grow" id="submitBtn" onClick={() => void submit()} disabled={busy || !valid}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {busy ? 'Đang gửi…' : 'Cập nhật'}
          </BusinessButton>
          <BusinessButton variant="ghost" type="button" className="icon-button" id="cloneBtn" title="Nhân bản dòng cuối" aria-label="Nhân bản dòng cuối" onClick={() => setRows((old) => [...old, { ...old.at(-1)! }])}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </BusinessButton>
          <BusinessButton variant="secondary" type="button" className="icon-button" id="addBtn" title="Thêm dòng" aria-label="Thêm dòng" onClick={() => setRows((old) => [...old, blank(form)])}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </BusinessButton>
          {onClose ? (
            <BusinessButton variant="outline" type="button" id="closeMobileEntryBtn" className="icon-button" title="Hủy bỏ/Đóng" aria-label="Hủy bỏ/Đóng" onClick={onClose}>
              <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </BusinessButton>
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
                  <strong>{job.status} · {jobFormLabel(job)}</strong>
                  <code>{job.jobId}</code>
                  {job.lastError ? <p>{job.lastError}</p> : null}
                </div>
                {job.status === 'failed' ? (
                  <BusinessButton variant="outline" type="button"  onClick={() => void retry(job.jobId)}>
                    Thử lại
                  </BusinessButton>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
