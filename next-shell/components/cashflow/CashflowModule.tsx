'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { exportCardAsImage } from '../../lib/platform/export-card';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { formatVietnameseNumberInput } from '../../lib/platform/numeric-input';
import { showToast } from '../../lib/platform/toast';
import type { CashflowInitialData, CashflowTab, FundCatalog, FundCatalogRow, FundLoan, FundLoans, FundOptions, FundOverview, FundSettings, FundTransaction, FundTransactions, FundWriteJob } from '../../lib/platform/cashflow-types';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import { useSwipeDismiss } from '../platform/useSwipeDismiss';
import { useVisibleRevalidation } from '../platform/useVisibleRevalidation';

const api = createClientApiClient();
const PAGE_SIZE = 20;
const cashflowResponseCache = new Map<string, unknown>();
const cashflowInflight = new Map<string, Promise<unknown>>();
const GROUPS = [
  ['incomeCategories', 'Mục Thu'],
  ['expenseCategories', 'Mục Chi'],
  ['actors', 'Người Thu/Chi'],
  ['partners', 'Đối tác'],
  ['loanPartners', 'Nơi vay'],
] as const;
const TABS: Array<[CashflowTab, string]> = [
  ['overview', 'Tổng quan'],
  ['transactions', 'Danh sách thu chi'],
  ['debts', 'Công nợ'],
  ['loans', 'Khoản vay'],
  ['catalog', 'Danh mục'],
];
const money = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const amount = (value: unknown) => Number(String(value || '').replace(/[^\d-]/g, '')) || 0;
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDateKey(new Date());
const requestId = () => `next-${Date.now()}-${crypto.randomUUID()}`;
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLocaleLowerCase('vi-VN');
const dateKey = (row: FundTransaction) => {
  const raw = String(row.date || row.dateText || '');
  const match = raw.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : raw.slice(0, 10);
};
const fundOverviewMetricTone = (key: string, value: number) => (key === 'periodIncome' ? 'fund-tone-positive' : key === 'periodExpense' ? 'fund-tone-negative' : key === 'periodNet' ? (value < 0 ? 'fund-tone-negative' : value > 0 ? 'fund-tone-positive' : 'fund-tone-neutral') : key === 'openingBalance' ? 'fund-tone-opening' : key === 'closingBalance' ? 'fund-tone-closing' : key === 'currentBalance' ? 'fund-tone-current' : 'fund-tone-neutral');
const fundLoanMetricTone = (key: string) => (key === 'principalPaid' ? 'fund-tone-principal-paid' : key === 'interestPaid' ? 'fund-tone-interest-paid' : key === 'outstanding' ? 'fund-tone-negative' : 'fund-tone-borrowed');
const fundLoanHistoryTone = (type: string) => (type === 'Vay' ? 'emerald' : 'rose');
const fundLoanAmountTone = (type: string) => (type === 'Vay' ? 'cash-in' : 'cash-out');
const normalizeJob = (value: unknown): FundWriteJob => {
  const raw = value as FundWriteJob & { job?: FundWriteJob };
  return raw.job || raw;
};
const blankTransaction = (): FundTransaction => ({
  date: today(),
  type: 'Chi',
  category: '',
  amount: '',
  actor: '',
  partner: '',
  content: '',
  debt: false,
});
type LoanForm = {
  date: string;
  partner: string;
  amount: string;
  termMonths: string;
  annualRate: string;
  interestPeriodMonths: string;
  firstInterestDate: string;
  content: string;
};
const blankLoan = (): LoanForm => ({
  date: today(),
  partner: '',
  amount: '',
  termMonths: '',
  annualRate: '',
  interestPeriodMonths: '',
  firstInterestDate: '',
  content: '',
});
type PaymentForm = {
  date: string;
  code: string;
  type: string;
  partner: string;
  amount: string;
  content: string;
};
type Drawer = 'transactions' | 'loan' | 'payment' | 'category' | null;
type Period = 'recent' | 'today' | '7days' | 'thisMonth' | 'lastMonth' | 'custom';
type FundRangePayload = {
  overview: FundOverview;
  transactions: FundTransactions;
  loans: FundLoans;
};
type FundLoanWriteResult = {
  ok?: boolean;
  rowIndex?: number;
  code?: string;
};

function adjustMetrics(metrics: FundOverview['metrics'] | FundLoans['metrics'], deltas: Record<string, number>) {
  return (metrics || []).map((metric) => ({
    ...metric,
    value: Number(metric.value || 0) + Number(deltas[metric.key] || 0),
  }));
}

function applyOptimisticLoan(bundle: FundLoans, value: LoanForm, result: FundLoanWriteResult, startDate: string, endDate: string): FundLoans {
  const loanAmount = amount(value.amount);
  const isInRange = value.date >= startDate && value.date <= endDate;
  const isInSummary = value.date <= endDate;
  const code = result.code || `pending-${result.rowIndex || Date.now()}`;
  const nextLoan: FundLoan = {
    code,
    loanDate: value.date,
    loanDateText: formatDisplayDate(value.date),
    partner: value.partner,
    borrowed: loanAmount,
    principalPaid: 0,
    interestPaid: 0,
    outstanding: loanAmount,
    currentOutstanding: loanAmount,
    isCurrentlySettled: false,
    content: value.content,
  };
  const nextHistory = {
    rowIndex: result.rowIndex,
    code,
    loanKey: code,
    date: value.date,
    dateText: formatDisplayDate(value.date),
    type: 'Vay',
    partner: value.partner,
    amount: loanAmount,
    content: value.content,
    isSettled: false,
    statusLabel: '',
  };
  return {
    ...bundle,
    metrics: adjustMetrics(bundle.metrics, {
      borrowed: isInRange ? loanAmount : 0,
      outstanding: isInSummary ? loanAmount : 0,
    }),
    loans: isInSummary ? [nextLoan, ...(bundle.loans || []).filter((item) => item.code !== code)] : bundle.loans,
    recentRows: isInRange ? [nextHistory, ...(bundle.recentRows || []).filter((item) => item.rowIndex !== result.rowIndex)] : bundle.recentRows,
  };
}

function applyOptimisticLoanToOverview(bundle: FundOverview, value: LoanForm, startDate: string, endDate: string): FundOverview {
  const loanAmount = amount(value.amount);
  const beforeRange = value.date < startDate;
  const inRange = value.date >= startDate && value.date <= endDate;
  const deltas: Record<string, number> = {
    openingBalance: beforeRange ? loanAmount : 0,
    periodIncome: inRange ? loanAmount : 0,
    periodNet: inRange ? loanAmount : 0,
    closingBalance: value.date <= endDate ? loanAmount : 0,
    currentBalance: value.date <= today() ? loanAmount : 0,
  };
  return { ...bundle, metrics: adjustMetrics(bundle.metrics, deltas) };
}

function BodyPortal({ children }: { children: React.ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body);
}

async function readSurface<T>(year: string, view: string, params: Record<string, string> = {}, forceRefresh = false, bypassClientCache = false) {
  const url = new URL('/manage-data/', window.location.origin);
  url.searchParams.set('surface', 'cashflow');
  url.searchParams.set('view', view);
  url.searchParams.set('year', year);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const key = url.toString().replace(/&forceRefresh=true$/, '');
  if (!forceRefresh && !bypassClientCache && cashflowResponseCache.has(key)) return cashflowResponseCache.get(key) as T;
  if (!forceRefresh && !bypassClientCache && cashflowInflight.has(key)) return cashflowInflight.get(key) as Promise<T>;
  const request = (async () => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Không tải được dữ liệu Thu chi (${response.status}).`);
    cashflowResponseCache.set(key, payload);
    return payload;
  })();
  if (!forceRefresh && !bypassClientCache) cashflowInflight.set(key, request);
  try {
    return (await request) as T;
  } finally {
    cashflowInflight.delete(key);
  }
}

function rangeFor(period: Period) {
  const end = new Date();
  const start = new Date(end);
  if (period === 'today') return { start: today(), end: today() };
  if (period === '7days') start.setDate(end.getDate() - 6);
  if (period === 'thisMonth') start.setDate(1);
  if (period === 'lastMonth') {
    start.setMonth(end.getMonth() - 1, 1);
    end.setDate(0);
  }
  return period === 'recent' ? { start: '', end: '' } : { start: localDateKey(start), end: localDateKey(end) };
}
function clampRangeToYear(range: { start: string; end: string }, year: string) {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  return {
    start: range.start < first ? first : range.start,
    end: range.end > last ? last : range.end,
  };
}

function IconButton({ label, onClick, disabled, kind = 'refresh' }: { label: string; onClick: (button: HTMLButtonElement) => void; disabled?: boolean; kind?: 'refresh' | 'image' | 'add' | 'close' }) {
  return (
    <button type="button" className="sub-tab c2-card-action-button cashflow-icon-button" aria-label={label} title={label} disabled={disabled} onClick={(event) => onClick(event.currentTarget)}>
      {kind === 'refresh' ? (
        <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      ) : kind === 'image' ? (
        <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ) : kind === 'close' ? (
        <span aria-hidden="true">×</span>
      ) : (
        <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  );
}

function Pager({ page, total, setPage }: { page: number; total: number; setPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  return (
    <div className="manage-react-pagination cashflow-pagination">
      <span>{total ? `Đang hiển thị ${(current - 1) * PAGE_SIZE + 1}-${Math.min(current * PAGE_SIZE, total)} trên ${total}` : 'Đang hiển thị 0-0 trên 0'}</span>
      <div>
        <button type="button" className="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>
          ← Trước
        </button>
        <button type="button" className="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>
          Sau →
        </button>
      </div>
    </div>
  );
}

export function CashflowModule({ initialData, initialError = '' }: { initialData: CashflowInitialData; initialError?: string }) {
  const context = useWorkbookContext();
  const year = initialData.year || context.workbook.year;
  const canWrite = context.user.role === 'admin' || context.user.role === 'operator';
  const currentYear = today().slice(0, 4);
  const initialPeriod: Period = year === currentYear ? 'thisMonth' : 'recent';
  const initialRange = year === currentYear ? rangeFor('thisMonth') : { start: `${year}-01-01`, end: `${year}-12-31` };
  const [tab, setTab] = useState<CashflowTab>('overview');
  const [overview, setOverview] = useState(initialData.overview);
  const [transactions, setTransactions] = useState(initialData.transactions);
  const [loans, setLoans] = useState(initialData.loans);
  const [options, setOptions] = useState(initialData.options);
  const [settingsEdit, setSettingsEdit] = useState<FundSettings>(initialData.options.settings || { cashOpening: 0, bankOpening: 0, dataStartDate: '', loanStartDate: '' });
  const [catalog, setCatalog] = useState<FundCatalog>(initialData.catalog || { rows: [] });
  const [group, setGroup] = useState('incomeCategories');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError || initialData.warnings[0] || '');
  const [error, setError] = useState(Boolean(initialError));
  const [jobs, setJobs] = useState<FundWriteJob[]>([]);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [query, setQuery] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [loanPage, setLoanPage] = useState(1);
  const [loanSummaryPage, setLoanSummaryPage] = useState(1);
  const [catalogPage, setCatalogPage] = useState(1);
  const [loanPartner, setLoanPartner] = useState('');
  const [historyPartner, setHistoryPartner] = useState('');
  const [historyType, setHistoryType] = useState('');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [drawerCloseRequest, setDrawerCloseRequest] = useState(0);
  const [transactionRows, setTransactionRows] = useState<FundTransaction[]>([blankTransaction()]);
  const [loanRows, setLoanRows] = useState<LoanForm[]>([blankLoan()]);
  const [payment, setPayment] = useState<PaymentForm>({
    date: today(),
    code: '',
    type: 'Trả nợ',
    partner: '',
    amount: '',
    content: '',
  });
  const [category, setCategory] = useState<{
    title: string;
    rows: FundTransaction[];
  } | null>(null);
  const [categoryPartner, setCategoryPartner] = useState('');
  const [catalogEdit, setCatalogEdit] = useState<FundCatalogRow>({
    rowIndex: '',
    value: '',
  });
  const [deletingTransaction, setDeletingTransaction] = useState<FundTransaction | null>(null);
  const [deletingCatalogRow, setDeletingCatalogRow] = useState<FundCatalogRow | null>(null);
  const [pageMetaPayload, setPageMetaPayload] = useState<FundOverview | FundTransactions | FundLoans | FundCatalog>(() => initialData.overview);
  const catalogPrefetchStarted = useRef(false);
  const visibleQueryRef = useRef({ tab, startDate, endDate, group });
  const report = (text: string, isError = false) => {
    setMessage(text);
    setError(isError);
    showToast(text, isError ? 'error' : 'success');
  };

  useEffect(() => {
    publishDataSourceMeta(pageMetaPayload);
  }, [pageMetaPayload]);
  useEffect(() => {
    visibleQueryRef.current = { tab, startDate, endDate, group };
  }, [tab, startDate, endDate, group]);
  useEffect(() => {
    if (!canWrite) return;
    let active = true;
    api
      .get<{ jobs?: FundWriteJob[] }>('getRecentWriteJobs', {
        params: {
          module: 'fund',
          actionName: 'addFundTransactions',
          limit: '12',
        },
      })
      .then((result) => {
        if (active) setJobs((result.jobs || []).filter((job) => ['pending', 'processing', 'failed'].includes(job.status)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canWrite]);
  useEffect(() => {
    if (!canWrite || catalogPrefetchStarted.current || (catalog.rows || []).length) return;
    catalogPrefetchStarted.current = true;
    let active = true;
    readSurface<FundCatalog>(year, 'catalog', { group: 'incomeCategories' })
      .then((next) => {
        if (active) setCatalog(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canWrite, catalog.rows, year]);
  useEffect(() => {
    const pending = jobs.filter((job) => job.jobId && ['pending', 'processing'].includes(job.status));
    if (!pending.length) return;
    const timer = window.setTimeout(
      () =>
        Promise.all(
          pending.map((job) =>
            api
              .get<FundWriteJob>('getWriteJobStatus', {
                params: { jobId: job.jobId },
              })
              .then(normalizeJob),
          ),
        )
          .then((updated) => {
            setJobs((old) => old.map((job) => updated.find((item) => item.jobId === job.jobId) || job).filter((job) => job.status !== 'synced'));
            if (updated.some((job) => job.status === 'synced'))
              void readSurface<FundTransactions>(year, 'transactions', { startDate, endDate }, false, true)
                .then((next) => {
                  setTransactions(next);
                  if (tab === 'transactions') setPageMetaPayload(next);
                })
                .catch(() => {});
          })
          .catch(() => {}),
      1800,
    );
    return () => window.clearTimeout(timer);
  }, [endDate, jobs, startDate, tab, year]);
  useEffect(() => {
    document.body.classList.toggle('cashflow-modal-open', Boolean(drawer || deletingTransaction || deletingCatalogRow));
    return () => document.body.classList.remove('cashflow-modal-open');
  }, [drawer, deletingTransaction, deletingCatalogRow]);

  const refresh = async (view: CashflowTab = tab, force = false, bypassClientCache = false) => {
    setBusy(true);
    setMessage('Đang tải dữ liệu Thu chi…');
    setError(false);
    showToast('Đang tải dữ liệu Thu chi…', 'loading');
    try {
      if (view === 'overview') {
        const next = await readSurface<FundOverview>(year, 'overview', { startDate, endDate }, force, bypassClientCache);
        setOverview(next);
        setPageMetaPayload(next);
    } else if (view === 'transactions' || view === 'debts') {
        const next = await readSurface<FundTransactions>(year, 'transactions', { startDate, endDate }, force, bypassClientCache);
        setTransactions(next);
        setPageMetaPayload(next);
      } else if (view === 'loans') {
        const next = await readSurface<FundLoans>(year, 'loans', { startDate, endDate }, force, bypassClientCache);
        setLoans(next);
        setPageMetaPayload(next);
      } else {
        const next = await readSurface<FundCatalog>(year, 'catalog', { group }, force, bypassClientCache);
        setCatalog(next);
        setPageMetaPayload(next);
      }
      report('Dữ liệu Thu chi đã được cập nhật.');
    } catch (loadError) {
      report(loadError instanceof Error ? loadError.message : String(loadError), true);
    } finally {
      setBusy(false);
    }
  };
  useVisibleRevalidation(async () => {
    if (busy || drawer || deletingTransaction || deletingCatalogRow) return;
    const target = visibleQueryRef.current;
    const isCurrent = () => {
      const current = visibleQueryRef.current;
      return current.tab === target.tab && current.startDate === target.startDate && current.endDate === target.endDate && current.group === target.group;
    };
    if (target.tab === 'overview') {
      const next = await readSurface<FundOverview>(year, 'overview', { startDate: target.startDate, endDate: target.endDate }, false, true);
      if (!isCurrent()) return;
      setOverview(next);
      setPageMetaPayload(next);
    } else if (target.tab === 'transactions' || target.tab === 'debts') {
      const next = await readSurface<FundTransactions>(year, 'transactions', { startDate: target.startDate, endDate: target.endDate }, false, true);
      if (!isCurrent()) return;
      setTransactions(next);
      setPageMetaPayload(next);
    } else if (target.tab === 'loans') {
      const next = await readSurface<FundLoans>(year, 'loans', { startDate: target.startDate, endDate: target.endDate }, false, true);
      if (!isCurrent()) return;
      setLoans(next);
      setPageMetaPayload(next);
    } else {
      const next = await readSurface<FundCatalog>(year, 'catalog', { group: target.group }, false, true);
      if (!isCurrent()) return;
      setCatalog(next);
      setPageMetaPayload(next);
    }
  }, !busy);
  const switchTab = (value: CashflowTab) => {
    setTab(value);
    if (value === 'catalog' && canWrite && !(catalog.rows || []).length) void refresh(value);
  };
  const loadSharedRange = async (range: { start: string; end: string }, force = false, cacheMonth = '') => {
    setBusy(true);
    setMessage('Đang áp dụng bộ lọc Quỹ…');
    setError(false);
    showToast('Đang áp dụng bộ lọc Quỹ…', 'loading');
    try {
      const params: Record<string, string> = cacheMonth ? { month: cacheMonth } : { startDate: range.start, endDate: range.end };
      const rangePayload = await readSurface<FundRangePayload>(year, 'range', params, force);
      const { overview: nextOverview, transactions: nextTransactions, loans: nextLoans } = rangePayload;
      setOverview(nextOverview);
      setTransactions(nextTransactions);
      setLoans(nextLoans);
      setPageMetaPayload(nextOverview);
      setTxPage(1);
      setLoanPage(1);
      setLoanSummaryPage(1);
      report('Đã áp dụng bộ lọc cho Tổng quan, Danh sách thu chi và Khoản vay.');
    } catch (loadError) {
      report(loadError instanceof Error ? loadError.message : String(loadError), true);
    } finally {
      setBusy(false);
    }
  };
  const changePeriod = (value: Period) => {
    setPeriod(value);
    if (value === 'custom') return;
    const rawRange =
      value === 'recent'
        ? {
            start: `${year}-01-01`,
            end: year === today().slice(0, 4) ? today() : `${year}-12-31`,
          }
        : rangeFor(value);
    const range = clampRangeToYear(rawRange, year);
    const cacheMonth = value === 'thisMonth' || value === 'lastMonth' ? range.start.slice(0, 7) : '';
    setStartDate(range.start);
    setEndDate(range.end);
    void loadSharedRange(range, false, cacheMonth);
  };
  const loadCustomRange = () => {
    if (!startDate || !endDate || startDate > endDate || !startDate.startsWith(`${year}-`) || !endDate.startsWith(`${year}-`)) return report(`Vui lòng chọn khoảng ngày hợp lệ trong năm ${year}.`, true);
    void loadSharedRange({ start: startDate, end: endDate });
  };
  const reloadOptions = () =>
    readSurface<FundOptions>(year, 'options', {}, true)
      .then((next) => { setOptions(next); if (next.settings) setSettingsEdit(next.settings); })
      .catch(() => {});

  const queued = useMemo(
    () =>
      jobs
        .filter((job) => ['pending', 'processing', 'failed'].includes(job.status))
        .flatMap((job) =>
          (job.payload?.transactions || job.transactions || []).map((item) => ({
            ...item,
            pending: true,
            jobId: job.jobId,
          })),
        ),
    [jobs],
  );
  const shownTransactions = useMemo(
    () =>
      [...queued, ...(transactions.transactions || [])].filter((item) => {
        const date = dateKey(item);
        if (startDate && date < startDate) return false;
        if (endDate && date > endDate) return false;
        return !query.trim() || normalize([item.voucher, item.dateText || item.date, item.type, item.category, item.actor, item.partner, item.content].join(' ')).includes(normalize(query.trim()));
      }),
    [queued, transactions, query, startDate, endDate],
  );
  const txRows = shownTransactions.slice((txPage - 1) * PAGE_SIZE, txPage * PAGE_SIZE);
  const shownDebts = shownTransactions.filter((item) => item.debt === true || item.debt === 'Có');
  const debtRows = shownDebts.slice((txPage - 1) * PAGE_SIZE, txPage * PAGE_SIZE);
  const loanPartners = useMemo(() => Array.from(new Set((loans.loans || []).map((item) => item.partner).filter(Boolean))).sort(), [loans]);
  const filteredLoans = useMemo(() => (loans.loans || []).filter((item) => !loanPartner || item.partner === loanPartner), [loans, loanPartner]);
  const filteredLoanMetrics = useMemo(() => {
    if (!loanPartner) return loans.metrics || [];
    const partnerRows = (loans.recentRows || []).filter((item) => item.partner === loanPartner);
    const values: Record<string, number> = {
      borrowed: partnerRows.filter((item) => item.type === 'Vay').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      principalPaid: partnerRows.filter((item) => item.type === 'Trả nợ' || item.type === 'Trả gốc').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      interestPaid: partnerRows.filter((item) => item.type === 'Trả lãi').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      outstanding: filteredLoans.reduce((sum, item) => sum + Number(item.outstanding || 0), 0),
    };
    return (loans.metrics || []).map((item) => ({
      ...item,
      value: values[item.key] ?? item.value,
    }));
  }, [filteredLoans, loanPartner, loans.metrics, loans.recentRows]);
  const filteredHistory = useMemo(() => (loans.recentRows || []).filter((item) => (!historyPartner || item.partner === historyPartner) && (!historyType || item.type === historyType)), [loans, historyPartner, historyType]);
  const categoryRows = useMemo(() => (category?.rows || []).filter((row) => !categoryPartner || row.partner === categoryPartner), [category, categoryPartner]);

  const openTransactions = (row?: FundTransaction) => {
    setTransactionRows([row ? { ...row, amount: formatVietnameseNumberInput(String(row.amount), false) } : blankTransaction()]);
    setDrawer('transactions');
  };
  const submitTransactions = async () => {
    const invalid = transactionRows.some((row) => !row.date || !row.category || !row.actor || amount(row.amount) <= 0);
    if (invalid) return report('Vui lòng điền ngày, mục thu/chi, số tiền và người Thu/Chi cho mọi dòng.', true);
    setBusy(true);
    showToast('Đang lưu giao dịch…', 'loading');
    try {
      const prepared = transactionRows.map((row) => ({
        ...row,
        amount: String(amount(row.amount)),
      }));
      if (prepared[0].rowIndex) {
        await api.post('updateFundTransaction', {
          body: {
            year,
            rowIndex: prepared[0].rowIndex,
            transaction: prepared[0],
          },
        });
        const nextTransactions = {
          ...transactions,
          transactions: (transactions.transactions || []).map((item) =>
            item.rowIndex === prepared[0].rowIndex
              ? { ...item, ...prepared[0], dateText: formatDisplayDate(prepared[0].date) }
              : item,
          ),
        };
        setTransactions(nextTransactions);
        if (tab === 'transactions') setPageMetaPayload(nextTransactions);
      } else {
        const job = normalizeJob(
          await api.post<FundWriteJob>('addFundTransactions', {
            body: {
              year,
              transactions: prepared,
              useQueue: true,
              clientRequestId: requestId(),
            },
          }),
        );
        if (job.jobId) {
          setJobs((old) => [{ ...job, payload: job.payload || { transactions: prepared } }, ...old.filter((item) => item.jobId !== job.jobId)]);
          void api.post('processWriteJobs', { body: { maxJobs: 2 } }).catch(() => {});
        }
      }
      setDrawerCloseRequest((value) => value + 1);
      report(prepared[0].rowIndex ? 'Đã cập nhật giao dịch.' : 'Đã nhận giao dịch và đưa vào hàng chờ đồng bộ.');
    } catch (writeError) {
      report(writeError instanceof Error ? writeError.message : String(writeError), true);
    } finally {
      setBusy(false);
    }
  };
  const deleteTransaction = (row: FundTransaction) => {
    setDeletingTransaction(row);
  };
  const confirmDeleteTransaction = async () => {
    if (!deletingTransaction) return;
    const row = deletingTransaction;
    setDeletingTransaction(null);
    if (!row.rowIndex) return;
    setBusy(true);
    try {
      await api.post('deleteFundTransaction', {
        body: { year, rowIndex: row.rowIndex },
      });
      report('Đã xóa giao dịch.');
      await refresh('transactions', true);
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const retry = async (jobId: string) => {
    try {
      const job = normalizeJob(await api.post<FundWriteJob>('retryWriteJob', { body: { jobId } }));
      setJobs((old) => old.map((item) => (item.jobId === jobId ? job : item)));
      void api.post('processWriteJobs', { body: { maxJobs: 2 } }).catch(() => {});
      report(`Đã đưa job ${jobId} về hàng chờ.`);
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    }
  };

  const openLoan = () => {
    setLoanRows([blankLoan()]);
    setDrawer('loan');
  };
  const submitLoan = async () => {
    if (loanRows.some((loan) => !loan.date || !loan.partner || amount(loan.amount) <= 0)) return report('Vui lòng nhập ngày vay, nơi vay và số tiền hợp lệ cho mọi khoản vay.', true);
    setBusy(true);
    showToast(loanRows.length > 1 ? `Đang lưu ${loanRows.length} khoản vay…` : 'Đang lưu khoản vay…', 'loading');
    let nextLoans = loans;
    let nextOverview = overview;
    let savedCount = 0;
    try {
      for (const loan of loanRows) {
        const saved = await api.post<FundLoanWriteResult>('addFundLoan', {
          body: { year, loan: { ...loan, amount: String(amount(loan.amount)) } },
        });
        nextLoans = applyOptimisticLoan(nextLoans, loan, saved, startDate, endDate);
        nextOverview = applyOptimisticLoanToOverview(nextOverview, loan, startDate, endDate);
        savedCount += 1;
      }
      setLoans(nextLoans);
      setOverview(nextOverview);
      setLoanPage(1);
      setLoanSummaryPage(1);
      if (tab === 'loans') setPageMetaPayload(nextLoans);
      setDrawerCloseRequest((value) => value + 1);
      report(loanRows.length > 1 ? `Đã lưu ${loanRows.length} khoản vay. Cache Supabase sẽ tự đồng bộ nền.` : 'Đã lưu khoản vay. Cache Supabase sẽ tự đồng bộ nền.');
    } catch (e) {
      if (savedCount > 0) {
        setLoans(nextLoans);
        setOverview(nextOverview);
        setLoanRows(loanRows.slice(savedCount));
        if (tab === 'loans') setPageMetaPayload(nextLoans);
      }
      const detail = e instanceof Error ? e.message : String(e);
      report(savedCount > 0 ? `Đã lưu ${savedCount}/${loanRows.length} khoản vay. Các dòng chưa lưu vẫn còn trong biểu mẫu. ${detail}` : detail, true);
    } finally {
      setBusy(false);
    }
  };
  const openPayment = (item: FundLoan) => {
    setPayment({
      date: today(),
      code: item.code || '',
      type: 'Trả nợ',
      partner: item.partner,
      amount: '',
      content: `Trả một phần khoản vay [${item.partner}] mã vay [${item.code || ''}]`,
    });
    setDrawer('payment');
  };
  const submitPayment = async () => {
    if (!payment.date || !payment.code || !payment.partner || amount(payment.amount) <= 0) return report('Vui lòng nhập đủ thông tin thanh toán khoản vay.', true);
    setBusy(true);
    try {
      await api.post('addFundLoanPayment', {
        body: {
          year,
          payment: { ...payment, amount: String(amount(payment.amount)) },
        },
      });
      setDrawerCloseRequest((value) => value + 1);
      report('Đã ghi thanh toán khoản vay và đồng bộ cache.');
      await refresh('loans', true);
      void refresh('overview', true);
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const selectGroup = (value: string) => {
    setGroup(value);
    setCatalogPage(1);
    setCatalogEdit({ rowIndex: '', value: '' });
    setBusy(true);
    readSurface<FundCatalog>(year, 'catalog', { group: value })
      .then(setCatalog)
      .catch((e) => report(e instanceof Error ? e.message : String(e), true))
      .finally(() => setBusy(false));
  };
  const saveCatalog = async () => {
    if (!catalogEdit.value.trim()) return report('Vui lòng nhập giá trị danh mục.', true);
    setBusy(true);
    try {
      await api.post('saveFundCatalogItem', {
        body: {
          year,
          payload: {
            group,
            rowIndex: catalogEdit.rowIndex || '',
            value: catalogEdit.value,
            note: '',
          },
        },
      });
      setCatalogEdit({ rowIndex: '', value: '' });
      report('Đã lưu danh mục trong vùng CAIDAT cho phép.');
      await refresh('catalog', true);
      void reloadOptions();
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const deleteCatalog = (row: FundCatalogRow) => {
    setDeletingCatalogRow(row);
  };
  const confirmDeleteCatalog = async () => {
    if (!deletingCatalogRow) return;
    const row = deletingCatalogRow;
    setDeletingCatalogRow(null);
    setBusy(true);
    try {
      await api.post('deleteFundCatalogItem', {
        body: { year, payload: { rowIndex: row.rowIndex } },
      });
      report('Đã xóa nội dung ô danh mục, không dịch chuyển dòng Sheet.');
      await refresh('catalog', true);
      void reloadOptions();
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const saveFundSettings = async () => {
    if (!settingsEdit.dataStartDate || !settingsEdit.loanStartDate) return report('Vui lòng nhập đủ hai ngày bắt đầu.', true);
    setBusy(true);
    showToast('Đang lưu thiết lập Quỹ…', 'loading');
    try {
      const result = await api.post<{ settings?: FundSettings }>('updateFundSettings', { body: { year, settings: settingsEdit } });
      if (result.settings) setSettingsEdit(result.settings);
      report('Đã cập nhật số dư đầu kỳ và ngày bắt đầu trong CAIDAT.');
      await reloadOptions();
      void refresh('overview', true);
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const visibleTabs = [...TABS.filter(([value]) => value !== 'catalog'), ...(canWrite ? [['catalog', 'Danh mục']] : [])] as Array<[CashflowTab, string]>;
  return (
    <section id="cashflowView" className="view active cashflow-c2" data-next-cashflow="true" aria-label="Thu chi">
      <button type="button" data-shell-refresh hidden onClick={() => void refresh(tab, false, true)}>
        Làm mới
      </button>
      <nav id="fundTabsBar" className="sub-tabs-bar app-sticky-tabs" role="tablist" aria-label="Phân hệ Thu chi">
        {visibleTabs.map(([value, label]) => (
          <button type="button" role="tab" aria-selected={tab === value} className={`sub-tab${tab === value ? ' active' : ''}`} onClick={() => switchTab(value)} key={value}>
            {label}
          </button>
        ))}
      </nav>
      {message && error ? (
        <div className="status show err" role="alert" aria-live="assertive">
          {message}
        </div>
      ) : null}
      {tab !== 'catalog' ? (
        <SharedCashflowFilter
          year={year}
          period={period}
          startDate={startDate}
          endDate={endDate}
          busy={busy}
          query={tab === 'transactions' || tab === 'debts' ? query : undefined}
          setQuery={
            tab === 'transactions' || tab === 'debts'
              ? (value) => {
                  setQuery(value);
                  setTxPage(1);
                }
              : undefined
          }
          canAdd={canWrite && (tab === 'transactions' || tab === 'debts' || tab === 'loans')}
          add={tab === 'loans' ? openLoan : () => openTransactions()}
          addLabel={tab === 'loans' ? 'Nhập khoản vay mới' : 'Nhập giao dịch mới'}
          setPeriod={changePeriod}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          applyCustom={loadCustomRange}
        />
      ) : null}
      {tab === 'overview' ? (
        <Overview
          data={overview}
          openCategory={(title, rows) => {
            setCategory({ title, rows });
            setCategoryPartner('');
            setDrawer('category');
          }}
        />
      ) : null}
      {tab === 'transactions' ? <Transactions rows={txRows} total={shownTransactions.length} page={txPage} setPage={setTxPage} canWrite={canWrite} edit={openTransactions} remove={deleteTransaction} retry={retry} /> : null}
      {tab === 'debts' ? <Transactions rows={debtRows} total={shownDebts.length} page={txPage} setPage={setTxPage} canWrite={canWrite} edit={openTransactions} remove={deleteTransaction} retry={retry} debtMode /> : null}
      {tab === 'loans' ? (
        <Loans
          metrics={filteredLoanMetrics}
          rows={filteredLoans.slice((loanSummaryPage - 1) * PAGE_SIZE, loanSummaryPage * PAGE_SIZE)}
          rowsTotal={filteredLoans.length}
          summaryPage={loanSummaryPage}
          setSummaryPage={setLoanSummaryPage}
          history={filteredHistory.slice((loanPage - 1) * PAGE_SIZE, loanPage * PAGE_SIZE)}
          historyTotal={filteredHistory.length}
          page={loanPage}
          setPage={setLoanPage}
          loanPartner={loanPartner}
          setLoanPartner={(value) => {
            setLoanPartner(value);
            setLoanSummaryPage(1);
          }}
          historyPartner={historyPartner}
          setHistoryPartner={(value) => {
            setHistoryPartner(value);
            setLoanPage(1);
          }}
          historyType={historyType}
          setHistoryType={(value) => {
            setHistoryType(value);
            setLoanPage(1);
          }}
          partners={loanPartners}
          canWrite={canWrite}
          pay={openPayment}
        />
      ) : null}
      {tab === 'catalog' && canWrite ? <><FundSettingsCard value={settingsEdit} setValue={setSettingsEdit} save={() => void saveFundSettings()} busy={busy} /><Catalog data={catalog} group={group} edit={catalogEdit} setEdit={setCatalogEdit} selectGroup={selectGroup} save={() => void saveCatalog()} remove={deleteCatalog} busy={busy} page={catalogPage} setPage={setCatalogPage} /></> : null}
      {drawer === 'transactions' ? <TransactionDrawer rows={transactionRows} setRows={setTransactionRows} options={options} busy={busy} closeRequest={drawerCloseRequest} close={() => setDrawer(null)} submit={() => void submitTransactions()} /> : null}
      {drawer === 'loan' ? <LoanDrawer rows={loanRows} setRows={setLoanRows} options={options} busy={busy} closeRequest={drawerCloseRequest} close={() => setDrawer(null)} submit={() => void submitLoan()} /> : null}
      {drawer === 'payment' ? <PaymentDrawer value={payment} setValue={setPayment} busy={busy} closeRequest={drawerCloseRequest} close={() => setDrawer(null)} submit={() => void submitPayment()} /> : null}
      {drawer === 'category' && category ? <CategoryDrawer title={category.title} rows={categoryRows} allRows={category.rows} partner={categoryPartner} setPartner={setCategoryPartner} closeRequest={drawerCloseRequest} close={() => setDrawer(null)} /> : null}
      {deletingTransaction ? (
        <BodyPortal>
          <div
            className="modal-overlay active cashflow-delete-confirm-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target && !busy) setDeletingTransaction(null);
            }}
          >
            <section className="modal-container cashflow-delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cashflowTxDeleteTitle">
              <header className="modal-header cashflow-delete-header">
                <div className="cashflow-delete-warning-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <h3 id="cashflowTxDeleteTitle">Xác nhận xóa giao dịch</h3>
                <button type="button" className="modal-close-btn" onClick={() => setDeletingTransaction(null)} disabled={busy}>
                  ×
                </button>
              </header>
              <div className="modal-body cashflow-delete-body">
                <p>
                  Bạn có chắc chắn muốn xóa <strong>giao dịch {deletingTransaction.voucher || `dòng thứ ${deletingTransaction.rowIndex}`}</strong> không?
                </p>
                <div className="cashflow-delete-preview">
                  <div className="cashflow-delete-preview-item">
                    <span>Ngày:</span>
                    <strong>{deletingTransaction.dateText || deletingTransaction.date}</strong>
                  </div>
                  <div className="cashflow-delete-preview-item">
                    <span>Mục:</span>
                    <strong>{deletingTransaction.category}</strong>
                  </div>
                  <div className="cashflow-delete-preview-item">
                    <span>Số tiền:</span>
                    <strong className={deletingTransaction.type === 'Thu' ? 'fund-income tabular-nums' : 'fund-expense tabular-nums'}>{money(deletingTransaction.amount)} đ</strong>
                  </div>
                </div>
                <p className="cashflow-delete-subtext">Hành động này sẽ xóa giao dịch trên Google Sheet và không thể hoàn tác.</p>
              </div>
              <footer className="modal-footer">
                <button type="button" className="outline" onClick={() => setDeletingTransaction(null)} disabled={busy}>
                  Hủy bỏ
                </button>
                <button type="button" className="danger-btn" onClick={() => void confirmDeleteTransaction()} disabled={busy}>
                  {busy ? 'Đang xóa…' : 'Xóa giao dịch'}
                </button>
              </footer>
            </section>
          </div>
        </BodyPortal>
      ) : null}
      {deletingCatalogRow ? (
        <BodyPortal>
          <div
            className="modal-overlay active cashflow-delete-confirm-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target && !busy) setDeletingCatalogRow(null);
            }}
          >
            <section className="modal-container cashflow-delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cashflowCatalogDeleteTitle">
              <header className="modal-header cashflow-delete-header">
                <div className="cashflow-delete-warning-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <h3 id="cashflowCatalogDeleteTitle">Xác nhận xóa danh mục</h3>
                <button type="button" className="modal-close-btn" onClick={() => setDeletingCatalogRow(null)} disabled={busy}>
                  ×
                </button>
              </header>
              <div className="modal-body cashflow-delete-body">
                <p>
                  Bạn có chắc chắn muốn xóa mục “<strong>{deletingCatalogRow.value}</strong>” khỏi danh mục không?
                </p>
                <p className="cashflow-delete-subtext">Hành động này sẽ xóa nội dung ô danh mục trong vùng CAIDAT và không dịch chuyển dòng Sheet.</p>
              </div>
              <footer className="modal-footer">
                <button type="button" className="outline" onClick={() => setDeletingCatalogRow(null)} disabled={busy}>
                  Hủy bỏ
                </button>
                <button type="button" className="danger-btn" onClick={() => void confirmDeleteCatalog()} disabled={busy}>
                  {busy ? 'Đang xóa…' : 'Xóa danh mục'}
                </button>
              </footer>
            </section>
          </div>
        </BodyPortal>
      ) : null}
    </section>
  );
}

function SharedCashflowFilter({ year, period, startDate, endDate, busy, query, setQuery, canAdd, add, addLabel, setPeriod, setStartDate, setEndDate, applyCustom }: { year: string; period: Period; startDate: string; endDate: string; busy: boolean; query?: string; setQuery?: (value: string) => void; canAdd: boolean; add: () => void; addLabel: string; setPeriod: (value: Period) => void; setStartDate: (value: string) => void; setEndDate: (value: string) => void; applyCustom: () => void }) {
  const isCurrentYear = year === today().slice(0, 4);
  return (
    <section className="panel cashflow-overview-filter-panel cashflow-shared-filter" aria-label="Bộ lọc chung của module Quỹ">
      <div className="cashflow-filter-stack">
        <div className="cashflow-filter-row-top">
          <select aria-label="Bộ lọc nhanh thời gian" className="cashflow-quick-period-select platform-content-select" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            <option value="thisMonth" disabled={!isCurrentYear}>
              Tháng này
            </option>
            <option value="today" disabled={!isCurrentYear}>
              Hôm nay
            </option>
            <option value="7days" disabled={!isCurrentYear}>
              7 ngày
            </option>
            <option value="lastMonth" disabled={!isCurrentYear || today().slice(5, 7) === '01'}>
              Tháng trước
            </option>
            <option value="recent">Năm {year}</option>
            <option value="custom">Tùy chọn</option>
          </select>
          <div className="cashflow-filter-row-bottom">
            <div className="custom-date-box cashflow-date-input">
            <span className="date-display-text">{formatDisplayDate(startDate)}</span>
            <input
              type="date"
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              aria-label="Từ ngày"
              className="native-date-input vi-date-input"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPeriod('custom');
              }}
            />
            </div>
            <span className="date-range-separator">→</span>
            <div className="custom-date-box cashflow-date-input">
            <span className="date-display-text">{formatDisplayDate(endDate)}</span>
            <input
              type="date"
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              aria-label="Đến ngày"
              className="native-date-input vi-date-input"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPeriod('custom');
              }}
            />
            </div>
          </div>
        </div>
        {(query !== undefined && setQuery) || canAdd || period === 'custom' ? (
          <div className="cashflow-filter-row-search">
            {query !== undefined && setQuery ? <input type="search" className="cashflow-filter-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mục, người, đối tác, nội dung…" aria-label="Tìm kiếm giao dịch thu chi" /> : <span className="cashflow-filter-action-spacer" />}
            {period === 'custom' ? (
              <button type="button" className="secondary cashflow-filter-apply" onClick={applyCustom} disabled={busy}>
                Áp dụng
              </button>
            ) : null}
            {canAdd ? (
              <button type="button" className="primary cashflow-filter-add touch-action-btn" aria-label={addLabel} onClick={add}>
                ＋ Nhập mới
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Overview({ data, openCategory }: { data: FundOverview; openCategory: (title: string, rows: FundTransaction[]) => void }) {
  const metric = (key: string) => data.metrics?.find((item) => item.key === key)?.value || 0;

  return (
    <>
      <div className="fund-kpi-grid">
        {(data.metrics || []).map((item) => {
          const colorClass = fundOverviewMetricTone(item.key, item.value);
          return (
            <article className={`fund-kpi-card kpi-card ${colorClass}`} key={item.key}>
              <div className="kpi-card-header">
                <div className="kpi-label">{item.label}</div>
              </div>
              <div className={`kpi-value tabular-nums ${colorClass}`}>{money(item.value)}</div>
            </article>
          );
        })}
      </div>
      <section className="table-card fund-export-card" aria-labelledby="fund-report-title">
        <div className="table-card-head">
          <div>
            <div className="table-title" id="fund-report-title">
              Báo cáo thu chi
            </div>
          </div>
          <IconButton kind="image" label="Xuất ảnh báo cáo thu chi" onClick={(button) => void exportCardAsImage(button, 'bao-cao-thu-chi')} />
        </div>
        <div className="cashflow-report-body">
          <div className="fund-export-grid">
            <ReportSection
              title="Tổng hợp"
              tone="teal"
              rows={[
                ['Số dư đầu kỳ', metric('openingBalance'), 'fund-tone-opening'],
                ['TỔNG THU TRONG KỲ', metric('periodIncome'), 'fund-tone-positive'],
                ['Chi trong kỳ', metric('periodExpense'), 'fund-tone-negative'],
                ['Tổng thu-chi', metric('periodNet'), fundOverviewMetricTone('periodNet', metric('periodNet'))],
                ['Số dư cuối kỳ', metric('closingBalance'), 'fund-tone-closing'],
                ['Số dư hiện tại', metric('currentBalance'), 'fund-tone-current'],
              ]}
            />
            <CategorySection title="Các khoản thu" tone="blue" valueClass="fund-income" rows={data.incomeCategories || []} open={(row) => openCategory(`Chi tiết khoản thu — ${row.category}`, row.details || [])} />
            <CategorySection title="Các khoản chi" tone="amber" valueClass="fund-expense" rows={data.expenseCategories || []} open={(row) => openCategory(`Chi tiết khoản chi — ${row.category}`, row.details || [])} />
          </div>
        </div>
      </section>
    </>
  );
}
function ReportSection({ title, tone, rows }: { title: string; tone: string; rows: Array<[string, number, string?]> }) {
  return (
    <section className="fund-export-section">
      <div className={`fund-export-section-title ${tone}`}>{title}</div>
      <table className="fund-export-table">
        <tbody>
          {rows.map(([label, value, className]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className={`fund-export-value tabular-nums ${className || ''}`}>{money(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function CategorySection({
  title,
  tone,
  valueClass,
  rows,
  open,
}: {
  title: string;
  tone: string;
  valueClass?: string;
  rows: Array<{
    category: string;
    amount: number;
    details?: FundTransaction[];
  }>;
  open: (row: { category: string; amount: number; details?: FundTransaction[] }) => void;
}) {
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <section className="fund-export-section">
      <div className={`fund-export-section-title ${tone}`}>{title}</div>
      <table className="fund-export-table">
        <tbody>
          {pageRows.length ? (
            pageRows.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td className={`fund-export-value tabular-nums ${valueClass || ''}`}>{money(row.amount)}</td>
                <td className="fund-export-action">
                  <button type="button" className="btn-table-action touch-action-btn fund-view-icon-button" aria-label={`Xem chi tiết ${row.category}`} title={`Xem chi tiết ${row.category}`} onClick={() => open(row)}>
                    <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="fund-export-empty">Không có dữ liệu</td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > PAGE_SIZE ? <Pager page={currentPage} total={rows.length} setPage={setPage} /> : null}
    </section>
  );
}

function CategoryDrawer({ title, rows, allRows, partner, setPartner, closeRequest, close }: { title: string; rows: FundTransaction[]; allRows: FundTransaction[]; partner: string; setPartner: (value: string) => void; closeRequest: number; close: () => void }) {
  const partners = Array.from(new Set(allRows.map((row) => row.partner || '').filter(Boolean))).sort();
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <DrawerShell
      id="fundCategoryDetailDrawer"
      title={title}
      close={close}
      closeRequest={closeRequest}
      hideHeaderClose
      footer={(requestClose) => (
        <button type="button" className="outline primary grow touch-action-btn" onClick={requestClose}>
          Đóng chi tiết
        </button>
      )}
    >
      <div className="cashflow-category-filter">
        <label className="compact-filter">
          <select
            className="platform-content-select"
            aria-label="Lọc theo đối tác"
            value={partner}
            onChange={(event) => {
              setPartner(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả đối tác</option>
            {partners.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table className="report-table table-wide">
          <thead>
            <tr>
              <th className="sticky-col">Ngày</th>
              <th>Loại</th>
              <th>Số tiền</th>
              <th>Người Thu/Chi</th>
              <th>Đối tác</th>
              <th>Nội dung</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? (
              pageRows.map((row, index) => (
                <tr key={`${row.rowIndex || index}`}>
                  <td className="sticky-col">{row.dateText || row.date}</td>
                  <td>
                    <span className={`badge ${row.type === 'Thu' ? 'emerald' : 'rose'}`}>{row.type}</span>
                  </td>
                  <td className={`tabular-nums ${row.type === 'Thu' ? 'fund-income' : 'fund-expense'}`}>{money(row.amount)}</td>
                  <td>{row.actor}</td>
                  <td>{row.partner || '—'}</td>
                  <td>{row.content || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="cashflow-empty">
                  Không có chi tiết phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={currentPage} total={rows.length} setPage={setPage} />
    </DrawerShell>
  );
}

function Transactions(props: { rows: FundTransaction[]; total: number; page: number; setPage: (value: number) => void; canWrite: boolean; edit: (row: FundTransaction) => void; remove: (row: FundTransaction) => void; retry: (jobId: string) => void; debtMode?: boolean }) {
  const pageTotalNet = props.rows.reduce((sum, r) => sum + (r.type === 'Thu' ? amount(r.amount) : -amount(r.amount)), 0);
  const pageRemainingDebt = props.rows.reduce((sum, row) => sum + Number(row.remainingDebt || 0), 0);
  return (
    <section className="table-card">
      <div className="table-card-head cashflow-section-head">
        <div className="table-title">{props.debtMode ? 'Danh sách công nợ' : 'Danh sách thu chi'}</div>
      </div>
      <div className="table-wrap fund-transactions-scroll" tabIndex={0} aria-label="Danh sách thu chi, cuộn ngang để xem đủ cột">
        <table className="report-table table-wide">
          <thead>
            <tr>
              <th className="sticky-col">Ngày</th>
              <th>Loại</th>
              <th>Mục thu/chi</th>
              <th>Số tiền</th>
              <th>Người Thu/Chi</th>
              <th>Đối tác</th>
              <th>Nội dung</th>
              {props.debtMode ? <th>Công nợ còn lại</th> : null}
              {props.canWrite ? <th className="sticky-col-right">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {props.rows.length ? (
              props.rows.map((row, index) => (
                <tr className={row.pending ? 'cashflow-pending-row' : undefined} key={`${row.jobId || row.rowIndex || row.voucher || index}`}>
                  <td className="sticky-col">{row.dateText || row.date}</td>
                  <td>
                    <span className={`badge ${row.type === 'Thu' ? 'emerald' : 'rose'}`}>{row.type}</span>
                    {row.pending ? <small> · {row.jobId ? 'Chờ đồng bộ' : 'Đang xử lý'}</small> : null}
                  </td>
                  <td>{row.category}</td>
                  <td className={`tabular-nums ${row.type === 'Thu' ? 'fund-income' : 'fund-expense'}`}>{money(row.amount)}</td>
                  <td>{row.actor}</td>
                  <td>{row.partner || '—'}</td>
                  <td>{row.content || '—'}</td>
                  {props.debtMode ? <td className="tabular-nums fund-expense"><strong>{money(row.remainingDebt || 0)}</strong></td> : null}
                  {props.canWrite ? (
                    <td className="sticky-col-right manage-row-actions">
                      {row.pending ? (
                        row.jobId ? (
                          <button type="button" className="secondary" onClick={() => props.retry(row.jobId!)}>
                            Thử lại
                          </button>
                        ) : null
                      ) : (
                        <>
                          <button type="button" className="btn-table-action edit touch-action-btn" aria-label="Sửa giao dịch" title="Sửa giao dịch" onClick={() => props.edit(row)}>
                            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button type="button" className="btn-table-action delete danger touch-action-btn" aria-label="Xóa giao dịch" title="Xóa giao dịch" onClick={() => props.remove(row)}>
                            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={(props.canWrite ? 8 : 7) + (props.debtMode ? 1 : 0)} className="cashflow-empty">
                  {props.debtMode ? 'Không có công nợ phù hợp.' : 'Không có giao dịch phù hợp.'}
                </td>
              </tr>
            )}
          </tbody>
          {props.rows.length ? (
            <tfoot className="sticky-total-foot">
              <tr>
                <td className="sticky-col">
                  <strong>Tổng trang ({props.rows.length})</strong>
                </td>
                <td colSpan={2}>—</td>
                <td className={`tabular-nums ${pageTotalNet >= 0 ? 'fund-income' : 'fund-expense'}`}>
                  <strong>{money(pageTotalNet)}</strong>
                </td>
                <td colSpan={3}>—</td>
                {props.debtMode ? <td className="tabular-nums fund-expense"><strong>{money(pageRemainingDebt)}</strong></td> : null}
                {props.canWrite ? <td>—</td> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <Pager page={props.page} total={props.total} setPage={props.setPage} />
    </section>
  );
}

function Loans(props: { metrics: FundLoans['metrics']; rows: FundLoan[]; rowsTotal: number; summaryPage: number; setSummaryPage: (value: number) => void; history: FundLoans['recentRows']; historyTotal: number; page: number; setPage: (value: number) => void; loanPartner: string; setLoanPartner: (value: string) => void; historyPartner: string; setHistoryPartner: (value: string) => void; historyType: string; setHistoryType: (value: string) => void; partners: string[]; canWrite: boolean; pay: (item: FundLoan) => void }) {
  return (
    <>
      <div className="fund-kpi-grid">
        {(props.metrics || []).map((item) => {
          const colorClass = fundLoanMetricTone(item.key);
          return (
            <article className={`fund-kpi-card kpi-card ${colorClass}`} key={item.key}>
              <div className="kpi-card-header">
                <div className="kpi-label">{item.label}</div>
              </div>
              <div className={`kpi-value tabular-nums ${colorClass}`}>{money(item.value)}</div>
            </article>
          );
        })}
      </div>
      <section className="table-card">
        <div className="table-card-head fund-loan-summary-head">
          <div className="table-title">Các khoản vay</div>
          <label className="compact-filter">
            <span className="platform-visually-hidden">Nơi vay</span>
            <select className="platform-content-select" aria-label="Lọc các khoản vay theo nơi vay" value={props.loanPartner} onChange={(event) => props.setLoanPartner(event.target.value)}>
              <option value="">Tất cả</option>
              {props.partners.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap" tabIndex={0}>
          <table className="report-table table-wide">
            <thead>
              <tr>
                <th className="sticky-col">Ngày vay</th>
                <th>Nơi vay</th>
                <th>Dư nợ hiện tại</th>
                <th>Trạng thái / Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.length ? (
                props.rows.map((item, index) => (
                  <tr key={item.code || index}>
                    <td className="sticky-col">{item.loanDateText || item.loanDate || '—'}</td>
                    <td>{item.partner}</td>
                    <td className="tabular-nums fund-expense">{money(item.currentOutstanding ?? item.outstanding)}</td>
                    <td>
                      {item.isCurrentlySettled ? (
                        `Đã trả gốc${item.currentSettlementDateText ? ` · ${item.currentSettlementDateText}` : ''}`
                      ) : props.canWrite ? (
                        <button type="button" className="btn-table-action touch-action-btn fund-loan-payment-icon" aria-label={`Thanh toán khoản vay ${item.partner}`} title="Thanh toán" onClick={() => props.pay(item)}>
                          <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="14" rx="2" />
                            <path d="M3 9h18M8 15h3M16 13v4M14 15h4" />
                          </svg>
                          <span className="desktop-action-label">Thanh toán</span>
                        </button>
                      ) : (
                        'Đang nợ'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="cashflow-empty">
                    Không có khoản vay.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={props.summaryPage} total={props.rowsTotal} setPage={props.setSummaryPage} />
      </section>
      <section className="table-card cashflow-loan-history">
        <div className="table-card-head fund-loan-history-head">
          <div className="table-title">Lịch sử vay / trả</div>
          <div className="fund-loan-history-filters">
            <label className="compact-filter">
              <span className="platform-visually-hidden">Loại</span>
              <select className="platform-content-select" aria-label="Lọc lịch sử theo loại giao dịch" value={props.historyType} onChange={(event) => props.setHistoryType(event.target.value)}>
                <option value="">Tất cả</option>
                <option>Vay</option>
                <option>Trả nợ</option>
                <option>Trả gốc</option>
                <option>Trả lãi</option>
              </select>
            </label>
            <label className="compact-filter">
              <span className="platform-visually-hidden">Nơi vay</span>
              <select className="platform-content-select" aria-label="Lọc lịch sử theo nơi vay" value={props.historyPartner} onChange={(event) => props.setHistoryPartner(event.target.value)}>
                <option value="">Tất cả</option>
                {props.partners.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="table-wrap" tabIndex={0}>
          <table className="report-table table-wide">
            <thead>
              <tr>
                <th className="sticky-col">Ngày</th>
                <th>Loại</th>
                <th>Nơi vay</th>
                <th>Số tiền</th>
                <th>Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {(props.history || []).length ? (
                (props.history || []).map((item, index) => (
                  <tr key={`${item.rowIndex || index}`} data-loan-key={item.loanKey || item.code || ''}>
                    <td className="sticky-col">{item.dateText || item.date}</td>
                    <td>
                      <span className={`badge ${fundLoanHistoryTone(item.type)}`}>{item.type}</span>
                      {item.reconciledFromCode ? ' · Đã đối soát' : ''}
                    </td>
                    <td>{item.partner}</td>
                    <td className={`tabular-nums fund-loan-history-amount ${fundLoanAmountTone(item.type)}`}>
                      <strong>{money(item.amount)}</strong>
                    </td>
                    <td>{item.content || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="cashflow-empty">
                    Không có lịch sử phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={props.page} total={props.historyTotal} setPage={props.setPage} />
      </section>
    </>
  );
}

function FundSettingsCard({ value, setValue, save, busy }: { value: FundSettings; setValue: (value: FundSettings) => void; save: () => void; busy: boolean }) {
  const set = (field: keyof FundSettings, next: string | number) => setValue({ ...value, [field]: next });
  return (
    <section className="table-card fund-settings-card" aria-labelledby="fundSettingsTitle">
      <div className="table-card-head cashflow-section-head">
        <div>
          <div className="table-title" id="fundSettingsTitle">Thiết lập đầu kỳ</div>
        </div>
      </div>
      <div className="panel-body modal-grid">
        <label><span>Số dư tiền mặt đầu kỳ</span><input type="text" inputMode="numeric" value={formatVietnameseNumberInput(String(value.cashOpening || ''), false)} onChange={(event) => set('cashOpening', amount(event.target.value))} /></label>
        <label><span>Số dư tài khoản đầu kỳ</span><input type="text" inputMode="numeric" value={formatVietnameseNumberInput(String(value.bankOpening || ''), false)} onChange={(event) => set('bankOpening', amount(event.target.value))} /></label>
        <label><span>Ngày bắt đầu nhập liệu</span><input type="date" value={value.dataStartDate || ''} onChange={(event) => set('dataStartDate', event.target.value)} /></label>
        <label><span>Ngày bắt đầu tính khoản vay</span><input type="date" value={value.loanStartDate || ''} onChange={(event) => set('loanStartDate', event.target.value)} /></label>
      </div>
      <div className="modal-footer"><button type="button" className="primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thiết lập'}</button></div>
    </section>
  );
}

function Catalog({ data, group, edit, setEdit, selectGroup, save, remove, busy, page, setPage }: { data: FundCatalog; group: string; edit: FundCatalogRow; setEdit: (value: FundCatalogRow) => void; selectGroup: (value: string) => void; save: () => void; remove: (row: FundCatalogRow) => void; busy: boolean; page: number; setPage: (value: number) => void }) {
  const rows = data.rows || [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <section className="table-card fund-catalog-card">
      <div className="cashflow-catalog-body">
        <div className="fund-catalog-head">
          <div className="table-title">Danh mục Thu chi</div>
          <div className="fund-catalog-chips">
            {GROUPS.map(([value, label]) => (
              <button type="button" className={`fund-chip${group === value ? ' active' : ''}`} onClick={() => selectGroup(value)} key={value}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="fund-catalog-form">
          <label>
            <span className="sr-only">Nhập nội dung danh mục</span>
            <input aria-label="Nhập nội dung danh mục" value={edit.value} onChange={(event) => setEdit({ ...edit, value: event.target.value })} placeholder={`Nhập ${GROUPS.find(([value]) => value === group)?.[1].toLocaleLowerCase('vi-VN')}`} />
          </label>
          <button type="button" className="primary" onClick={save} disabled={busy}>
            {busy ? 'Đang lưu…' : edit.rowIndex ? 'Cập nhật danh mục' : 'Lưu danh mục'}
          </button>
          <button type="button" className="outline" onClick={() => setEdit({ rowIndex: '', value: '' })}>
            Xóa nhập
          </button>
        </div>
        <div className="table-wrap">
          <table className="fund-catalog-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Giá trị</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((row, index) => (
                  <tr key={String(row.rowIndex)}>
                    <td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                    <td>{row.value}</td>
                    <td>
                      {row.source !== 'fallback' ? (
                        <div className="manage-row-actions">
                          <button type="button" className="btn-table-action edit touch-action-btn" aria-label="Sửa danh mục" title="Sửa danh mục" onClick={() => setEdit(row)}>
                            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button type="button" className="btn-table-action delete danger touch-action-btn" aria-label="Xóa danh mục" title="Xóa danh mục" onClick={() => remove(row)}>
                            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="cashflow-empty">
                    Chưa có danh mục.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={currentPage} total={rows.length} setPage={setPage} />
      </div>
    </section>
  );
}

function DrawerShell({ id, title, children, footer, close, closeRequest = 0, hideHeaderClose = false }: { id: string; title: string; children: React.ReactNode; footer?: React.ReactNode | ((requestClose: () => void) => React.ReactNode); close: () => void; closeRequest?: number; hideHeaderClose?: boolean }) {
  const swipe = useSwipeDismiss({ onDismiss: close });
  const seenCloseRequest = useRef(closeRequest);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (closeRequest === seenCloseRequest.current) return;
    seenCloseRequest.current = closeRequest;
    swipe.close();
  }, [closeRequest, swipe]);
  useEffect(() => {
    let enterFrame = 0;
    const prepareFrame = window.requestAnimationFrame(() => {
      enterFrame = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(prepareFrame);
      if (enterFrame) window.cancelAnimationFrame(enterFrame);
    };
  }, []);

  return (
    <BodyPortal>
      <div className={`cashflow-drawer-backdrop open${swipe.closing ? ' closing' : ''}`} onClick={swipe.close} />
      <section
        id={id}
        className={`table-card fund-detail-drawer cashflow-c2 open swipe-dismiss-surface${swipe.closing ? ' closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        style={
          {
            '--drawer-swipe-offset': entered ? '0px' : '100dvh',
          } as React.CSSProperties
        }
        {...swipe.gestureProps}
      >
        <header className="table-card-head cashflow-fb-drawer-head" data-swipe-dismiss-handle>
          {!hideHeaderClose ? (
            <button type="button" className="cashflow-back-btn" aria-label="Đóng" title="Đóng" onClick={swipe.close}>
              <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          ) : null}
          <div className="table-title" id={`${id}-title`}>
            {title}
          </div>
        </header>
        <div className="cashflow-drawer-body" data-overlay-scroll="cashflow">
          {children}
        </div>
        {footer ? <footer className="modal-footer submit-bar">{typeof footer === 'function' ? footer(swipe.close) : footer}</footer> : null}
      </section>
    </BodyPortal>
  );
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

function TransactionFields({ row, setRow, options }: { row: FundTransaction; setRow: (row: FundTransaction) => void; options: FundOptions }) {
  const set = (key: string, value: string | boolean) => setRow({ ...row, [key]: value });
  const categories = row.type === 'Thu' ? options.incomeCategories : options.expenseCategories;
  return (
    <div className="modal-grid fields">
      <label>
        <span>Ngày *</span>
        <div className="custom-date-box">
          <span className="date-display-text">{formatDisplayDate(row.date)}</span>
          <input type="date" className="native-date-input vi-date-input" value={row.date} onChange={(event) => set('date', event.target.value)} />
        </div>
      </label>
      <label>
        <span>Loại *</span>
        <select
          value={row.type}
          onChange={(event) =>
            setRow({
              ...row,
              type: event.target.value as 'Thu' | 'Chi',
              category: '',
            })
          }
        >
          <option>Thu</option>
          <option>Chi</option>
        </select>
      </label>
      <label>
        <span>Mục thu/chi *</span>
        <select value={row.category} onChange={(event) => set('category', event.target.value)}>
          <option value="">Chọn mục</option>
          {(categories || []).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Số tiền *</span>
        <input inputMode="numeric" value={String(row.amount)} onChange={(event) => set('amount', formatVietnameseNumberInput(event.target.value, false))} />
      </label>
      <label>
        <span>Người Thu/Chi *</span>
        <select value={row.actor} onChange={(event) => set('actor', event.target.value)}>
          <option value="">Chọn người</option>
          {(options.actors || []).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Đối tác</span>
        <select value={row.partner || ''} onChange={(event) => set('partner', event.target.value)}>
          <option value="">Không chọn</option>
          {(options.partners || []).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="full-width">
        <span>Nội dung</span>
        <textarea value={row.content || ''} onChange={(event) => set('content', event.target.value)} />
      </label>
    </div>
  );
}

function TransactionDrawer({ rows, setRows, options, busy, closeRequest, close, submit }: { rows: FundTransaction[]; setRows: (rows: FundTransaction[]) => void; options: FundOptions; busy: boolean; closeRequest: number; close: () => void; submit: () => void }) {
  const editing = Boolean(rows[0]?.rowIndex);
  return (
    <DrawerShell
      id="fundTransactionAddDrawer"
      title={editing ? 'Sửa giao dịch' : 'Thêm giao dịch thu chi'}
      close={close}
      closeRequest={closeRequest}
      footer={(requestClose) => (
        <>
          <button type="button" className="primary grow" onClick={submit} disabled={busy}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {busy ? 'Đang lưu…' : 'Lưu giao dịch'}
          </button>
          {!editing ? (
            <>
              <button type="button" className="ghost icon-button touch-action-btn" title="Nhân bản dòng cuối" aria-label="Nhân bản dòng cuối" onClick={() => setRows([...rows, { ...rows.at(-1)! }])}>
                <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <button type="button" className="secondary icon-button touch-action-btn" title="Thêm dòng mới" aria-label="Thêm dòng mới" onClick={() => setRows([...rows, blankTransaction()])}>
                <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </>
          ) : null}
          <button type="button" className="outline icon-button touch-action-btn" title="Hủy bỏ/Đóng" aria-label="Hủy bỏ/Đóng" onClick={requestClose}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}
    >
      <div className="fund-transaction-rows">
        {rows.map((row, index) => (
          <section className="fund-transaction-row table-card" key={index}>
            <div className="cashflow-transaction-row-head">
              <strong>Giao dịch {index + 1}</strong>
              <div className="cashflow-transaction-row-actions">
                <label className="fund-debt-toggle">
                  <input type="checkbox" checked={row.debt === true || row.debt === 'Có'} onChange={(event) => setRows(rows.map((item, rowIndex) => (rowIndex === index ? { ...item, debt: event.target.checked } : item)))} />
                  <span>Công nợ</span>
                </label>
                {rows.length > 1 ? (
                  <button type="button" className="danger btn-table-action touch-action-btn" aria-label="Xóa dòng" title="Xóa dòng" onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>
                    <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
            <TransactionFields row={row} options={options} setRow={(value) => setRows(rows.map((item, rowIndex) => (rowIndex === index ? value : item)))} />
          </section>
        ))}
      </div>
    </DrawerShell>
  );
}

type LoanFieldIcon = 'calendar' | 'building' | 'money' | 'term' | 'rate' | 'cycle' | 'note';

function LoanFieldLabel({ icon, children }: { icon: LoanFieldIcon; children: React.ReactNode }) {
  return (
    <span className="cashflow-field-label">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {icon === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></> : null}
        {icon === 'building' ? <><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9 12h1M14 12h1M9 16h1M14 16h1" /></> : null}
        {icon === 'money' ? <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 9.5H6.5A1.5 1.5 0 0 1 5 8M17 14.5h.5A1.5 1.5 0 0 1 19 16" /></> : null}
        {icon === 'term' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : null}
        {icon === 'rate' ? <><circle cx="8" cy="8" r="2" /><circle cx="16" cy="16" r="2" /><path d="M18 6 6 18" /></> : null}
        {icon === 'cycle' ? <><path d="M20 7h-5V2M4 17h5v5" /><path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 7M4 17l2.3.6A7 7 0 0 0 17.9 15" /></> : null}
        {icon === 'note' ? <><path d="M4 3h12l4 4v14H4z" /><path d="M16 3v5h4M8 12h8M8 16h6" /></> : null}
      </svg>
      <span>{children}</span>
    </span>
  );
}

function LoanFields({ value, setValue, options }: { value: LoanForm; setValue: (value: LoanForm) => void; options: FundOptions }) {
  const set = (key: string, next: string) => setValue({ ...value, [key]: next });
  return (
    <div className="loan-entry-form">
      <section className="loan-form-section" aria-labelledby="loan-primary-fields">
        <h3 id="loan-primary-fields">Thông tin khoản vay</h3>
        <div className="modal-grid loan-form-grid">
          <label>
            <LoanFieldLabel icon="calendar">Ngày vay *</LoanFieldLabel>
            <div className="custom-date-box">
              <span className="date-display-text">{formatDisplayDate(value.date)}</span>
              <input type="date" className="native-date-input vi-date-input" value={value.date} onChange={(event) => set('date', event.target.value)} />
            </div>
          </label>
          <label>
            <LoanFieldLabel icon="building">Nơi vay *</LoanFieldLabel>
            <select value={value.partner} onChange={(event) => set('partner', event.target.value)}>
              <option value="">Chọn nơi vay</option>
              {(options.loanPartners || []).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="full-width">
            <LoanFieldLabel icon="money">Số tiền *</LoanFieldLabel>
            <input inputMode="numeric" value={value.amount} placeholder="0" onChange={(event) => set('amount', formatVietnameseNumberInput(event.target.value, false))} />
          </label>
        </div>
      </section>
      <section className="loan-form-section" aria-labelledby="loan-interest-fields">
        <h3 id="loan-interest-fields">Kỳ hạn và lãi suất</h3>
        <div className="modal-grid loan-form-grid">
          <label>
            <LoanFieldLabel icon="term">Kỳ hạn (tháng)</LoanFieldLabel>
            <input inputMode="numeric" value={value.termMonths} placeholder="0" onChange={(event) => set('termMonths', event.target.value)} />
          </label>
          <label>
            <LoanFieldLabel icon="rate">Lãi suất năm (%)</LoanFieldLabel>
            <input inputMode="decimal" value={value.annualRate} placeholder="0" onChange={(event) => set('annualRate', event.target.value)} />
          </label>
          <label>
            <LoanFieldLabel icon="cycle">Chu kỳ lãi (tháng)</LoanFieldLabel>
            <input inputMode="numeric" value={value.interestPeriodMonths} placeholder="0" onChange={(event) => set('interestPeriodMonths', event.target.value)} />
          </label>
          <label>
            <LoanFieldLabel icon="calendar">Ngày trả lãi đầu</LoanFieldLabel>
            <div className="custom-date-box">
              <span className="date-display-text">{formatDisplayDate(value.firstInterestDate)}</span>
              <input type="date" className="native-date-input vi-date-input" value={value.firstInterestDate} onChange={(event) => set('firstInterestDate', event.target.value)} />
            </div>
          </label>
          <label className="full-width">
            <LoanFieldLabel icon="note">Nội dung</LoanFieldLabel>
            <textarea rows={3} value={value.content} placeholder="Ghi chú khoản vay" onChange={(event) => set('content', event.target.value)} />
          </label>
        </div>
      </section>
    </div>
  );
}

function LoanDrawer({ rows, setRows, options, busy, closeRequest, close, submit }: { rows: LoanForm[]; setRows: (rows: LoanForm[]) => void; options: FundOptions; busy: boolean; closeRequest: number; close: () => void; submit: () => void }) {
  return (
    <DrawerShell
      id="fundLoanAddDrawer"
      title="Thêm khoản vay"
      close={close}
      closeRequest={closeRequest}
      footer={(requestClose) => (
        <>
          <button type="button" className="primary grow" onClick={submit} disabled={busy}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {busy ? 'Đang lưu…' : rows.length > 1 ? `Lưu ${rows.length} khoản vay` : 'Lưu khoản vay'}
          </button>
          <button type="button" className="ghost icon-button touch-action-btn" title="Nhân bản khoản vay cuối" aria-label="Nhân bản khoản vay cuối" onClick={() => setRows([...rows, { ...rows.at(-1)! }])} disabled={busy}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button type="button" className="secondary icon-button touch-action-btn" title="Thêm khoản vay" aria-label="Thêm khoản vay" onClick={() => setRows([...rows, blankLoan()])} disabled={busy}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button type="button" className="outline icon-button touch-action-btn" title="Hủy bỏ/Đóng" aria-label="Hủy bỏ/Đóng" onClick={requestClose}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}
    >
      <div className="loan-entry-rows">
        {rows.map((row, index) => (
          <section className="fund-transaction-row loan-entry-row table-card" key={index}>
            <div className="cashflow-transaction-row-head">
              <strong>Khoản vay {index + 1}</strong>
              {rows.length > 1 ? (
                <button type="button" className="danger btn-table-action touch-action-btn" aria-label={`Xóa khoản vay ${index + 1}`} title="Xóa khoản vay" onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))} disabled={busy}>
                  <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
            </div>
            <LoanFields value={row} setValue={(value) => setRows(rows.map((item, rowIndex) => (rowIndex === index ? value : item)))} options={options} />
          </section>
        ))}
      </div>
    </DrawerShell>
  );
}

function PaymentDrawer({ value, setValue, busy, closeRequest, close, submit }: { value: PaymentForm; setValue: (value: PaymentForm) => void; busy: boolean; closeRequest: number; close: () => void; submit: () => void }) {
  const set = (key: string, next: string) => setValue({ ...value, [key]: next });
  return (
    <DrawerShell
      id="fundLoanPaymentDrawer"
      title="Thanh toán khoản vay"
      close={close}
      closeRequest={closeRequest}
      footer={(requestClose) => (
        <>
          <button type="button" className="primary grow" onClick={submit} disabled={busy}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {busy ? 'Đang lưu…' : 'Lưu thanh toán'}
          </button>
          <button type="button" className="outline icon-button touch-action-btn" title="Hủy bỏ/Đóng" aria-label="Hủy bỏ/Đóng" onClick={requestClose}>
            <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}
    >
      <div className="modal-grid">
        <label>
          <span>Ngày thanh toán *</span>
          <div className="custom-date-box">
            <span className="date-display-text">{formatDisplayDate(value.date)}</span>
            <input type="date" className="native-date-input vi-date-input" value={value.date} onChange={(event) => set('date', event.target.value)} />
          </div>
        </label>
        <label>
          <span>Mã vay *</span>
          <input value={value.code} readOnly />
        </label>
        <label>
          <span>Loại *</span>
          <select value={value.type} onChange={(event) => set('type', event.target.value)}>
            <option>Trả nợ</option>
            <option>Trả gốc</option>
            <option>Trả lãi</option>
          </select>
        </label>
        <label>
          <span>Nơi vay *</span>
          <input value={value.partner} readOnly />
        </label>
        <label>
          <span>Số tiền *</span>
          <input inputMode="numeric" value={value.amount} onChange={(event) => set('amount', formatVietnameseNumberInput(event.target.value, false))} />
        </label>
        <label className="full-width">
          <span>Nội dung</span>
          <textarea value={value.content} onChange={(event) => set('content', event.target.value)} />
        </label>
      </div>
    </DrawerShell>
  );
}
