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
  assert.equal(mode.logs.length, 4);
});

test('E1.3 editor wrappers run one batch and audit Supabase metadata only', () => {
  const source = read('ReportCacheMode.gs');
  assert.match(source, /function runReportCacheParityBatchForMigration\(\)/);
  assert.match(source, /syncAllReportBundlesToSupabase\(\)/);
  assert.match(source, /REPORT_CACHE_E1_LAST_BATCH_VERSION/);
  assert.match(source, /function getReportCacheSupabaseAuditForMigration\(\)/);
  assert.match(source, /select: 'report_month,cache_version,source_data_version,details_hash,synced_at'/);
  assert.doesNotMatch(source, /select: '[^']*payload/);
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
