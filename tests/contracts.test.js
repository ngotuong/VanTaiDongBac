const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Apps Script and browser fragments are syntactically valid JavaScript', () => {
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.gs'))) {
    assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }));
  }
  for (const file of fs.readdirSync(root).filter((name) => name.startsWith('client_') && name.endsWith('.html'))) {
    const source = read(file);
    const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    scripts.forEach((match, index) => {
      assert.doesNotThrow(() => new vm.Script(match[1], { filename: `${file}#${index + 1}` }));
    });
  }
  assert.doesNotThrow(() => new vm.Script(read('api/app.js'), { filename: 'api/app.js' }));
  const builtScripts = [...read('index.html').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  builtScripts.forEach((match, index) => {
    if (match[0].includes(' src=')) return;
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: `index.html#${index + 1}` }));
  });
});

test('queue uses atomic claims and blocks asynchronous physical deletes', () => {
  const service = read('SupabaseService.gs');
  const worker = read('WriteJobWorker.gs');
  const migration = read('supabase/migrations/006_write_queue_hardening.sql');
  assert.match(service, /claimJobs: function \(payload\) \{ return callRpc_\('claim_write_jobs', payload\); \}/);
  assert.match(worker, /p_stale_seconds: STALE_SECONDS/);
  assert.doesNotMatch(service, /status:\s*'in\.\(pending,processing\)'/);
  assert.match(service, /từ chối deleteRow\(\)/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /write_jobs_module_idempotency_idx/);
});

test('fund queue has stable vouchers and remains disabled by default', () => {
  const service = read('SupabaseService.gs');
  const fund = read('FundService.gs');
  assert.match(service, /ASYNC_FUND_TRANSACTION_ADD_ENABLED = readBooleanProperty_\('ASYNC_FUND_TRANSACTION_ADD_ENABLED', false\)/);
  assert.match(service, /clientRequestId/);
  assert.match(fund, /idempotentReplay: true/);
  assert.match(fund, /clean_\(payload\.voucher\) \|\| buildVoucher_/);
});

test('auth migration revokes anon and API proxy validates allowlist', () => {
  const allowlistMigration = read('supabase/migrations/007_auth_hardening.sql');
  const cutoverMigration = read('supabase/migrations/008_authenticated_read_cutover.sql');
  const proxy = read('api/app.js');
  assert.match(cutoverMigration, /'write_jobs'/);
  assert.match(cutoverMigration, /revoke all on public\.%I from anon/i);
  assert.match(allowlistMigration, /is_active_app_user\(\)/);
  assert.match(proxy, /auth\/v1\/user/);
  assert.match(proxy, /app_users\?select=/);
  assert.doesNotMatch(proxy, /console\.log/);
});

test('shareholder role is read-only and account administration stays admin-only', () => {
  const migration = read('supabase/migrations/009_shareholder_role.sql');
  const proxy = read('api/app.js');
  const template = read('index.template.html');
  const accounts = read('client_accounts.html');
  assert.match(migration, /'shareholder'/);
  assert.match(proxy, /SHAREHOLDER_ACTIONS/);
  assert.match(proxy, /Tài khoản cổ đông chỉ có quyền xem dữ liệu/);
  assert.match(proxy, /function assertAdmin/);
  assert.match(proxy, /changeOwnPassword/);
  assert.match(proxy, /resetUserPassword/);
  assert.match(template, /data-write-only/);
  assert.match(template, /Quản lý tài khoản/);
  assert.doesNotMatch(template, /Cấu hình đường dẫn Web App/);
  assert.doesNotMatch(template, /darkModeToggle/);
  assert.match(accounts, /function requireWritePermission/);
  assert.match(read('client_api.html'), /dongbac_auth_username/);
  assert.doesNotMatch(read('client_api.html'), /setItem\([^\n]*password/i);
});

test('loan reconciliation safely matches one orphan settlement by partner and exact balance', () => {
  const source = read('FundService.gs');
  const start = source.indexOf('  function resolveLoanPaymentCodes_');
  const end = source.indexOf('\n  function buildLoanSummaryMap_', start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {
    normalizeHeader_: (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  const rows = [
    { rowIndex: 4, code: 'LOAN-A', type: 'Vay', partner: 'Quang Quân', amount: 5752000, dateObj: new Date('2026-05-25') },
    { rowIndex: 5, code: 'LOAN-B', type: 'Vay', partner: 'Quang Quân', amount: 5752000, dateObj: new Date('2026-05-25') },
    { rowIndex: 8, code: 'LOAN-A', type: 'Trả nợ', partner: 'Quang Quân', amount: 5752000, dateObj: new Date('2026-06-20') },
    { rowIndex: 9, code: 'WRONG-CODE', type: 'Trả nợ', partner: 'Quang Quân', amount: 5752000, dateObj: new Date('2026-06-20') }
  ];
  const resolved = sandbox.resolveLoanPaymentCodes_(rows);
  assert.equal(resolved[2].loanKey, 'LOAN-A');
  assert.equal(resolved[3].loanKey, 'LOAN-B');
  assert.equal(resolved[3].reconciledFromCode, 'WRONG-CODE');
  assert.match(source, /isCurrentlySettled/);
  assert.match(source, /currentSettlementDateText/);
  assert.doesNotMatch(read('index.template.html'), /<th>Mã vay<\/th>/);
  assert.match(read('client_cashflow.html'), /Đã tất toán/);
});

test('password policy accepts any value with at least six characters', () => {
  const proxy = read('api/app.js');
  const accounts = read('client_accounts.html');
  const template = read('index.template.html');
  assert.match(proxy, /newPassword\.length < 6/);
  assert.match(accounts, /newPassword\.length < 6/);
  assert.match(template, /minlength="6"/);
  assert.doesNotMatch(proxy, /newPassword\.length < 12/);
});
