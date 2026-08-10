const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const flat = (value) => value.replace(/\s+/g, ' ');

test('UI-6 Cashflow Module has tabular-nums font and sticky layout elements', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  assert.match(module, /tabular-nums/);
  assert.match(module, /sticky-col/);
  assert.match(module, /sticky-col-right/);
  assert.match(module, /sticky-total-foot/);
  assert.match(css, /UI-6 Cashflow Module Upgrade Styles/);
  assert.match(css, /position: sticky/);
});

test('UI-6 Cashflow Module replaces window.confirm with custom Delete Confirmation Modals', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  assert.doesNotMatch(module, /window\.confirm/);
  assert.match(module, /deletingTransaction/);
  assert.match(module, /deletingCatalogRow/);
  assert.match(module, /confirmDeleteTransaction/);
  assert.match(module, /confirmDeleteCatalog/);
  assert.match(module, /cashflow-delete-confirm-overlay/);
  assert.match(module, /cashflow-delete-confirm-modal/);
  assert.match(module, /Xác nhận xóa giao dịch/);
  assert.match(module, /Xác nhận xóa danh mục/);
  assert.match(css, /\.cashflow-delete-confirm-modal/);
});

test('UI-6 Cashflow Module applies income/expense color coding and touch-friendly buttons', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  assert.match(module, /badge.*emerald/);
  assert.match(module, /badge.*rose/);
  assert.match(module, /touch-action-btn/);
  assert.match(css, /\.cashflow-c2 \.touch-action-btn/);
  assert.match(css, /min-width: 44px !important/);
});

test('Cashflow KPI semantics survive the final UI-6 cascade and local refresh buttons stay removed', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/c2-golden.css');

  for (const tone of ['positive', 'negative', 'opening', 'closing', 'current', 'borrowed', 'principal-paid', 'interest-paid']) {
    assert.match(css, new RegExp(`fund-tone-${tone}`));
  }
  assert.match(css, /color: var\(--fund-kpi-accent\) !important/);
  assert.match(module, /className=\{`fund-kpi-card kpi-card \$\{colorClass\}`\}/);
  assert.doesNotMatch(module, /Làm mới dữ liệu Quỹ theo bộ lọc/);
  assert.doesNotMatch(module, /Làm mới danh sách thu chi/);
  assert.doesNotMatch(module, /Làm mới khoản vay/);
  assert.match(module, /data-shell-refresh/);
});

test('Cashflow publishes real page update metadata after initial and successful loads', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const server = read('next-shell/lib/cashflow-server.ts');
  const helper = read('next-shell/lib/platform/data-source-meta.ts');

  assert.match(module, /publishDataSourceMeta\(pageMetaPayload\)/);
  assert.match(module, /setPageMetaPayload\(nextOverview\)/);
  assert.match(flat(module), /cacheMonth \? \{ month: cacheMonth \}/);
  assert.match(server, /monthly\?\{month\}:\{\}/);
  assert.match(helper, /Asia\/Ho_Chi_Minh/);
  assert.match(helper, /new CustomEvent\('vtdb:dashboard-meta'/);
  assert.doesNotMatch(module, /Vui lòng chờ/);
});

test('Cashflow swaps opening/current balance colors without changing borrowed money semantics', () => {
  const css = read('next-shell/app/c2-golden.css');
  assert.match(css, /\.fund-kpi-card\.kpi-card\.fund-tone-opening \{\s*--fund-kpi-accent: #6d28d9/);
  assert.match(css, /\.fund-kpi-card\.kpi-card\.fund-tone-current \{\s*--fund-kpi-accent: #0369a1/);
  assert.match(css, /\.fund-kpi-card\.kpi-card\.fund-tone-borrowed \{\s*--fund-kpi-accent: #0369a1/);
  assert.match(css, /\.fund-export-value\.fund-tone-opening \{ color: #6d28d9/);
  assert.match(css, /\.fund-export-value\.fund-tone-current \{ color: #0369a1/);
});

test('Cashflow transactions keep search and create action inside the shared filter card', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(flat(module), /className="primary cashflow-filter-add touch-action-btn"[^>]*> ＋ Nhập mới /);
  assert.match(module, /className="cashflow-filter-search-input"/);
  assert.match(module, /aria-label="Tìm kiếm giao dịch thu chi"/);
  assert.doesNotMatch(module, /fund-transaction-toolbar/);
  assert.doesNotMatch(module, />Tìm kiếm<input/);
  assert.doesNotMatch(module, /cashflow-shared-filter-note/);
  assert.match(css, /\.cashflow-filter-add \{/);
  assert.match(css, /\.cashflow-filter-search-input \{/);
});

test('Cashflow loans reuse the shared create action without a duplicate title card', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(module, /tab === ["']loans["'] \? openLoan/);
  assert.match(module, /tab === ["']loans["'] \? ["']Nhập khoản vay mới["']/);
  assert.doesNotMatch(module, /cashflow-loan-toolbar/);
  assert.doesNotMatch(module, /<h2 className="panel-title">Khoản vay<\/h2>/);
});

test('Loan writes give immediate feedback and keep the displayed cache Supabase-first', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const submitStart = module.indexOf('const submitLoan = async () =>');
  const submitEnd = module.indexOf('const openPayment =', submitStart);
  const submitLoan = module.slice(submitStart, submitEnd);

  assert.match(submitLoan, /showToast\(loanRows\.length > 1/);
  assert.match(submitLoan, /for \(const loan of loanRows\)/);
  assert.match(submitLoan, /applyOptimisticLoan\(nextLoans, loan, saved, startDate, endDate\)/);
  assert.match(submitLoan, /setLoanRows\(loanRows\.slice\(savedCount\)\)/);
  assert.match(submitLoan, /Cache Supabase sẽ tự đồng bộ nền/);
  assert.doesNotMatch(submitLoan, /refresh\('loans', true\)/);
  assert.doesNotMatch(submitLoan, /refresh\('overview', true\)/);
});

test('Transaction writes show immediate feedback and return to Supabase without an Apps Script cache switch', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const submitStart = module.indexOf('const submitTransactions = async () =>');
  const submitEnd = module.indexOf('const deleteTransaction =', submitStart);
  const submitTransactions = module.slice(submitStart, submitEnd);

  assert.match(submitTransactions, /showToast\('Đang lưu giao dịch…', 'loading'\)/);
  assert.match(submitTransactions, /setJobs\(\(old\) =>/);
  assert.match(submitTransactions, /setTransactions\(nextTransactions\)/);
  assert.doesNotMatch(submitTransactions, /refresh\('transactions', true\)/);
  assert.match(flat(module), /readSurface<FundTransactions>\(year, ['"]transactions['"], \{ startDate, endDate \}, false, true\)/);
  assert.doesNotMatch(flat(module), /readSurface<FundTransactions>\(year, ['"]transactions['"], \{\}, true\)/);
});

test('Loan entry supports real add, duplicate and remove actions with labelled SVG buttons', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /const \[loanRows, setLoanRows\] = useState<LoanForm\[]>\(\[blankLoan\(\)\]\)/);
  assert.match(module, /aria-label="Nhân bản khoản vay cuối"/);
  assert.match(module, /setRows\(\[\.\.\.rows, \{ \.\.\.rows\.at\(-1\)! \}\]\)/);
  assert.match(module, /aria-label="Thêm khoản vay"/);
  assert.match(module, /setRows\(\[\.\.\.rows, blankLoan\(\)\]\)/);
  assert.match(module, /Xóa khoản vay \$\{index \+ 1\}/);
  assert.match(module, /<svg className="btn-svg"/);
  assert.match(css, /#fundLoanAddDrawer \.loan-entry-row > \.cashflow-transaction-row-head \.btn-table-action \{[\s\S]*min-width: 44px !important;[\s\S]*min-height: 44px !important;/);
});

test('Loan entry form uses grouped vector-labelled touch-safe controls', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /className="loan-entry-form"/);
  assert.match(module, /Thông tin khoản vay/);
  assert.match(module, /Kỳ hạn và lãi suất/);
  for (const icon of ['calendar', 'building', 'money', 'term', 'rate', 'cycle', 'note']) {
    assert.match(module, new RegExp(`icon="${icon}"`));
  }
  assert.match(module, /className="cashflow-field-label"/);
  assert.match(css, /#fundLoanAddDrawer \.loan-form-grid[\s\S]*min-height: 44px !important/);
  assert.match(css, /@media \(max-width: 374px\)[\s\S]*grid-template-columns: 1fr !important/);
  assert.match(css, /Final loan-form lock[\s\S]*#fundLoanAddDrawer\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface[\s\S]*transform: translate3d\(0, var\(--drawer-swipe-offset\), 0\) !important/);
});

test('Cashflow paginates every long data table at 20 rows and removes technical helper copy', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(module, /const PAGE_SIZE = 20/);
  assert.match(module, /loanSummaryPage/);
  assert.match(module, /catalogPage/);
  assert.match(flat(module), /pageRows = rows\.slice\(\(currentPage - 1\) \* PAGE_SIZE, currentPage \* PAGE_SIZE\)/);
  assert.doesNotMatch(module, /Số dư do backend reconciliation xác nhận/);
  assert.doesNotMatch(module, /Chỉ ghi\/xóa nội dung trong native range CAIDAT do backend xác định/);
  assert.doesNotMatch(module, />Giá trị danh mục</);
});

test('Cashflow drawer stays above its backdrop even with legacy ID selectors', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /body > #fundTransactionAddDrawer\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface,[\s\S]*z-index: 99999 !important;[\s\S]*pointer-events: auto !important;/);
  assert.match(css, /\.cashflow-drawer-backdrop \{[\s\S]*z-index: 99998 !important;/);
});

test('Cashflow entry forms animate upward using the same swipe offset as dismissal', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /const \[entered, setEntered\] = useState\(false\)/);
  assert.match(flat(module), /requestAnimationFrame\(\(\) => setEntered\(true\)\)/);
  assert.match(module, /["']--drawer-swipe-offset["']:\s*entered \? ["']0px["'] : ["']100dvh["']/);
  assert.match(css, /body > #fundTransactionAddDrawer\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface,[\s\S]*transform: translate3d\(0, var\(--drawer-swipe-offset\), 0\) !important;/);
  assert.match(css, /transition: transform 280ms cubic-bezier\(\.16,1,\.3,1\)/);
});

test('Cashflow loan headers stay compact and history uses green/red cashflow colors with an icon payment action', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /fundLoanHistoryTone/);
  assert.match(module, /fundLoanAmountTone/);
  assert.match(module, /fund-loan-history-amount/);
  assert.match(module, /fund-loan-payment-icon/);
  assert.match(module, /aria-label=\{`Thanh toán khoản vay \$\{item\.partner\}`\}/);
  assert.match(module, /<rect x="3" y="5" width="18" height="14" rx="2"\s*\/>/);
  assert.doesNotMatch(module, />Thanh toán<\/button>/);
  assert.match(css, /html body \.cashflow-c2 \.fund-loan-summary-head \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) fit-content\(55%\)/);
  assert.match(flat(module), /type === ["']Vay["'] \? ["']emerald["'] : ["']rose["']/);
  assert.match(flat(module), /type === ["']Vay["'] \? ["']cash-in["'] : ["']cash-out["']/);
  assert.match(css, /\.cashflow-c2 \.fund-loan-history-amount\.cash-in/);
  assert.match(css, /\.cashflow-c2 \.fund-loan-history-amount\.cash-out/);
});

test('Cashflow card headings align consistently and transaction debt control stays beside its row title', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /className="table-card-head cashflow-section-head"/);
  assert.match(module, /<div className="table-title">Các khoản vay<\/div>/);
  assert.doesNotMatch(module, /Khoản vay đang theo dõi/);
  assert.match(module, /className="cashflow-transaction-row-actions"/);
  assert.match(module, /<strong>Giao dịch \{index \+ 1\}<\/strong>[\s\S]*className="fund-debt-toggle"/);
  assert.match(css, /\.cashflow-c2 \.table-card-head > \.table-title/);
  assert.match(css, /\.cashflow-c2 \.cashflow-transaction-row-actions/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
});

test('Cashflow keeps business filters compact without exposing implementation notes', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.doesNotMatch(module, /Ghi đúng 4 named range/);
  assert.doesNotMatch(module, /bút toán phù hợp/);
  assert.doesNotMatch(module, /className="panel-note">\{props\.total\}/);
  assert.match(module, /className="platform-visually-hidden">Loại<\/span>/);
  assert.match(module, /aria-label="Lọc lịch sử theo loại giao dịch"/);
  assert.match(module, /aria-label="Lọc lịch sử theo nơi vay"/);
  assert.match(css, /@media \(min-width: 769px\) \{[\s\S]*\.cashflow-filter-stack \{[\s\S]*grid-template-columns: max-content minmax\(360px, 1fr\)/);
  assert.match(css, /\.table-card-head\.fund-loan-history-head > \.fund-loan-history-filters \{[\s\S]*display: grid !important/);
  assert.match(css, /\.fund-loan-history-head \.table-title \{[\s\S]*font-size: 15px !important/);
});

test('Fixed-option filters use intrinsic width while search and date controls stay fluid', () => {
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');
  const report = read('next-shell/components/report/ReportModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(cashflow, /cashflow-quick-period-select platform-content-select/);
  assert.match(cashflow, /className="platform-content-select" aria-label="Lọc các khoản vay theo nơi vay"/);
  assert.match(cashflow, /className="platform-content-select" aria-label="Lọc lịch sử theo loại giao dịch"/);
  assert.match(cashflow, /className="platform-content-select" aria-label="Lọc lịch sử theo nơi vay"/);
  assert.match(report, /report-payroll-filter platform-content-select/);
  assert.match(manage, /Nguồn chi:<select className="platform-content-select"/);
  assert.match(catalog, /id="catalogVehicleOwnerFilter" className="platform-content-select"/);
  assert.match(css, /html body select\.platform-content-select \{[\s\S]*width: fit-content !important;[\s\S]*max-width: 100% !important;/);
  assert.match(css, /html body \.cashflow-c2 \.fund-loan-history-filters \{[\s\S]*grid-template-columns: repeat\(2, max-content\) !important;/);
  assert.match(css, /html body \.reports-filter-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) max-content !important;/);
});

test('Cashflow bottom-sheet headers are compact and align titles to the left', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /cashflow-fb-drawer-head \{[\s\S]*justify-content: flex-start !important/);
  assert.match(css, /cashflow-fb-drawer-head \{[\s\S]*height: 60px !important/);
  assert.match(css, /cashflow-fb-drawer-head > \.table-title \{[\s\S]*text-align: left !important/);
  assert.match(css, /cashflow-fb-drawer-head > \.cashflow-back-btn \{[\s\S]*min-width: 36px !important/);
});

test('Cashflow category detail removes the redundant header action and label while keeping date sticky', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /id="fundCategoryDetailDrawer"[\s\S]*hideHeaderClose/);
  assert.match(module, /aria-label="Lọc theo đối tác"/);
  assert.doesNotMatch(module, /className="cashflow-category-filter"[\s\S]{0,120}<span>Đối tác<\/span>/);
  assert.match(module, /<th className="sticky-col">Ngày<\/th>/);
  assert.match(module, /<td className="sticky-col">\{row\.dateText \|\| row\.date\}<\/td>/);
  assert.match(css, /#fundCategoryDetailDrawer table th\.sticky-col \{[\s\S]*left: 0 !important/);
  assert.match(css, /#fundCategoryDetailDrawer \.cashflow-category-filter select \{[\s\S]*height: var\(--platform-control-height\) !important/);
});

test('Cashflow company filter updates the loan cards as well as the tracked-loan table', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(module, /const filteredLoanMetrics = useMemo/);
  assert.match(flat(module), /partnerRows\.filter\(\(item\) => item\.type === ["']Vay["']\)/);
  assert.match(module, /principalPaid: partnerRows\.filter/);
  assert.match(module, /interestPaid: partnerRows\.filter/);
  assert.match(module, /outstanding: filteredLoans\.reduce/);
  assert.match(flat(module), /<Loans metrics=\{filteredLoanMetrics\}/);
  assert.match(module, /\(props\.metrics \|\| \[\]\)\.map/);
});

test('Business forms use two fields per row and table icons share the table background', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(css, /body \.cashflow-c2 \.modal-grid\.fields \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /\.entry-shell \.fields > label\.full,[\s\S]*grid-column: 1 \/ -1 !important/);
  assert.match(css, /\.report-table \.btn-table-action,[\s\S]*background: transparent !important;[\s\S]*border-color: transparent !important/);
  assert.match(css, /\.cashflow-c2 \.fund-loan-payment-icon,[\s\S]*background: transparent !important/);
  assert.match(module, /className="btn-table-action edit touch-action-btn"[\s\S]*<svg className="btn-svg"/);
  assert.match(module, /className="btn-table-action delete danger touch-action-btn"/);
  assert.match(manage, /className="btn-table-action edit touch-action-btn"[\s\S]*<svg className="btn-svg"/);
});

test('Cashflow prefetches the first Fund catalog group from Supabase', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(module, /const catalogPrefetchStarted = useRef\(false\)/);
  assert.match(flat(module), /readSurface<FundCatalog>\(year, ["']catalog["'], \{ group: ["']incomeCategories["'] \}\)/);
  assert.match(module, /catalogPrefetchStarted\.current = true/);
});

test('Cashflow success feedback stays in toast and each drawer owns one portal and backdrop', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(flat(module), /message && error \?/);
  assert.doesNotMatch(module, /role=\{error \? ["']alert["'] : ["']status["']\}/);
  assert.match(module, /function DrawerShell/);
  assert.match(flat(module), /<BodyPortal> <div className=\{`cashflow-drawer-backdrop/);
  assert.doesNotMatch(module, /\{drawer \? <BodyPortal>/);
  assert.match(module, /useSwipeDismiss\(\{ onDismiss: close \}\)/);
});

test('Every data module publishes route-scoped source metadata to prevent stale badges', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const helper = read('next-shell/lib/platform/data-source-meta.ts');
  for (const file of [
    'next-shell/components/dashboard/DashboardModule.tsx',
    'next-shell/components/report/ReportModule.tsx',
    'next-shell/components/manage/ManageReadOnlyModule.tsx',
    'next-shell/components/catalog/CatalogModule.tsx',
    'next-shell/components/cashflow/CashflowModule.tsx',
    'next-shell/components/entry/EntryModule.tsx',
    'next-shell/components/settings/SettingsModule.tsx',
    'next-shell/components/observability/ObservabilityModule.tsx'
  ]) {
    assert.match(read(file), /publishDataSourceMeta/);
  }
  assert.match(helper, /path: window\.location\.pathname/);
  assert.match(shell, /routesEqual\(dashboardMeta\.path, currentPath\)/);
  assert.match(shell, /Dữ liệu được đọc từ Supabase/);
});
