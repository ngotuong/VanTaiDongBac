const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadService() {
  const context = vm.createContext({
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, value) {
        assert.equal(algorithm, 'SHA_256');
        return [...crypto.createHash('sha256').update(value, 'utf8').digest()];
      },
      base64EncodeWebSafe(value) {
        return Buffer.from(value).toString('base64url');
      }
    }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#cache-audit-test' }).runInContext(context);
  new vm.Script(read('CacheAuditService.gs'), { filename: 'CacheAuditService.gs#test' }).runInContext(context);
  return context.CacheAuditService;
}

const service = loadService();
const plain = (value) => JSON.parse(JSON.stringify(value));

test('audit input normalization preserves defaults, comma parsing, order, and manage allowlist', () => {
  const months = ['05/2026', '06/2026', 'Tất cả'];
  const sheets = ['NL_VanChuyen', 'NL_Dau'];
  assert.deepEqual(plain(service.normalizeReportMonths('', months)), months);
  assert.deepEqual(plain(service.normalizeReportMonths(' 06/2026, Tất cả ', months)), ['06/2026', 'Tất cả']);
  assert.deepEqual(plain(service.normalizeManageSheets('', sheets)), sheets);
  assert.deepEqual(plain(service.normalizeManageSheets('NL_Dau,UNKNOWN,NL_VanChuyen', sheets)), ['NL_Dau', 'NL_VanChuyen']);
  assert.deepEqual(plain(service.normalizeManageSheets('UNKNOWN', sheets)), sheets);
});

test('stable hashing ignores object key order but preserves arrays and values', () => {
  const left = { b: 2, a: { y: [1, 2], x: 'value' } };
  const right = { a: { x: 'value', y: [1, 2] }, b: 2 };
  assert.equal(service.stableStringify(left), service.stableStringify(right));
  assert.equal(service.hashPayload(left), service.hashPayload(right));
  assert.notEqual(service.hashPayload(left), service.hashPayload({ ...right, b: 3 }));
});

test('report sanitizer ignores volatile fields and result formatting preserves ok, stale, and missing shapes', () => {
  const payload = { overview: { total: 10 }, payroll: [1], vehicles: [2], links: { report: true }, generatedAt: 'volatile-a' };
  const cached = { payload: { ...payload, generatedAt: 'volatile-b' }, synced_at: '2026-07-11T10:00:00Z' };
  const ok = service.buildReportResult('07/2026', cached, payload);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.ok, true);
  assert.equal(ok.liveHash, ok.cachedHash);

  const stale = service.buildReportResult('07/2026', cached, { ...payload, overview: { total: 11 } });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.ok, false);
  assert.notEqual(stale.liveHash, stale.cachedHash);

  assert.deepEqual(plain(service.buildReportResult('05/2026', null, null)), {
    month: '05/2026', ok: false, status: 'missing',
    message: 'Chưa có report_bundles cache cho kỳ này.', syncedAt: ''
  });
});

test('manage sanitizer limits rows, ignores volatile row fields, and keeps result messages and limits', () => {
  const payload = {
    ok: true,
    headers: ['Ngày', 'Xe'],
    rows: [
      { rowIndex: 3, values: ['11/07/2026', '30A-TEST'], volatile: 'ignored' },
      { rowIndex: 4, values: ['12/07/2026', '30A-TEST-2'] }
    ],
    checkedAt: 'ignored'
  };
  const cached = { payload, synced_at: '2026-07-11T10:00:00Z' };
  const ok = service.buildManageResult('NL_VanChuyen', 1, cached, payload);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.limit, 1);
  assert.match(ok.message, /1 dòng live/);

  const stale = service.buildManageResult('NL_VanChuyen', 1, cached, {
    ...payload,
    rows: [{ rowIndex: 3, values: ['11/07/2026', '30A-CHANGED'] }]
  });
  assert.equal(stale.status, 'stale');

  assert.deepEqual(plain(service.buildManageResult('NL_Dau', 500, null, null)), {
    sheetName: 'NL_Dau', ok: false, status: 'missing',
    message: 'Chưa có manage_data_bundles recent_500.', syncedAt: ''
  });
});

test('Supabase in-filter encoding retains quotes and backslash escaping', () => {
  assert.equal(service.encodeSupabaseInValue(' A"B\\C '), '"A\\"B\\\\C"');
});

test('SupabaseService retains live reads and delegates pure audit work only', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /ReportService\.getReportBundle\(month, true\)/);
  assert.match(source, /ManageService\.readManageData\(sheetName, '', '', auditLimit\)/);
  assert.match(source, /CacheAuditService\.buildReportResult/);
  assert.match(source, /CacheAuditService\.buildManageResult/);
  assert.doesNotMatch(source, /function stableStringify_/);
  assert.doesNotMatch(source, /function hashPayload_/);
});
