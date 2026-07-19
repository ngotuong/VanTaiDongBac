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

test('REPORT_CACHE_MODE defaults safely to sheet and accepts only declared modes', () => {
  assert.equal(loadMode(null).get(), 'sheet');
  assert.equal(loadMode('  DUAL ').get(), 'dual');
  assert.equal(loadMode('supabase').get(), 'supabase');
  assert.equal(loadMode('invalid').get(), 'sheet');
  assert.equal(loadMode(null, true).get(), 'sheet');
});

test('migration helpers expose the effective mode and reject undeclared writes', () => {
  const mode = loadMode('sheet');
  assert.deepEqual(JSON.parse(JSON.stringify(mode.getReportCacheModeForMigration())), {
    configured: 'sheet',
    effective: 'sheet',
    behavior: { mode: 'sheet', readSource: 'sheet', writeSheet: true, writeSupabase: false }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(mode.setReportCacheModeForMigration(' DUAL '))), {
    previous: 'sheet',
    configured: 'dual',
    effective: 'dual',
    behavior: { mode: 'dual', readSource: 'sheet', writeSheet: true, writeSupabase: true }
  });
  assert.equal(mode.get(), 'dual');
  assert.throws(() => mode.setReportCacheModeForMigration('invalid'), /Invalid REPORT_CACHE_MODE/);
  assert.equal(mode.get(), 'dual');
  assert.equal(mode.setReportCacheModeSheetForMigration().effective, 'sheet');
  assert.equal(mode.setReportCacheModeDualForMigration().effective, 'dual');
  assert.equal(mode.setReportCacheModeSupabaseForMigration().effective, 'supabase');
  assert.equal(mode.logs.length, 5);
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
  assert.match(realtime, /runtimeCache\.put\(REALTIME_TICK_RUNNING_CACHE_KEY/);
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

test('report cache mode describes read and write behavior for the next checkpoint', () => {
  const mode = loadMode(null);
  assert.deepEqual(JSON.parse(JSON.stringify(mode.describe('sheet'))), {
    mode: 'sheet', readSource: 'sheet', writeSheet: true, writeSupabase: false
  });
  assert.deepEqual(JSON.parse(JSON.stringify(mode.describe('dual'))), {
    mode: 'dual', readSource: 'sheet', writeSheet: true, writeSupabase: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(mode.describe('supabase'))), {
    mode: 'supabase', readSource: 'supabase', writeSheet: false, writeSupabase: true
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

test('SheetService wires the effective mode to Supabase read, Sheet write, and full-bundle upsert', () => {
  const source = read('SheetService.gs');
  assert.match(source, /reportCacheMode: ReportCacheMode\.get\(\)/);
  assert.match(source, /cacheMode\.readSource === ReportCacheMode\.SUPABASE/);
  assert.match(source, /if \(!ReportCacheMode\.describe\(\)\.writeSheet\) return/);
  assert.match(source, /if \(!ReportCacheMode\.describe\(\)\.writeSupabase\) return/);
  assert.match(source, /SupabaseReportCacheRepository\.readDetailsMap/);
  assert.match(source, /SupabaseReportCacheRepository\.upsertBundle/);
  assert.match(source, /beginReportRefreshBatch/);
});
