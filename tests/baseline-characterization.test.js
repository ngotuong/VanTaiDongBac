const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/baseline-characterization.json'));
const sorted = (values) => [...values].sort();
const actionsIn = (source) => sorted([...source.matchAll(/action === '([^']+)'/g)].map((match) => match[1]));

test('baseline manifest references runtime source files that still exist', () => {
  const files = Object.values(baseline.runtimeSources).flat();
  assert.equal(new Set(files).size, files.length, 'Runtime source list must not contain duplicates.');
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), `Missing baseline runtime source: ${file}`);
  }
});

test('PublicApi GET and POST action surfaces match the characterized baseline', () => {
  const source = read('PublicApi.gs');
  const getStart = source.indexOf("if (normalizedMethod === 'GET')");
  const postStart = source.indexOf("if (normalizedMethod === 'POST')");
  const methodEnd = source.indexOf("throw new Error('Phương thức không hợp lệ", postStart);
  assert.ok(getStart >= 0 && postStart > getStart && methodEnd > postStart, 'Could not locate invokeApi method blocks.');

  assert.deepEqual(actionsIn(source.slice(getStart, postStart)), sorted(baseline.publicApi.getActions));
  assert.deepEqual(actionsIn(source.slice(postStart, methodEnd)), sorted(baseline.publicApi.postActions));
});

test('Router-only and disabled actions remain explicit and outside PublicApi', () => {
  const router = read('Router.gs');
  const publicApi = read('PublicApi.gs');
  for (const action of baseline.publicApi.routerOnlyActions) {
    assert.match(router, new RegExp(`action === '${action}'`));
    assert.doesNotMatch(publicApi, new RegExp(`action === '${action}'`));
  }
  for (const action of baseline.publicApi.disabledActions) {
    assert.match(router, new RegExp(`action === '${action}'`));
    assert.match(router, /đã tắt để tránh ghi trùng dữ liệu/);
    assert.doesNotMatch(publicApi, new RegExp(`action === '${action}'`));
  }
});

test('proxy authentication and shareholder action surfaces match the baseline', () => {
  const proxy = read('api/app.js');
  const shareholderBlock = proxy.match(/const SHAREHOLDER_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(shareholderBlock, 'Missing SHAREHOLDER_ACTIONS block.');
  const shareholderActions = sorted([...shareholderBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));
  assert.deepEqual(shareholderActions, sorted(baseline.proxy.shareholderActions));

  for (const action of baseline.proxy.localAccountActions) {
    assert.match(proxy, new RegExp(`action === '${action}'|\\['[\\s\\S]*'${action}'`));
  }
  for (const action of baseline.proxy.unauthenticatedActions) {
    assert.match(proxy, new RegExp(`action !== '${action}'`));
  }
});

test('transport form-to-sheet configuration matches the baseline', () => {
  const source = read('AppConfig.gs');
  for (const [formType, config] of Object.entries(baseline.transportForms)) {
    const pattern = new RegExp(
      `${formType}: \\{ name: '${config.sheet}', headerRow: ${config.headerRow}, columns: ${config.columns} \\}`
    );
    assert.match(source, pattern, `Transport form mapping changed: ${formType}`);
  }
});

test('Supabase tables and stable cache/job keys remain represented in runtime and migrations', () => {
  const service = [
    read('SupabaseService.gs'),
    read('StartupCatalogSyncService.gs'),
    read('ReportSyncService.gs'),
    read('ManageSyncService.gs'),
    read('FundSyncService.gs'),
    read('SupabaseBundleRepository.gs'),
    read('SupabaseSyncStatusRepository.gs')
  ].join('\n');
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => read(path.join('supabase', 'migrations', file)))
    .join('\n');

  for (const table of [...baseline.supabase.cacheTables, ...baseline.supabase.operationalTables]) {
    assert.match(service, new RegExp(`'${table}'`), `Runtime no longer references ${table}.`);
    assert.match(migrations, new RegExp(`\\b${table}\\b`), `Migrations no longer define/reference ${table}.`);
  }
  assert.match(service, new RegExp(baseline.supabase.dashboardReportMonth));
  assert.match(service, /recent_500/);
  assert.match(service, /month:/);

  const writeJobsMigration = read('supabase/migrations/005_write_jobs.sql');
  for (const status of baseline.supabase.writeJobStatuses) {
    assert.match(writeJobsMigration, new RegExp(`'${status}'`));
  }
});

test('feature flag defaults match the characterized baseline', () => {
  const service = read('SupabaseService.gs');
  assert.match(service, new RegExp(`ASYNC_WRITE_ENABLED = ${baseline.featureFlags.ASYNC_WRITE_ENABLED}`));
  assert.match(service, new RegExp(`ASYNC_TRANSPORT_WRITE_ENABLED = ${baseline.featureFlags.ASYNC_TRANSPORT_WRITE_ENABLED}`));
  assert.match(
    service,
    new RegExp(`ASYNC_FUND_TRANSACTION_ADD_ENABLED = readBooleanProperty_\\('ASYNC_FUND_TRANSACTION_ADD_ENABLED', ${baseline.featureFlags.ASYNC_FUND_TRANSACTION_ADD_ENABLED}\\)`)
  );
  assert.match(read('SecurityService.gs'), /AUTH_ENFORCEMENT_ENABLED/);
  assert.match(read('scripts/build.js'), /VITE_AUTH_ENABLED/);
  assert.match(read('scripts/build.js'), /VITE_SUPABASE_REPORTS_ENABLED/);
});
