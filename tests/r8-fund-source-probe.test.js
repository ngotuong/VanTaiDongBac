const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness({ fail = '', brokenLogger = false } = {}) {
  let clock = 1000;
  const records = [], calls = [];
  const headers = ['Số phiếu', 'Ngày', 'Mục thu', 'Mục chi', 'Hình thức', 'Số tiền', 'Người Thu/Chi', 'Đối tác', 'Nội dung', 'Công nợ', '', 'Không qua Quỹ', 'Công nợ còn lại', 'Lọc'];
  const rows = [['QA1', '10/10/2026', '', 'Dầu', 'CK', '1.234,56', 'Synthetic', 'Test', 'private-value', 'Có', '', 'TRUE', '234,56', '']];
  const dates = [[new Date('2026-10-10T00:00:00Z')]];
  const error = new Error('private-secret-and-cell-error');
  function operation(phase, value) {
    calls.push(phase); clock += phase === 'display' ? 42000 : 10;
    if (fail === phase) throw error;
    return value;
  }
  const sheet = {
    getLastRow: () => operation('lastRow', 2), getLastColumn: () => operation('lastColumn', 14),
    getRange: (r, c, n, w) => ({
      getDisplayValues: () => operation(r === 1 ? 'headers' : 'display', r === 1 ? [headers] : rows),
      getValues: () => operation('dates', dates)
    })
  };
  const workbook = { getSheetByName: () => operation('getSheet', sheet) };
  const s = vm.createContext({ Date: { now: () => clock }, console: { log: line => {
    if (brokenLogger) throw new Error('logger unavailable');
    records.push(JSON.parse(line.split('fund_source_phase:')[1]));
  } } });
  for (const file of ['FundSourceProbeService.gs', 'FundTransactionRepository.gs']) vm.runInContext(fs.readFileSync(file, 'utf8'), s);
  const options = { sheetName: 'NHAP_THUCHI', headers, startRow: 2, pageSize: 200,
    normalizeHeader: value => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'),
    measure: (phase, work) => s.FundSourceProbeService.measure('transactionPage', phase, work) };
  return { s, workbook, options, records, calls, rows, dates, error };
}

test('Fund source timing separates a slow display read and preserves exact page content and read count', () => {
  const h = harness();
  const timed = h.s.FundTransactionRepository.readSnapshot(h.workbook, h.options);
  const phases = h.calls.slice();
  h.calls.length = 0;
  const untimed = h.s.FundTransactionRepository.readSnapshot(h.workbook, { ...h.options, measure: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(timed)), JSON.parse(JSON.stringify(untimed)));
  assert.deepEqual(h.calls, phases);
  assert.equal(timed.displayValues, h.rows);
  assert.equal(timed.rawDateValues, h.dates);
  assert.equal(h.records.find(r => r.phase === 'display' && r.event === 'end').ms, 42000);
  assert.equal(h.records.find(r => r.phase === 'dates' && r.event === 'end').ms, 10);
  assert.ok(!JSON.stringify(h.records).includes('private-value'));
});

test('each Fund native failure propagates unchanged with a failed end record and no private error text', () => {
  for (const fail of ['getSheet', 'lastRow', 'lastColumn', 'headers', 'display', 'dates']) {
    const h = harness({ fail });
    assert.throws(() => h.s.FundTransactionRepository.readSnapshot(h.workbook, h.options), error => error === h.error);
    assert.deepEqual(h.records.at(-1), { scope: 'transactionPage', phase: fail, event: 'end', ms: fail === 'display' ? 42000 : 10, ok: false });
    assert.ok(!JSON.stringify(h.records).includes('private-secret'));
  }
});

test('telemetry failure cannot change a Fund source result or swallow its native failure', () => {
  const success = harness({ brokenLogger: true });
  assert.equal(success.s.FundTransactionRepository.readSnapshot(success.workbook, success.options).displayValues, success.rows);
  const failure = harness({ brokenLogger: true, fail: 'dates' });
  assert.throws(() => failure.s.FundTransactionRepository.readSnapshot(failure.workbook, failure.options), error => error === failure.error);
});

test('telemetry labels reject IDs, payloads and oversized strings and records contain only timing metadata', () => {
  const h = harness();
  h.s.FundSourceProbeService.measure('https://private-workbook', '=private-formula', () => 'private-result');
  h.s.FundSourceProbeService.measure('x'.repeat(65), { token: 'secret' }, () => true);
  for (const record of h.records) {
    assert.equal(record.scope, 'unknown'); assert.equal(record.phase, 'unknown');
    assert.deepEqual(Object.keys(record).sort(), (record.event === 'start' ? ['scope','phase','event'] : ['scope','phase','event','ms','ok']).sort());
  }
});
