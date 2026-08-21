const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
new vm.Script(fs.readFileSync(path.join(root, 'ReportOutputFreshnessService.gs'), 'utf8')).runInContext(context);
const service = context.ReportOutputFreshnessService;
const plain = (value) => JSON.parse(JSON.stringify(value));
const buildContext = {
  resolveMonthKey(value) {
    const match = String(value || '').match(/^(\d{2})\/(\d{4})$/);
    return match ? `${match[2]}-${match[1]}` : '';
  },
  hash(value) { return `hash:${value}`; }
};

test('report output fingerprint groups payroll and vehicle rows by month', () => {
  const state = plain(service.buildState({
    overview: [['Tháng', 'Doanh thu'], ['08/2026', '100']],
    payroll: [['Tháng', 'Nhân sự'], ['07/2026', 'An'], ['08/2026', 'Nội']],
    vehicles: [['Tháng', 'Xe'], ['08/2026', '20H-01']]
  }, buildContext));
  assert.equal(state.rows, 4);
  assert.deepEqual(Object.keys(state.fingerprints), ['2026-07', '2026-08']);
  assert.match(state.fingerprints['2026-08'], /Nội/);
  assert.match(state.fingerprints['2026-08'], /20H-01/);
  assert.match(state.fingerprints['2026-08'], /Doanh thu/);
});

test('report output fingerprint detects additions, edits, and removed months', () => {
  assert.deepEqual(plain(service.changedMonths(
    { '2026-07': 'same', '2026-08': 'old', '2026-09': 'removed' },
    { '2026-07': 'same', '2026-08': 'new', '2026-10': 'added' }
  )), ['2026-08', '2026-09', '2026-10']);
});

test('report output fingerprint property parser fails closed', () => {
  assert.deepEqual(plain(service.parseFingerprintMap('{"2026-08":"abc"}')), { '2026-08': 'abc' });
  assert.deepEqual(plain(service.parseFingerprintMap('invalid')), {});
  assert.deepEqual(plain(service.parseFingerprintMap('[]')), {});
});
