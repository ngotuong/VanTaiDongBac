const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadRepositories() {
  const calls = [];
  const context = vm.createContext({
    SupabaseHttpClient: {
      upsertRows(tableName, rows, onConflict) {
        calls.push({ operation: 'upsert', tableName, rows, onConflict });
        return undefined;
      },
      readRows(tableName, query) {
        calls.push({ operation: 'read', tableName, query });
        return [{ synthetic: true }];
      },
      updateRows(tableName, patch, filters) {
        calls.push({ operation: 'update', tableName, patch, filters });
      }
    }
  });
  new vm.Script(read('SupabaseBundleRepository.gs'), { filename: 'SupabaseBundleRepository.gs#test' }).runInContext(context);
  new vm.Script(read('SupabaseSyncStatusRepository.gs'), { filename: 'SupabaseSyncStatusRepository.gs#test' }).runInContext(context);
  return {
    bundles: context.SupabaseBundleRepository,
    statuses: context.SupabaseSyncStatusRepository,
    calls
  };
}

test('bundle repository preserves table, rows, conflict key, and query without transformation', () => {
  const { bundles, calls } = loadRepositories();
  const rows = [{ spreadsheet_id: 'synthetic-sheet', report_month: '07/2026', payload: { ok: true }, synced_at: '2026-07-11T10:00:00.000Z' }];
  const query = { spreadsheet_id: 'eq.synthetic-sheet', report_month: 'eq.07/2026', limit: '1' };
  bundles.upsertRows('report_bundles', rows, 'spreadsheet_id,report_month');
  const result = bundles.readRows('report_bundles', query);
  bundles.updateRows('report_bundles', { active: false }, query);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ synthetic: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { operation: 'upsert', tableName: 'report_bundles', rows, onConflict: 'spreadsheet_id,report_month' },
    { operation: 'read', tableName: 'report_bundles', query },
    { operation: 'update', tableName: 'report_bundles', patch: { active: false }, filters: query }
  ]);
});

test('sync-status repository fixes only the table and conflict key while preserving row and query', () => {
  const { statuses, calls } = loadRepositories();
  const row = {
    sync_key: 'manage_data:NL_VanChuyen:recent_500',
    module: 'manage',
    status: 'ok',
    message: 'Manage list cache synced.',
    synced_at: '2026-07-11T10:00:00.000Z'
  };
  const query = { select: 'sync_key,module,status,message,synced_at,updated_at', order: 'synced_at.desc', limit: 1 };
  statuses.upsert(row);
  statuses.readRows(query);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { operation: 'upsert', tableName: 'sync_status', rows: [row], onConflict: 'sync_key' },
    { operation: 'read', tableName: 'sync_status', query }
  ]);
});

test('SupabaseService routes only bundle persistence through the bundle repository', () => {
  const source = read('SupabaseService.gs');
  const startupCatalogSource = read('StartupCatalogSyncService.gs');
  const reportSyncSource = read('ReportSyncService.gs');
  const manageSyncSource = read('ManageSyncService.gs');
  const fundSyncSource = read('FundSyncService.gs');
  const bundleTables = [
    'TABLE_REPORT_BUNDLES',
    'TABLE_MANAGE_DATA_BUNDLES'
  ];
  bundleTables.forEach((table) => {
    assert.match(source, new RegExp(`SupabaseBundleRepository\\.(?:upsertRows|readRows)\\(${table}`));
    assert.doesNotMatch(source, new RegExp(`(?:upsertRows_|readRows_)\\(${table}`));
  });
  assert.match(startupCatalogSource, /context\.upsertRows\(TABLE_STARTUP_BUNDLES/);
  assert.match(startupCatalogSource, /context\.upsertRows\(TABLE_CATALOG_BUNDLES/);
  assert.match(reportSyncSource, /context\.upsertRows\(TABLE_REPORT_BUNDLES/);
  assert.match(manageSyncSource, /context\.upsertRows\(TABLE_MANAGE_DATA_BUNDLES/);
  assert.match(fundSyncSource, /context\.upsertRows\(TABLE_FUND_OVERVIEW_BUNDLES/);
  assert.match(fundSyncSource, /context\.upsertRows\(TABLE_FUND_TRANSACTION_BUNDLES/);
  assert.match(fundSyncSource, /context\.upsertRows\(TABLE_FUND_LOAN_BUNDLES/);
  assert.match(fundSyncSource, /context\.upsertRows\(TABLE_CATALOG_BUNDLES/);
  assert.match(source, /WriteJobRepository\.create\(row\)/);
  assert.match(source, /WriteJobRepository\.findByIdempotency/);
  assert.doesNotMatch(source, /SupabaseHttpClient\.(?:upsertRows|insertRows|readRows|updateRows)/);
});

test('sync status keeps its payload fields, fallback timestamp, error isolation, and response mapping', () => {
  const source = read('SupabaseService.gs');
  const writeStart = source.indexOf('  function writeSyncStatus_');
  const readStart = source.indexOf('  function getSupabaseSyncStatus', writeStart);
  const readEnd = source.indexOf('\n  function buildIdempotentJobId_', readStart);
  assert.ok(writeStart >= 0 && readStart > writeStart && readEnd > readStart);
  const writeBlock = source.slice(writeStart, readStart);
  const readBlock = source.slice(readStart, readEnd);
  assert.match(writeBlock, /SupabaseSyncStatusRepository\.upsert\(\{/);
  assert.match(writeBlock, /sync_key: syncKey/);
  assert.match(writeBlock, /synced_at: syncedAt \|\| new Date\(\)\.toISOString\(\)/);
  assert.match(writeBlock, /sync_status_failed:/);
  assert.match(readBlock, /SupabaseSyncStatusRepository\.readRows\(query\)/);
  assert.match(readBlock, /syncKey: row\.sync_key \|\| ''/);
  assert.match(readBlock, /ageSeconds:/);
});
