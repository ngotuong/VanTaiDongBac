const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('client_supabase_cache.html').replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadCache(overrides = {}) {
  const context = vm.createContext({
    URL,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    unescape,
    encodeURIComponent,
    getSupabaseConfig: () => ({ url: 'https://example.supabase.co', anonKey: 'anon-key', reportsEnabled: true }),
    getSupabaseAccessToken: () => Promise.resolve('user-token'),
    getLinks: () => ({ spreadsheet: 'https://docs.google.com/spreadsheets/d/sheet-id-1/edit' }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
    ...overrides
  });
  new vm.Script(source, { filename: 'client_supabase_cache.html' }).runInContext(context);
  return context;
}

test('Supabase cache readiness preserves flag, URL, and anon-key reasons', () => {
  let config = { url: '', anonKey: '', reportsEnabled: false };
  const cache = loadCache({ getSupabaseConfig: () => config });
  assert.deepEqual(plain(cache.getSupabaseReportStatus()), {
    ok: false, reason: 'VITE_SUPABASE_REPORTS_ENABLED chưa bật hoặc chưa được build vào frontend.'
  });
  config = { url: '', anonKey: 'key', reportsEnabled: true };
  assert.equal(cache.getSupabaseReportStatus().reason, 'Thiếu VITE_SUPABASE_URL trên frontend.');
  config = { url: 'https://example.supabase.co', anonKey: '', reportsEnabled: true };
  assert.equal(cache.getSupabaseReportStatus().reason, 'Thiếu VITE_SUPABASE_ANON_KEY trên frontend.');
  config = { url: 'https://example.supabase.co', anonKey: 'key', reportsEnabled: true };
  assert.deepEqual(plain(cache.getSupabaseReportStatus()), { ok: true, reason: '' });
  assert.equal(cache.canUseSupabaseReports(), true);
});

test('Supabase row reader preserves REST URL, filters, ordering, limit, and authenticated headers', async () => {
  let request;
  const cache = loadCache({
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => [{ payload: { ok: true } }] };
    }
  });
  const rows = await cache.readSupabaseRows('report bundles', { report_month: '07/2026', spreadsheet_id: 'sheet/1' }, 'report_month,payload,synced_at');
  assert.equal(rows.length, 1);
  const url = new URL(request.url);
  assert.equal(url.pathname, '/rest/v1/report%20bundles');
  assert.equal(url.searchParams.get('select'), 'report_month,payload,synced_at');
  assert.equal(url.searchParams.get('report_month'), 'eq.07/2026');
  assert.equal(url.searchParams.get('spreadsheet_id'), 'eq.sheet/1');
  assert.equal(url.searchParams.get('order'), 'synced_at.desc');
  assert.equal(url.searchParams.get('limit'), '1');
  assert.deepEqual(plain(request.options.headers), {
    apikey: 'anon-key', Authorization: 'Bearer user-token', Accept: 'application/json'
  });
});

test('Supabase row reader preserves disabled and HTTP error contracts', async () => {
  const disabled = loadCache({
    getSupabaseConfig: () => ({ url: '', anonKey: '', reportsEnabled: false })
  });
  await assert.rejects(() => disabled.readSupabaseRows('report_bundles', {}), {
    message: 'VITE_SUPABASE_REPORTS_ENABLED chưa bật hoặc chưa được build vào frontend.'
  });

  const failed = loadCache({
    fetch: async () => ({ ok: false, status: 503, text: async () => 'temporarily unavailable' })
  });
  await assert.rejects(() => failed.readSupabaseRows('report_bundles', {}), {
    message: 'Supabase đọc cache thất bại, status: 503. temporarily unavailable'
  });
});

test('Supabase payload reader preserves cache metadata and rejects missing/error payloads', async () => {
  const cache = loadCache({
    fetch: async () => ({ ok: true, status: 200, json: async () => [{ payload: { ok: true, value: 9 }, synced_at: '2026-07-12T00:00:00Z' }] })
  });
  assert.deepEqual(plain(await cache.readSupabasePayload('startup_bundles', { form_type: 'vanChuyen' })), {
    ok: true, value: 9, supabaseCached: true, supabaseSyncedAt: '2026-07-12T00:00:00Z'
  });

  const missing = loadCache();
  await assert.rejects(() => missing.readSupabasePayload('startup_bundles', {}, 'missing cache'), { message: 'missing cache' });
  const errored = loadCache({
    fetch: async () => ({ ok: true, status: 200, json: async () => [{ payload: { ok: false, error: 'cached error' } }] })
  });
  await assert.rejects(() => errored.readSupabasePayload('startup_bundles', {}), { message: 'cached error' });
});

test('Supabase bundle readers preserve table/filter mapping and report spreadsheet scope', async () => {
  const requests = [];
  const cache = loadCache({
    fetch: async (url) => {
      requests.push(new URL(url));
      return { ok: true, status: 200, json: async () => [{ payload: { ok: true }, synced_at: 'now' }] };
    }
  });
  await cache.readReportBundleFromSupabase('07/2026');
  await cache.readStartupFromSupabase('vanChuyen');
  await cache.readCatalogsFromSupabase('dau');
  await cache.readManageMonthDataFromSupabase('NL_VanChuyen', '2026-07');
  await cache.readFundOverviewFromSupabase('2026', '07/2026');
  await cache.readFundTransactionsFromSupabase('2026', {});
  await cache.readFundTransactionMonthFromSupabase('2026', '2026-07');
  await cache.readFundLoanOverviewFromSupabase('2026', '07/2026');

  const summary = requests.map((url) => ({
    table: url.pathname.split('/').pop(),
    filters: Object.fromEntries([...url.searchParams.entries()].filter(([key]) => !['select', 'order', 'limit'].includes(key)))
  }));
  assert.deepEqual(summary, [
    { table: 'report_bundles', filters: { report_month: 'eq.07/2026', spreadsheet_id: 'eq.sheet-id-1' } },
    { table: 'startup_bundles', filters: { form_type: 'eq.vanChuyen' } },
    { table: 'catalog_bundles', filters: { catalog_key: 'eq.catalogs:dau' } },
    { table: 'manage_data_bundles', filters: { sheet_name: 'eq.NL_VanChuyen', filter_key: 'eq.month:2026-07' } },
    { table: 'fund_overview_bundles', filters: { year: 'eq.2026', month_key: 'eq.2026-07' } },
    { table: 'fund_transaction_bundles', filters: { year: 'eq.2026', filter_key: 'eq.recent_500' } },
    { table: 'fund_transaction_bundles', filters: { year: 'eq.2026', filter_key: 'eq.month:2026-07' } },
    { table: 'fund_loan_bundles', filters: { year: 'eq.2026', month_key: 'eq.2026-07' } }
  ]);
});

test('client_supabase_cache is loaded after API auth dependencies and uniquely owns cache globals', () => {
  for (const file of ['index.template.html', 'client.html']) {
    const html = read(file);
    assert.ok(html.indexOf("include('client_api')") < html.indexOf("include('client_supabase_cache')"));
  }
  const fragments = fs.readdirSync(root).filter((name) => /^client_.*\.html$/.test(name));
  for (const functionName of ['getSupabaseReportStatus', 'readSupabaseRows', 'readSupabasePayload', 'readReportBundleFromSupabase', 'readFundTransactionsFromSupabase']) {
    const owners = fragments.filter((file) => new RegExp(`function ${functionName}\\s*\\(`).test(read(file)));
    assert.deepEqual(owners, ['client_supabase_cache.html'], `${functionName} must have one frontend owner`);
  }
});
