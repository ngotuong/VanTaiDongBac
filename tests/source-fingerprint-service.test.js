const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sandbox = vm.createContext({});
new vm.Script(fs.readFileSync(path.join(root, 'SourceFingerprintService.gs'), 'utf8')).runInContext(sandbox);
const service = sandbox.SourceFingerprintService;
const context = {
  resolveMonthKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : '';
  },
  hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  },
};

function state(rows) {
  return service.build(rows, context);
}

function versionedState(rows, versionTag) {
  return service.build(rows, { ...context, versionTag });
}

test('source fingerprint detects an edit far above the final rows and narrows refresh to its month', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => [`V${index}`, '', '', '', '', 0, '', '', '', '']);
  rows[20] = ['V20', '2026-08-03', 'Góp quỹ', '', '', 607048189, 'Tường', 'Cty Minh Vương', 'Doanh thu T6', ''];
  rows[980] = ['V980', '2026-09-07', '', 'Dầu', '', 5000000, 'Tường', '20H05602', '', ''];
  const before = state(rows);
  rows[20][9] = 'Có';
  const after = state(rows);
  const changed = service.diff(service.parse(service.serialize(before)), after);
  assert.equal(changed.changed, true);
  assert.equal(changed.full, false);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.months)), ['2026-08']);
});

test('source fingerprint refreshes both months when a dated row moves between months', () => {
  const before = state([['V1', '2026-08-31', '', 'Dầu']]);
  const after = state([['V1', '2026-09-01', '', 'Dầu']]);
  const changed = service.diff(before, after);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.months)), ['2026-09', '2026-08']);
  assert.equal(changed.full, false);
});

test('source fingerprint treats inserted undated rows as structural full refresh work', () => {
  const before = state([['V1', '2026-08-03', 'Góp quỹ']]);
  const after = state([['V1', '2026-08-03', 'Góp quỹ'], ['', '', '', '']]);
  const changed = service.diff(before, after);
  assert.equal(changed.changed, true);
  assert.equal(changed.full, true);
});

test('source fingerprint migrates legacy scalar state by refreshing all discovered months once', () => {
  const current = state([
    ['V1', '2026-08-03', 'Góp quỹ'],
    ['V2', '2026-09-07', '', 'Dầu'],
  ]);
  const changed = service.diff(service.parse('legacy-hash'), current);
  assert.equal(changed.changed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.months)), ['2026-09', '2026-08']);
});

test('source fingerprint remains stable when no source value changed', () => {
  const current = state([['V1', '2026-08-03', 'Góp quỹ']]);
  const changed = service.diff(service.parse(service.serialize(current)), state([['V1', '2026-08-03', 'Góp quỹ']]));
  assert.deepEqual(JSON.parse(JSON.stringify(changed)), { changed: false, full: false, months: [] });
});

test('source transformation version invalidates every discovered month without changing Sheet values', () => {
  const rows = [['L1', '2026-08-03', 'Vay'], ['L2', '2026-09-07', 'Trả nợ']];
  const changed = service.diff(versionedState(rows, 'legacy'), versionedState(rows, 'non-fund-v1'));
  assert.equal(changed.changed, true);
  assert.equal(changed.full, true);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.months)), ['2026-09', '2026-08']);
});

test('R8 personnel period edits invalidate reporting even though period column is not a month', () => {
  const source=fs.readFileSync(path.join(root,'SupabaseService.gs'),'utf8');
  assert.match(source,/key: 'payroll_history'[\s\S]*?sheetName: 'DM_LichSuNhanSu'/);
  assert.match(source,/key: 'payroll_recruitment_totals'[\s\S]*?sheetName: 'SYS_AggThuongTuyen'/);
  const build=rows=>service.build(rows,{resolveMonthKey:()=>'',hash:value=>crypto.createHash('sha256').update(value).digest('hex')});
  const before=build([['Driver',1,'Recruiter','2026-09-01','','2026-09-01','','ĐỦ']]);
  const after=build([['Driver',1,'Recruiter','2026-09-01','','2026-09-01','','CHỜ']]);
  const diff=service.diff(before,after);assert.equal(diff.changed,true);assert.equal(diff.full,true);
});
