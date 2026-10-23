const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadMode(propertyValue, shouldThrow = false) {
  let currentValue = propertyValue;
  const logs = [];
  const context = vm.createContext({
    console: { log: (value) => logs.push(value) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => {
          if (shouldThrow) throw new Error('properties unavailable');
          return currentValue;
        },
        setProperty: (_name, value) => {
          currentValue = value;
        }
      })
    }
  });
  new vm.Script(read('ReportCacheMode.gs'), { filename: 'ReportCacheMode.gs#test' }).runInContext(context);
  context.ReportCacheMode.getReportCacheModeForMigration = context.getReportCacheModeForMigration;
  context.ReportCacheMode.setReportCacheModeForMigration = context.setReportCacheModeForMigration;
  context.ReportCacheMode.setReportCacheModeDualForMigration = context.setReportCacheModeDualForMigration;
  context.ReportCacheMode.setReportCacheModeSheetForMigration = context.setReportCacheModeSheetForMigration;
  context.ReportCacheMode.setReportCacheModeSupabaseForMigration = context.setReportCacheModeSupabaseForMigration;
  context.ReportCacheMode.logs = logs;
  return context.ReportCacheMode;
}

test('retired REPORT_CACHE_MODE is permanently Supabase-only', () => {
  assert.equal(loadMode(null).get(), 'supabase');
  assert.equal(loadMode('  DUAL ').get(), 'supabase');
  assert.equal(loadMode('supabase').get(), 'supabase');
  assert.equal(loadMode('invalid').get(), 'supabase');
  assert.equal(loadMode(null, true).get(), 'supabase');
});

test('migration helpers expose Supabase retirement state and reject sheet or dual rollback', () => {
  const mode = loadMode('sheet');
  assert.deepEqual(JSON.parse(JSON.stringify(mode.getReportCacheModeForMigration())), {
    configured: 'sheet',
    effective: 'supabase',
    behavior: { mode: 'supabase', readSource: 'supabase', writeSheet: false, writeSupabase: true, sheetCacheRetired: true }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(mode.setReportCacheModeForMigration(' supabase '))), {
    previous: 'sheet',
    configured: 'supabase',
    effective: 'supabase',
    behavior: { mode: 'supabase', readSource: 'supabase', writeSheet: false, writeSupabase: true, sheetCacheRetired: true }
  });
  assert.equal(mode.get(), 'supabase');
  assert.throws(() => mode.setReportCacheModeForMigration('invalid'), /retired/);
  assert.throws(() => mode.setReportCacheModeSheetForMigration(), /retired/);
  assert.throws(() => mode.setReportCacheModeDualForMigration(), /retired/);
  assert.equal(mode.setReportCacheModeSupabaseForMigration().effective, 'supabase');
  assert.equal(mode.logs.length, 3);
});

test('E1.3 editor wrappers run one batch and audit Supabase metadata only', () => {
  const source = read('ReportCacheMode.gs');
  const realtime = read('SupabaseService.gs');
  assert.match(source, /function runReportCacheParityBatchForMigration\(\)/);
  assert.match(source, /syncAllReportBundlesToSupabase\(\)/);
  assert.match(source, /REPORT_CACHE_E1_LAST_BATCH_VERSION/);
  assert.match(source, /REPORT_CACHE_E1_PARITY_RUNNING/);
  assert.match(source, /SUPABASE_REALTIME_TICK_RUNNING/);
  assert.match(source, /guardLock\.waitLock\(30000\)/);
  assert.match(source, /properties\.deleteProperty\(parityProperty\)/);
  assert.match(realtime, /REPORT_CACHE_E1_PARITY_RUNNING_PROP = 'REPORT_CACHE_E1_PARITY_RUNNING'/);
  assert.match(realtime, /startLock\.tryLock\(1000\)/);
  assert.match(realtime, /E1 report cache parity window is active/);
  assert.match(realtime, /props\.setProperty\(yearPropertyKey_\(REALTIME_TICK_RUNNING_CACHE_KEY\)/);
  assert.match(source, /realtimeRunningKey = 'SUPABASE_REALTIME_TICK_RUNNING' \+ \(activeYear \? '_' \+ activeYear : ''\)/);
  assert.match(source, /reportRealtimeLeaseActive_\(properties\.getProperty\(realtimeRunningKey\)\)/);
  assert.match(source, /function getReportCacheSupabaseAuditForMigration\(\)/);
  assert.match(source, /select: 'report_month,cache_version,source_data_version,details_hash,synced_at'/);
  const metadataAudit = source.slice(
    source.indexOf('function getReportCacheSupabaseAuditForMigration()'),
    source.indexOf('/** Compares normalized Sheet-cache details')
  );
  assert.doesNotMatch(metadataAudit, /select: '[^']*payload/);
});

test('E1.3 payload parity audit is bounded, normalized, and never force-refreshes reports', () => {
  const source = read('ReportCacheMode.gs');
  assert.match(source, /function getReportCachePayloadParityAuditForMigration\(\)/);
  assert.match(source, /cacheSheet\.getLastRow\(\) - 499/);
  assert.match(source, /matchedRows === 39/);
  assert.match(source, /supabaseRows\.length === 4/);
  assert.match(source, /DashboardService\.aggregateDetailMatrices\(monthlyMatrices\)/);
  assert.match(source, /CacheAuditService\.hashPayload\(sheetDetails\)/);
  assert.match(source, /ValidationService\.parseNumber\(value, false\)/);
  assert.doesNotMatch(source, /getReportCachePayloadParityAuditForMigration[\s\S]*?getReportBundle\([^)]*,\s*true\)/);
});

test('E1.4 cutover helper enforces Supabase mode, no Sheet append, four bundles, and dual rollback', () => {
  const source = read('ReportCacheMode.gs');
  assert.match(source, /function setReportCacheModeSupabaseForMigration\(\)/);
  assert.match(source, /function runReportCacheSupabaseCutoverBatchForMigration\(\)/);
  assert.match(source, /requires REPORT_CACHE_MODE=supabase/);
  assert.match(source, /REPORT_CACHE_E1_CUTOVER_BASELINE_ROW/);
  assert.match(source, /REPORT_CACHE_E1_CUTOVER_AFTER_ROW/);
  assert.match(source, /result\.synced !== 4/);
  assert.match(source, /afterRow !== baselineRow/);
  assert.match(source, /setReportCacheModeForMigration\(ReportCacheMode\.DUAL\)/);
  assert.match(source, /Rolled back REPORT_CACHE_MODE to/);
});

test('E1.4 post-cutover audit is read-only and requires stable Sheet row plus current four-month metadata', () => {
  const source = read('ReportCacheMode.gs');
  const audit = source.slice(
    source.indexOf('function getReportCacheCutoverAuditForMigration()'),
    source.indexOf('function runReportCacheGuardedBatch_')
  );
  assert.match(audit, /baselineRow === batchAfterRow && batchAfterRow === currentRow/);
  assert.match(audit, /rows\.length === 4/);
  assert.match(audit, /metadataComplete/);
  assert.match(audit, /'05\/2026', '06\/2026', '07\/2026', 'Tất cả'/);
  assert.match(audit, /report_month: 'in\.\(\"05\/2026\",\"06\/2026\",\"07\/2026\",\"Tất cả\"\)'/);
  assert.match(audit, /select: 'report_month,cache_version,source_data_version,details_hash,synced_at'/);
  assert.doesNotMatch(audit, /setProperty|setReportCacheModeForMigration|syncAllReportBundlesToSupabase|forceRefresh/);
});

test('report cache mode ignores legacy values and describes the retired Sheet cache', () => {
  const mode = loadMode(null);
  assert.deepEqual(JSON.parse(JSON.stringify(mode.describe('sheet'))), {
    mode: 'supabase', readSource: 'supabase', writeSheet: false, writeSupabase: true, sheetCacheRetired: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(mode.describe('dual'))), {
    mode: 'supabase', readSource: 'supabase', writeSheet: false, writeSupabase: true, sheetCacheRetired: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(mode.describe('supabase'))), {
    mode: 'supabase', readSource: 'supabase', writeSheet: false, writeSupabase: true, sheetCacheRetired: true
  });
});

test('migration 010 is additive and preserves one report bundle row per workbook/month', () => {
  const sql = read('supabase/migrations/010_report_cache_cutover_foundation.sql');
  assert.match(sql, /alter table public\.report_bundles/);
  assert.match(sql, /add column if not exists cache_version text/);
  assert.match(sql, /add column if not exists source_data_version text/);
  assert.match(sql, /add column if not exists details_hash text/);
  assert.match(sql, /report_bundles_details_hash_format/);
  assert.match(sql, /report_bundles_cache_version_lookup_idx/);
  assert.doesNotMatch(sql, /\b(drop table|truncate|delete from|drop column)\b/i);

  const base = read('supabase/migrations/001_report_bundles.sql');
  assert.match(base, /primary key \(spreadsheet_id, report_month\)/);
});

test('SheetService reads Supabase then live-computes and never touches SYS_ReportCache', () => {
  const source = read('SheetService.gs');
  assert.match(source, /reportCacheMode: ReportCacheMode\.get\(\)/);
  assert.match(source, /SupabaseReportCacheRepository\.readDetailsMap/);
  assert.match(source, /SupabaseReportCacheRepository\.upsertBundle/);
  assert.match(source, /supabase_report_cache_read_failed_live_compute_next/);
  assert.doesNotMatch(source, /SheetReportCacheRepository\./);
  assert.doesNotMatch(source, /SYS_ReportCache/);
  assert.match(source, /beginReportRefreshBatch/);
});
