const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function harness(longContent = false, telemetry = false) {
  const headers = ['Số phiếu', 'Ngày', 'MỤC THU', 'MỤC CHI', 'Hình thức', 'Số tiền', 'Người Thu/Chi', 'Đối tác', 'Nội dung', 'Công nợ', '', 'Không qua Quỹ', '', ''];
  const transactions = Array.from({ length: 473 }, () => Array(14).fill(''));
  const t = (date, income, expense, amount, debt = '', offset = false) => ['v', date, income, expense, '', String(amount), 'actor', '', '', debt, '', offset ? 'TRUE' : 'FALSE', '', ''];
  transactions[0] = t('03/08/2026', 'Thu', '', 50);
  transactions[199] = t('05/08/2026', '', 'Chi', 20);
  transactions[200] = t('03/09/2026', 'Thu', '', 80);
  transactions[399] = t('05/09/2026', '', 'Chi', 10);
  transactions[400] = t('05/09/2026', 'Thu', '', 100000, '', true);
  transactions[401] = t('05/09/2026', '', 'Chi', 100000, 'Có');
  transactions[402] = t('05/09/2026', 'Rút tiền', '', 100000);
  transactions[403] = t('05/09/2026', '', 'Nộp vào TK', 100000);
  transactions[472] = t('08/10/2026', 'Thu', '', 100000);
  if (longContent) transactions[200][8] = '🚚Đông北'.repeat(20000);
  const l = (date, type, amount, nonFund = false) => ['loan', date, type, '', 'partner', String(amount), '', '', '', '', '', nonFund ? 'TRUE' : 'FALSE', '', ''];
  const loans = [l('03/08/2026', 'Vay', 100), l('05/08/2026', 'Trả nợ', 30), l('03/09/2026', 'Vay', 200), l('05/09/2026', 'Trả nợ', 40), l('06/09/2026', 'Trả lãi', 5), l('07/09/2026', 'Vay', 100000, true), l('01/01/2026', 'Vay', 100000)];
  const requests = [], logs = []; let marker = null;
  const sheets = Object.fromEntries([['NHAP_THUCHI', transactions], ['NHAP_VAY', loans]].map(([name, rows]) => [name, {
    getLastRow: () => rows.length + 1, getLastColumn: () => 14,
    getRange(row, col, height, width) {
      requests.push({ name, row, col, height, width });
      const cells = row === 1 ? [headers] : rows.slice(row - 2, row - 2 + height);
      return { getDisplayValues: () => cells.map((v) => v.slice(col - 1, col - 1 + width)),
        getValues: () => cells.map((v) => v.slice(col - 1, col - 1 + width).map((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x) ? new Date(x.slice(6), Number(x.slice(3, 5)) - 1, x.slice(0, 2)) : x)) };
    }
  }]));
  const named = { TMDK: '500', TKDK: '400', NGAYNHAPLIEU: '01/01/2026', NGAYTINHVAY: '07/01/2026', NOPTIEN: 'Nộp vào TK', RUTTIEN: 'Rút tiền', KHOANVAY: 'Khoản vay' };
  const ss = { getSheetByName: (name) => sheets[name], getRangeByName: (name) => named[name] === undefined ? null : ({ getDisplayValue: () => named[name], getValue: () => named[name] }) };
  class Today extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 7, 12])); } }
  const sandbox = vm.createContext({ Date: Today, console: { log: line => logs.push(line) }, APP_CONFIG: { year: '2026', timezone: 'Asia/Ho_Chi_Minh' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }, SpreadsheetApp: { openById: () => ss },
    CacheService: { getScriptCache: () => ({ get: () => marker ? '1' : null, put() {}, getAll: (keys) => marker ? Object.fromEntries(keys.map((k) => [k, marker])) : {}, putAll(values) { Object.values(values).forEach((value) => assert.ok(Buffer.byteLength(value) < 100000)); } }) },
    Utilities: { formatDate: (d, _tz, pattern) => {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return pattern === 'yyyy-MM' ? `${y}-${m}` : pattern === 'MM/yyyy' ? `${m}/${y}` : `${y}-${m}-${day}`;
    } }
  });
  for (const f of ['NormalizationUtils.gs', ...(telemetry ? ['FundSourceProbeService.gs', 'FundTransactionRepository.gs'] : []), 'FundService.gs']) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox);
  return { service: sandbox.FundService, requests, logs, marker: (v) => { marker = JSON.stringify(v); } };
}

test('actual paged Fund readers retain row indexes, dates, non-fund flags and financial parity across 200-row boundaries', () => {
  const h = harness(); const snapshot = {};
  for (const part of ['transactions', 'loans', 'settings']) {
    let row = 2; const all = [];
    do { const page = h.service.readOverviewSourcePage('2026', part, row, 9999); if (part === 'settings') snapshot.settings = page.rows; else all.push(...page.rows); row = page.nextRow; } while (row);
    if (part !== 'settings') snapshot[part] = all;
  }
  assert.ok(h.requests.every((r) => r.height <= 200));
  assert.equal(snapshot.transactions.find((r) => r.rowIndex === 402).offset, true);
  assert.equal(snapshot.transactions.at(-1).rowIndex, 474);
  assert.equal(snapshot.loans.find((r) => r.rowIndex === 7).nonFund, true);
  const result = h.service.getFundOverviewFromSnapshot({ month: '2026-09' }, snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.map((m) => m.value))), [1000, 280, 55, 225, 1225, 1225]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), JSON.parse(JSON.stringify(h.service.getFundOverview('2026', { month: '2026-09', forceRefresh: true }))));
});

test('a forced Fund source read bypasses the previous cached overview instead of republishing it as fresh', () => {
  const h = harness(); h.marker({ ok: true, stale: true });
  assert.equal(h.service.getFundOverview('2026', { month: '2026-09' }).stale, true);
  const result = h.service.getFundOverview('2026', { month: '2026-09', forceRefresh: true });
  assert.equal(result.stale, undefined); assert.equal(result.metrics.find((m) => m.key === 'closingBalance').value, 1225);
});

test('Fund runtime cache respects UTF-8 byte limits for long Vietnamese and emoji content', () => {
  const h = harness(true);
  assert.equal(h.service.getFundOverview('2026', { month: '2026-09', forceRefresh: true }).ok, true);
});

test('actual Fund source telemetry preserves overview pages/settings and instruments transaction-list native calls', () => {
  const baseline = harness(), timed = harness(false, true);
  for (const part of ['transactions', 'loans', 'settings']) {
    const original = baseline.service.readOverviewSourcePage('2026', part, 2, 200);
    const measured = timed.service.readOverviewSourcePage('2026', part, 2, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(measured)), JSON.parse(JSON.stringify(original)));
  }
  assert.deepEqual(timed.requests, baseline.requests, 'telemetry must not add a Sheet read');
  timed.service.readTransactionSourcePage('2026', 202);
  const records = timed.logs.map(line => JSON.parse(line.split('fund_source_phase:')[1]));
  for (const scope of ['overviewTransactions', 'overviewLoans', 'overviewSettings', 'transactionPage']) {
    assert.ok(records.some(r => r.scope === scope && r.phase === 'openWorkbook' && r.event === 'end'));
  }
  for (const phase of ['getSheet', 'lastRow', 'lastColumn', 'headers', 'display', 'dates']) {
    assert.ok(records.some(r => r.scope === 'transactionPage' && r.phase === phase && r.event === 'end'));
  }
  assert.ok(records.every(r => r.event !== 'end' || r.ok === true));
  assert.ok(!timed.logs.join('\n').includes('actor'));
});
