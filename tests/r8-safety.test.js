const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createWriteJobRepository } = require('../server/repositories/write-job-repository');
const { createWriteCommandService } = require('../server/services/write-command-service');
const { assertPushEndpoint } = require('../server/services/push-endpoint-policy');
const { withDeadline } = require('../server/services/request-deadline');
const { createNotificationDispatchService } = require('../server/services/notification-dispatch-service');
const httpError = (status, message) => Object.assign(new Error(message), { status });
const config = { supabaseUrl: 'https://db.test', serviceRoleKey: 'local', vapidPublicKey: 'local', vapidPrivateKey: 'local', vapidSubject: 'mailto:local@example.com' };

test('same key accepts canonical intent but rejects changed amount, actor, workbook or action', async () => {
  const payload = { loan: { amount: 100, partner: 'Bank' }, year: '2026', requestActorId: 'a' };
  const row = { id: 'id', module: 'fund', action: 'addFundLoan', status: 'pending', payload };
  let writes = 0;
  const repo = createWriteJobRepository({ httpError, fetchImpl: async (_url, options) => { if (options.method) writes++; return { ok: true, json: async () => [row] }; } });
  const input = { moduleName: 'fund', action: 'addFundLoan', payload: { requestActorId: 'a', year: '2026', loan: { partner: 'Bank', amount: 100 } }, idempotencyKey: 'same' };
  assert.equal((await repo.enqueue(config, input)).duplicateRequest, true);
  for (const change of [{ ...payload, year: '2027' }, { ...payload, requestActorId: 'b' }, { ...payload, loan: { amount: 101, partner: 'Bank' } }]) await assert.rejects(repo.enqueue(config, { ...input, payload: change }), { status: 409 });
  await assert.rejects(repo.enqueue(config, { ...input, action: 'addFundLoanPayment' }), { status: 409 });
  assert.equal(writes, 0);
});

test('enqueue race also checks immutable intent before accepting ignored duplicate insert', async () => {
  let calls = 0;
  const repo = createWriteJobRepository({ httpError, fetchImpl: async () => ({ ok: true, json: async () => ++calls < 3 ? [] : [{ id: 'id', module: 'fund', action: 'addFundLoan', status: 'pending', payload: { amount: 100 } }] }) });
  await assert.rejects(repo.enqueue(config, { moduleName: 'fund', action: 'addFundLoan', payload: { amount: 101 }, idempotencyKey: 'same' }), { status: 409 });
  assert.equal(calls, 3);
});

test('API rejects unsafe amounts and missing fingerprints before persistence and ignores forged actor', async () => {
  const calls = [];
  const svc = createWriteCommandService({ httpError, send: (_res, _status, value) => value, repository: { enqueue: async (_config, value) => { calls.push(value); return {}; } }, workbookContextService: { resolve: () => ({ year: '2026', spreadsheetId: 'server-workbook' }) } });
  for (const amount of ['Infinity', 'NaN', -1, 0, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(svc.handle('addFundLoan', { method: 'POST', body: { loan: { amount } } }, {}, config), { status: 400 });
  await assert.rejects(svc.handle('updateFundTransaction', { method: 'POST', body: { rowIndex: 2, transaction: { amount: 10 } } }, {}, config), { status: 400 });
  await assert.rejects(svc.handle('addFundTransactions', { method: 'POST', body: { transactions: Array(101).fill({ amount: 1 }) } }, {}, config), { status: 400 });
  assert.equal(calls.length, 0);
  await svc.handle('addFundLoan', { method: 'POST', body: { requestActorId: 'forged', spreadsheetId: 'forged', loan: { amount: 1 } } }, {}, config, { id: 'actual' });
  assert.equal(calls[0].payload.requestActorId, 'actual'); assert.equal(calls[0].payload.spreadsheetId, 'server-workbook');
});

test('push endpoint policy rejects SSRF and deceptive provider URLs', () => {
  for (const endpoint of ['https://127.0.0.1/a','https://169.254.169.254/latest/meta-data','https://localhost/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://evil.test@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://fcm.googleapis.com/a#fragment','https://fcm.googleapis.com/','https://[::1]/a']) assert.throws(() => assertPushEndpoint(endpoint));
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a','https://web.push.apple.com/a']) assert.equal(assertPushEndpoint(endpoint), endpoint);
});

test('request deadline preserves caller cancellation and rejects a hanging upstream', async () => {
  const controller = new AbortController();
  const fetcher = withDeadline(async (_url, options) => { assert.ok(options.signal instanceof AbortSignal); return options.signal; }, 100);
  const signal = await fetcher('https://local.test', { signal: controller.signal }); controller.abort(); assert.equal(signal.aborted, true);
  const hanging = withDeadline((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason))), 20);
  // AbortSignal's timer is unref'd; keep the test alive until its deadline.
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(hanging('https://local.test'), { name: 'TimeoutError' }); } finally { clearTimeout(keepAlive); }
});

function journalHarness() {
  const cells = new Map(); const notes = new Map(); let flushes = 0;
  const key = (r, c) => `${r}:${c}`;
  const sheet = { getMaxRows: () => 100, getRange(r,c,h=1,w=1) { return { getNote: () => notes.get(r) || '', setNote: (value) => notes.set(r,value), getNotes: () => Array.from({length:h},(_,i)=>[notes.get(r+i)||'']), getValues: () => Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>cells.get(key(r+i,c+j))??'')) }; } };
  const sandbox = vm.createContext({ Date, Utilities: { DigestAlgorithm: {SHA_256:'sha256'}, Charset:{UTF_8:'utf8'}, computeDigest: (_alg,text)=>crypto.createHash('sha256').update(text).digest(), base64EncodeWebSafe:(v)=>Buffer.from(v).toString('base64url') }, SpreadsheetApp:{flush:()=>{flushes++;}} });
  vm.runInContext(fs.readFileSync('FundWriteIntentRepository.gs','utf8'),sandbox);
  return { repo:sandbox.FundWriteIntentRepository,sheet,cells,notes,key,flushes:()=>flushes };
}

test('durable intent survives a crash before values and after values before completion', () => {
  const h = journalHarness(); const intent={amount:100}; const rows=[['V1',new Date('2026-09-01'),100]];
  const prepared=h.repo.prepare(h.sheet,'job',intent,rows,{},()=>2);
  assert.equal(h.flushes(),1); assert.equal(h.repo.verifyRows(h.sheet,h.repo.find(h.sheet,'job',intent)),false);
  rows[0].forEach((value,i)=>h.cells.set(h.key(2,i+1),value));
  const recovered=h.repo.find(h.sheet,'job',intent); assert.equal(h.repo.verifyRows(h.sheet,recovered),true);
  h.repo.complete(h.sheet,recovered,{rowIndex:2});
  const complete=h.repo.find(h.sheet,'job',intent); assert.equal(complete.state,'complete'); assert.equal(complete.result.rowIndex,2);
  assert.equal(h.notes.size,1); assert.equal(prepared.firstRow,2);
});

test('journal blocks changed payload, partial values, duplicate markers and edited completed rows', () => {
  const h=journalHarness();const rec=h.repo.prepare(h.sheet,'job',{amount:100},[['V1',100]],{},()=>2);
  assert.throws(()=>h.repo.find(h.sheet,'job',{amount:101}),/nội dung khác/);
  h.cells.set('2:1','V1');assert.throws(()=>h.repo.verifyRows(h.sheet,rec),/REQUIRES_RECONCILIATION/);
  h.cells.set('2:2',100);h.repo.complete(h.sheet,rec,{rowIndex:2});h.cells.set('2:2',101);assert.throws(()=>h.repo.verifyRows(h.sheet,h.repo.find(h.sheet,'job',{amount:100})),/REQUIRES_RECONCILIATION/);
  h.notes.set(3,h.notes.get(2));assert.throws(()=>h.repo.find(h.sheet,'job',{amount:100}),/nhiều marker/);
});

test('fund journal treats an unchecked L checkbox as blank before an append and equivalent after completion', () => {
  const h=journalHarness();
  const row=['261004000001',new Date('2026-10-03T17:00:00.000Z'),'','Ứng lương','',2000000,'QA','Đối tác QA','Ứng lương QA','','',''];
  h.cells.set('2:12',false);
  const record=h.repo.prepare(h.sheet,'first-real-job',{transactions:[{amount:2000000}]},[row],{transaction:true},()=>2);
  assert.equal(h.repo.verifyRows(h.sheet,record),false,'a validated unchecked checkbox is not a partial write');
  row.forEach((value,i)=>h.cells.set(h.key(2,i+1),value));
  h.cells.set('2:12',false);
  assert.equal(h.repo.verifyRows(h.sheet,record),true);
  h.repo.complete(h.sheet,record,{rowIndex:2});
  assert.equal(h.repo.verifyRows(h.sheet,h.repo.find(h.sheet,'first-real-job',{transactions:[{amount:2000000}]})),true);
  h.cells.set('2:12',true);
  assert.throws(()=>h.repo.verifyRows(h.sheet,record),/REQUIRES_RECONCILIATION/,'checked offset must still be treated as business drift');
});

test('journal checkbox equivalence stays limited to boolean false in fund L, preserving partial-write guards', () => {
  const row=['V1',new Date('2026-09-01'),'','Chi','',100,'An','Bank','Pay','','',''];
  for(const [col,value] of [[6,false],[1,false],[12,true],[12,'FALSE']]) {
    const h=journalHarness();const record=h.repo.prepare(h.sheet,'job',{},[row],{transaction:true},()=>2);
    h.cells.set(h.key(2,col),value);
    assert.throws(()=>h.repo.verifyRows(h.sheet,record),/REQUIRES_RECONCILIATION/);
  }
  const h=journalHarness();const loanRow=['L1',new Date('2026-09-01'),'Vay','','Bank',100,1,12,1,new Date('2026-10-01'),'Loan',false];
  h.cells.set('2:12',false);
  const loan=h.repo.prepare(h.sheet,'loan',{},[loanRow],{},()=>2);
  assert.equal(h.repo.verifyRows(h.sheet,loan),false);
  loanRow.forEach((value,i)=>h.cells.set(h.key(2,i+1),value));
  assert.equal(h.repo.verifyRows(h.sheet,loan),true);
  h.cells.set('2:12','');
  assert.equal(h.repo.verifyRows(h.sheet,loan),true);
  h.cells.set('2:12',true);
  assert.throws(()=>h.repo.verifyRows(h.sheet,loan),/REQUIRES_RECONCILIATION/);
});

test('journal does not overwrite an existing note or accept an oversized intent', () => {
  const h=journalHarness();h.notes.set(2,'business note');assert.throws(()=>h.repo.prepare(h.sheet,'job',{},[['V',1]],{},()=>2),/có note/);assert.equal(h.notes.get(2),'business note');
  assert.throws(()=>h.repo.prepare(h.sheet,'job',{},[['V','x'.repeat(41000)]],{},()=>3),/quá lớn/);assert.equal(h.notes.has(3),false);
});

test('mixed device retry sends only unsent events even when new alerts arrive', async () => {
  const states=new Map([['notification-dispatch-baseline-v1',{rule_key:'notification-dispatch-baseline-v1'}]]); let events=[{id:'old',notificationKey:'trip-reconciliation',message:'Old'}]; let fail=true;const sent=[];
  const service=createNotificationDispatchService({httpError,now:()=>new Date('2026-09-01T01:00:00Z'),centerService:{list:async()=>({items:events})},deliveryRepository:{list:async(_c,keys)=>keys.filter(k=>states.has(k)).map(k=>states.get(k)),upsert:async(_c,rows)=>rows.forEach(row=>states.set(row.rule_key,row))},preferenceRepository:{listByUserIds:async()=>[]},appUserRepository:{list:async()=>[{user_id:'admin',role:'admin',active:true}]},subscriptionRepository:{listByUserIds:async()=>[{id:'a',endpoint:'https://fcm.googleapis.com/a'},{id:'b',endpoint:'https://fcm.googleapis.com/b'}],removeById:async()=>{}},webPush:{setVapidDetails(){},async sendNotification(row,payload){if(row.endpoint.endsWith('/b')&&fail)throw new Error('device unavailable');sent.push({endpoint:row.endpoint,...JSON.parse(payload)});}}});
  await service.run(config); assert.equal(sent.length,1);
  events=[...events,{id:'new',notificationKey:'trip-reconciliation',message:'New'}]; fail=false;await service.run(config);
  assert.equal(sent.length,3);assert.equal(sent[1].notificationId,'new');assert.equal(sent[1].unreadDelta,1);assert.equal(sent[2].unreadDelta,2);
  await service.run(config);assert.equal(sent.length,3);
});

test('maintenance gate rejects new writes before enqueue while keeping a retryable 503', async () => {
  let writes=0;const svc=createWriteCommandService({httpError,repository:{enqueue:async()=>{writes++;}},workbookContextService:{},send(){}});
  await assert.rejects(svc.handle('addFundLoan',{method:'POST',body:{loan:{amount:1}}},{},{businessWritesPaused:true}),{status:503});assert.equal(writes,0);
});
