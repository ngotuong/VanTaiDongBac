const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const plain = (x) => JSON.parse(JSON.stringify(x));

function harness(empty = false) {
  const s = vm.createContext({ Date });
  for (const f of ['FundTransactionRepository.gs', 'FundTransactionService.gs', 'FundTransactionSnapshotService.gs']) vm.runInContext(fs.readFileSync(f, 'utf8'), s);
  const headers = ['Số phiếu', 'Ngày', 'Mục thu', 'Mục chi', 'Hình thức', 'Số tiền', 'Người Thu/Chi', 'Đối tác', 'Nội dung', 'Công nợ', '2', 'Không qua Quỹ', 'Công nợ còn lại', 'Lọc'];
  const normalize = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const rows = empty ? [] : Array.from({ length: 450 }, (_, i) => [`V${i}`, '03/10/2026', i % 2 ? '' : 'Cước', i % 2 ? 'Dầu' : '', 'CK', '1.234.567,89', 'QA', 'Partner', 'Nội dung 😀', 'Có', '', 'TRUE', '234.567,89', '']);
  if (!empty) rows[20] = Array(14).fill('');
  const dates = rows.map((_, i) => i === 30 ? '' : new Date(`2026-${i % 2 || i === 200 ? '09' : '10'}-03T00:00:00Z`));
  let stamp = 'v1', uuid = 0, failPut = false;
  const scratch = new Map(), reads = [], published = [], logs = [];
  const sheet = { getLastRow: () => rows.length + 1, getLastColumn: () => headers.length,
    getRange: (row, col, count, width) => ({ getDisplayValues: () => row === 1 ? [headers] : rows.slice(row - 2, row - 2 + count), getValues: () => dates.slice(row - 2, row - 2 + count).map((d) => [d]) }) };
  const mapContext = { repository: s.FundTransactionRepository, spreadsheet: { getSheetByName: () => sheet }, headers, sheetName: 'NHAP_THUCHI', clean: (x) => String(x ?? '').trim(), normalizeHeader: normalize,
    normalizeMonth: (x) => x || '', parseNumber: (x) => Number(String(x).replace(/\./g, '').replace(',', '.')) || 0,
    parseDate: (x) => x instanceof Date && Number.isFinite(x.getTime()) ? x : null,
    formatDate: (d, p) => p === 'yyyy-MM' ? d.toISOString().slice(0, 7) : p === 'MM/yyyy' ? `${d.toISOString().slice(5, 7)}/${d.getUTCFullYear()}` : d.toISOString().slice(0, 10) };
  const ctx = { stamp: () => stamp, uuid: () => String(++uuid), log: (message) => logs.push(message), hash: (v) => crypto.createHash('sha256').update(v).digest('hex'),
    cache: { putAll: (values) => { Object.entries(values).forEach(([k, v]) => { assert.ok(Buffer.byteLength(v) < 100000); scratch.set(k, v); }); if (failPut) { failPut = false; throw Error('crash after cache put'); } }, getAll: (keys) => Object.fromEntries(keys.filter((k) => scratch.has(k)).map((k) => [k, scratch.get(k)])), removeAll: (keys) => keys.forEach((k) => scratch.delete(k)) },
    readPage: (row) => { reads.push(row); return s.FundTransactionRepository.readSnapshot(mapContext.spreadsheet, { sheetName: mapContext.sheetName, headers, normalizeHeader: normalize, startRow: row, pageSize: 200 }); },
    begin: (month) => s.FundTransactionService.beginCapture('2026', { month, limit: 3 }, mapContext),
    append: (state, page, month) => s.FundTransactionService.appendCapture(state, page, { month }, mapContext), finish: s.FundTransactionService.finishCapture,
    publish: (month, payload) => { published.push({ month, payload: plain(payload) }); return { ok: true }; } };
  let item = {};
  const run = (task) => { const r = s.FundTransactionSnapshotService.run(task, item, ctx); item = plain(item); return r; };
  const capture = (month = '') => { let task = ['fundTransactions', month]; for (let i = 0; i < 30 && task; i++) task = run(task).added?.[0]; assert.equal(task, undefined); };
  return { s, ctx, rows, headers, dates, mapContext, scratch, reads, published, logs, run, capture, getItem: () => plain(item), restore: (x) => { item = plain(x); }, change: () => { stamp = 'v2'; }, crashPut: () => { failPut = true; } };
}

test('paged list preserves row identity, Date sorting, money/debt/offset and filters; months reuse one capture', () => {
  const h = harness(); h.capture('2026-10');
  const p = h.published[0].payload;
  assert.deepEqual(h.reads, [2, 202, 402]);
  assert.deepEqual(p.transactions.map((r) => r.rowIndex), [450, 448, 446]);
  assert.equal(p.totalRows, 222); assert.equal(p.limited, true);
  assert.deepEqual(p.months.map((m) => m.key), ['2026-10', '2026-09']);
  for (const r of p.transactions) { assert.equal(r.amount, 1234567.89); assert.equal(r.remainingDebt, 234567.89); assert.equal(r.offset, true); assert.equal(r.debt, 'Có'); assert.equal(r.type, 'Thu'); assert.equal(r.date, '2026-10-03'); }
  h.capture('2026-09'); h.capture('');
  assert.deepEqual(h.reads, [2, 202, 402]);
  assert.equal(h.published[1].payload.totalRows, 226); assert.equal(h.published[2].payload.totalRows, 449);
  assert.deepEqual(h.published[1].payload.transactions.map((r) => r.rowIndex), [451, 449, 447]);
  assert.ok(JSON.stringify(h.getItem()).length < 1000, 'Script Property contains only immutable manifest pointer');
  const normal = plain(h.s.FundTransactionService.getTransactions('2026', { month: '2026-10', limit: 3 }, h.mapContext));
  assert.deepEqual(p, normal);
});

test('evicted/corrupt cache and an edit between pages restart capture without partial publication', () => {
  for (const kind of ['evict', 'corrupt', 'edit']) {
    const h = harness(); let task = h.run(['fundTransactions', '']).added[0];
    task = h.run(task).added[0];
    if (kind === 'edit') h.change();
    else {
      while (task[0] !== 'fundTransactionsPublish') task = h.run(task).added[0];
      const key = [...h.scratch.keys()].find((k) => k.includes(':page:2:'));
      if (kind === 'evict') h.scratch.delete(key); else h.scratch.set(key, 'broken');
    }
    const result = h.run(task);
    assert.equal(result.added[0][0], 'fundTransactionsScan'); assert.equal(result.added[0][2], 2);
    assert.equal(h.published.length, 0);
    h.capture(); assert.equal(h.published.length, 1); assert.equal(h.published[0].payload.totalRows, 449);
  }
});

test('crash after cache write resumes from durable pointer and does not double-count rows', () => {
  const h = harness(); const task = h.run(['fundTransactions', '']).added[0]; const saved = h.getItem();
  h.crashPut(); assert.throws(() => h.run(task), /crash after cache put/); h.restore(saved);
  let next = task; while (next) next = h.run(next).added?.[0];
  assert.deepEqual(h.reads, [2, 2, 202, 402]); assert.equal(h.published.length, 1); assert.equal(h.published[0].payload.totalRows, 449);
});

test('source row-count or header change restarts rather than combining incompatible pages', () => {
  for (const kind of ['count', 'header']) {
    const h = harness(); let task = h.run(['fundTransactions', '']).added[0]; task = h.run(task).added[0];
    if (kind === 'count') h.rows.push(Array(14).fill('')); else h.headers[8] = 'Changed header';
    const result = h.run(task); assert.equal(result.added[0][2], 2); assert.equal(h.published.length, 0);
  }
});

test('empty source preserves the legacy empty payload rather than fabricated financial zeros', () => {
  const h = harness(true); h.capture(); const p = h.published[0].payload;
  assert.deepEqual(p.transactions, []); assert.deepEqual(p.months, []);
  assert.equal(p.totalRows, undefined); assert.equal(p.ok, true);
});

test('publication timing exposes fixed metadata without leaking source, month, hashes or payload', () => {
  const h = harness(); h.capture('2026-10');
  const records = h.logs.filter((s) => s.startsWith('fund_transactions_publish_phase:'))
    .map((s) => JSON.parse(s.slice(s.indexOf(':') + 1)));
  assert.ok(records.length > 0);
  assert.ok(records.some((r) => r.phase === 'cacheGetAll' && r.event === 'end'));
  assert.ok(records.some((r) => r.phase === 'append' && r.event === 'end'));
  assert.ok(records.some((r) => r.phase === 'publish' && r.event === 'end' && r.ok));
  for (const r of records) {
    assert.deepEqual(Object.keys(r).sort(), r.event === 'start' ? ['event', 'phase'] : ['event', 'ms', 'ok', 'phase']);
    if (r.event === 'end') assert.ok(Number.isFinite(r.ms) && r.ms >= 0);
  }
  assert.doesNotMatch(JSON.stringify(records), /Partner|QA|Nội dung|NHAP_THUCHI|2026-10|1234567|234567|dateISO/);
  assert.deepEqual(h.reads, [2, 202, 402]);
});

test('capture timing isolates serialization, chunking, CacheService writes and hashing without source values', () => {
  const h = harness(); h.capture('2026-10');
  const records = h.logs.filter((s) => s.startsWith('fund_transactions_capture_phase:'))
    .map((s) => JSON.parse(s.slice(s.indexOf(':') + 1)));
  for (const phase of ['serialize', 'chunk', 'cachePutAll', 'hash']) {
    assert.ok(records.some((r) => r.phase === phase && r.event === 'end' && r.ok));
  }
  for (const r of records) {
    assert.deepEqual(Object.keys(r).sort(), r.event === 'start' ? ['event', 'phase'] : ['event', 'ms', 'ok', 'phase']);
  }
  assert.doesNotMatch(JSON.stringify(records), /Partner|QA|Nội dung|NHAP_THUCHI|2026-10|1234567|234567|dateISO/);
});

test('a broken publication logger cannot interrupt publication or alter payload', () => {
  const baseline = harness(); baseline.capture('2026-10');
  const h = harness();
  h.ctx.log = (message) => { if (message.startsWith('fund_transactions_publish_phase:')) throw Error('logger failed'); };
  h.capture('2026-10');
  assert.deepEqual(h.published, baseline.published);
  assert.deepEqual(h.reads, baseline.reads);
});

test('mapping failure preserves its exception and capture for retry without logging sensitive error text', () => {
  const h = harness(); let task = ['fundTransactions', '2026-10'];
  while (task[0] !== 'fundTransactionsPublish') task = h.run(task).added[0];
  const before = h.getItem(), original = h.ctx.append, failure = Error('PRIVATE_SOURCE_CONTENT');
  h.ctx.append = () => { throw failure; };
  assert.throws(() => h.run(task), (error) => error === failure);
  assert.deepEqual(h.getItem().fundTransactionsCapture.manifest, before.fundTransactionsCapture.manifest);
  assert.equal(h.published.length, 0);
  const logs = h.logs.filter((s) => s.startsWith('fund_transactions_publish_phase:'));
  assert.doesNotMatch(logs.join('\n'), /PRIVATE_SOURCE_CONTENT/);
  assert.ok(logs.some((s) => /"phase":"append"/.test(s) && /"ok":false/.test(s)));
  h.ctx.append = original; h.run(task);
  assert.equal(h.published.length, 1);
  assert.deepEqual(h.reads, [2, 202, 402]);
});

test('publication timing preserves the stamp method receiver and final source drift rejection', () => {
  const h = harness(); h.ctx.sourceStamp = 'v1';
  h.ctx.stamp = function () { assert.equal(this, h.ctx); return this.sourceStamp; };
  let task = ['fundTransactions', '2026-10'];
  while (task[0] !== 'fundTransactionsPublish') task = h.run(task).added[0];
  const append = h.ctx.append;
  h.ctx.append = (...args) => { const result = append(...args); h.ctx.sourceStamp = 'v2'; return result; };
  const result = h.run(task);
  assert.equal(h.published.length, 0);
  assert.equal(result.added[0][0], 'fundTransactionsScan');
  assert.equal(result.added[0][2], 2);
});

function dateMappingFixture(zone = 'Asia/Ho_Chi_Minh') {
  const h = harness();
  const formatCalls = [];
  const locale = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  h.mapContext.formatDate = (d, pattern) => {
    formatCalls.push(pattern);
    const parts = Object.fromEntries(locale.formatToParts(d).map((p) => [p.type, p.value]));
    return pattern === 'yyyy-MM' ? `${parts.year}-${parts.month}` : pattern === 'MM/yyyy' ? `${parts.month}/${parts.year}` : `${parts.year}-${parts.month}-${parts.day}`;
  };
  const row = (voucher, dateText) => [voucher, dateText, 'Cước', '', 'CK', '1.234.567,89', 'QA', 'Partner', 'Nội dung 😀', 'Có', '', 'TRUE', '234.567,89', ''];
  const dates = [new Date('2026-09-30T17:00:00Z'), new Date('2026-09-30T17:00:00Z'), new Date('2026-09-30T16:59:59Z'), new Date('2024-02-28T17:00:00Z'), null];
  const page = { empty: false, headers: h.headers, columns: h.s.FundTransactionRepository.getColumns(h.headers, h.mapContext.normalizeHeader), startRow: 202,
    displayValues: dates.map((_, i) => row(`SYN${i}`, i === 4 ? 'ngày không hợp lệ' : 'display date')), rawDateValues: dates.map((d) => [d]) };
  const map = (filter = {}) => {
    const state = h.s.FundTransactionService.beginCapture('2026', filter, h.mapContext);
    h.s.FundTransactionService.appendCapture(state, page, filter, h.mapContext);
    return { state, payload: plain(h.s.FundTransactionService.finishCapture(state)) };
  };
  return { ...h, page, map, formatCalls };
}

test('transaction dates use the configured timezone across midnight, month boundary and leap day', () => {
  const h = dateMappingFixture();
  const { payload, state } = h.map({ limit: 100 });
  assert.deepEqual(payload.transactions.map((t) => [t.voucher, t.date, t.month, t.monthLabel, t.rowIndex]), [
    ['SYN4', 'ngày không hợp lệ', '', '', 206],
    ['SYN1', '2026-10-01', '2026-10', '10/2026', 203],
    ['SYN0', '2026-10-01', '2026-10', '10/2026', 202],
    ['SYN2', '2026-09-30', '2026-09', '09/2026', 204],
    ['SYN3', '2024-02-29', '2024-02', '02/2024', 205]
  ]);
  assert.deepEqual(payload.months, [{ key: '2026-10', label: '10/2026' }, { key: '2026-09', label: '09/2026' }, { key: '2024-02', label: '02/2024' }]);
  for (const t of payload.transactions) { assert.equal(t.amount, 1234567.89); assert.equal(t.remainingDebt, 234567.89); assert.equal(t.offset, true); }
  assert.equal(h.formatCalls.length, 3, 'one native formatting operation per distinct parsed timestamp in this page');
  assert.doesNotMatch(JSON.stringify(state), /dateFormats/);
});

test('date coalescing retains unselected months, inclusive range, search, limits and original row identity', () => {
  const h = dateMappingFixture();
  const rangeDate = new Date('2026-09-30T17:00:00Z');
  const { payload } = h.map({ month: '2026-10', startDate: rangeDate, endDate: rangeDate, search: 'syn1', limit: 1 });
  assert.deepEqual(payload.transactions.map((t) => [t.voucher, t.rowIndex, t.date]), [['SYN1', 203, '2026-10-01']]);
  assert.equal(payload.totalRows, 1); assert.equal(payload.limited, false);
  assert.equal(payload.months.length, 3, 'month discovery precedes filters');
  const limited = h.map({ month: '2026-10', limit: 1 }).payload;
  assert.equal(limited.totalRows, 2); assert.equal(limited.limited, true);
  assert.deepEqual(limited.transactions.map((t) => t.rowIndex), [203]);
});

test('formatted dates are isolated to each append and a retry sees new dates and formatter context', () => {
  const h = dateMappingFixture(); h.map({}); const before = h.formatCalls.length;
  h.map({}); assert.equal(h.formatCalls.length, before * 2);
  h.page.rawDateValues[0][0] = new Date('2026-10-01T17:00:00Z');
  assert.equal(h.map({}).payload.transactions.find((t) => t.voucher === 'SYN0').date, '2026-10-02');
  const utc = dateMappingFixture('UTC');
  assert.deepEqual(utc.map({}).payload.months, [{ key: '2026-09', label: '09/2026' }, { key: '2024-02', label: '02/2024' }]);
});

test('nonstandard formatted years retain formatter month fields and formatter errors remain failures', () => {
  const h = dateMappingFixture();
  h.mapContext.formatDate = (_d, pattern) => pattern === 'yyyy-MM-dd' ? '10000-10-01' : pattern === 'yyyy-MM' ? '10000-10' : '10/10000';
  const p = h.map({}).payload;
  assert.equal(p.transactions.find((t) => t.voucher === 'SYN0').month, '10000-10');
  assert.equal(p.transactions.find((t) => t.voucher === 'SYN0').monthLabel, '10/10000');
  const error = Error('formatter unavailable');
  h.mapContext.formatDate = () => { throw error; };
  assert.throws(() => h.map({}), (e) => e === error);
});
