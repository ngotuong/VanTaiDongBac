const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'SupabaseReportCacheRepository.gs'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadRepository(rows = []) {
  const calls = { reads: [], upserts: [] };
  const context = vm.createContext({
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, value) {
        assert.equal(algorithm, 'SHA_256');
        return [...crypto.createHash('sha256').update(value, 'utf8').digest()].map((byte) => byte > 127 ? byte - 256 : byte);
      }
    },
    SupabaseBundleRepository: {
      readRows(tableName, query) { calls.reads.push({ tableName, query }); return rows; },
      upsertRows(tableName, values, onConflict) { calls.upserts.push({ tableName, values, onConflict }); }
    }
  });
  new vm.Script(source, { filename: 'SupabaseReportCacheRepository.gs#test' }).runInContext(context);
  return { repository: context.SupabaseReportCacheRepository, calls };
}

test('Supabase report cache reads only monthly detail matrices for one version', () => {
  const { repository, calls } = loadRepository([
    { report_month: '05/2026', payload: { overview: { details: [['May']] } } },
    { report_month: 'Tất cả', payload: { overview: { details: [['All']] } } },
    { report_month: '__dashboard_latest__', payload: { overview: { details: [['Dashboard']] } } },
    { report_month: '06/2026', payload: { overview: { details: [] } } }
  ]);
  const result = repository.readDetailsMap({
    spreadsheetId: 'sheet-1', cacheVersion: 'v13', dataVersion: 'version-1',
    clean: (value) => String(value || '').trim()
  });
  assert.deepEqual(plain(result), { '05/2026': [['May']] });
  assert.deepEqual(plain(calls.reads), [{
    tableName: 'report_bundles',
    query: {
      spreadsheet_id: 'eq.sheet-1', cache_version: 'eq.v13', source_data_version: 'eq.version-1',
      select: 'report_month,payload,cache_version,source_data_version,details_hash', limit: '100'
    }
  }]);
});

test('Supabase report cache upserts one complete bundle with lowercase SHA-256 metadata', () => {
  const { repository, calls } = loadRepository();
  const details = [['Danh mục', 'Tổng'], ['Doanh thu', 123]];
  const bundle = { overview: { details }, payroll: [['P']], vehicles: [['V']] };
  const row = repository.upsertBundle({
    spreadsheetId: 'sheet-1', reportMonth: '07/2026', bundle,
    cacheVersion: 'v13', dataVersion: 'version-1', syncedAt: '2026-07-19T00:00:00.000Z'
  });
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(details), 'utf8').digest('hex');
  assert.deepEqual(plain(row), {
    spreadsheet_id: 'sheet-1', report_month: '07/2026',
    source_sheet_names: ['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe', 'BC_TongHopDuAn'],
    payload: bundle, cache_version: 'v13', source_data_version: 'version-1',
    details_hash: expectedHash, synced_at: '2026-07-19T00:00:00.000Z'
  });
  assert.deepEqual(plain(calls.upserts), [{
    tableName: 'report_bundles', values: [plain(row)], onConflict: 'spreadsheet_id,report_month'
  }]);
  assert.match(row.details_hash, /^[0-9a-f]{64}$/);
});

test('detail hashing is stable for object key order', () => {
  const { repository } = loadRepository();
  assert.equal(repository.hashDetails([{ b: 2, a: 1 }]), repository.hashDetails([{ a: 1, b: 2 }]));
});
