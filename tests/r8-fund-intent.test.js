const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const crypto=require('node:crypto');
function harness() {
 const rows=[['Số phiếu','Ngày','MỤC THU','MỤC CHI','Hình thức','Số tiền','Người Thu/Chi','Đối tác','Nội dung','Công nợ','Ghi chú','Không qua Quỹ','Công nợ còn lại','Lọc'],['D1',new Date(2026,8,1),'','Dầu','CK',1000,'An','Bank','Debt','Có','KEEP K','',1000,'']];
 const notes=new Map(),properties=new Map([['FUND_SPREADSHEET_ID_2026','fund-copy']]),writes=[];let crash='';let crashed=false;
 const sheet={getLastRow:()=>rows.length,getLastColumn:()=>14,getMaxRows:()=>100,getRange(r,c,h=1,w=1){
  const values=()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r-1+i]?.[c-1+j]??''));
  return {getValues:values,getDisplayValues:()=>values().map(row=>row.map(value=>value instanceof Date ? `${String(value.getDate()).padStart(2,'0')}/${String(value.getMonth()+1).padStart(2,'0')}/${value.getFullYear()}` : String(value))),getValue:()=>values()[0][0],getNote:()=>notes.get(r)||'',getNotes:()=>Array.from({length:h},(_,i)=>[notes.get(r+i)||'']),setNote(value){notes.set(r,value);},setValues(matrix){matrix.forEach((row,i)=>row.forEach((value,j)=>{if(!rows[r-1+i])rows[r-1+i]=[];rows[r-1+i][c-1+j]=value;}));writes.push({r,c,h,w});if(!crashed&&((crash==='after-values'&&c===12)||(crash==='partial-values'&&c===1))){crashed=true;throw new Error('synthetic crash');}},setFormula(){},setNumberFormat(){},clearContent(){throw new Error('durable path must never clear rows');}};}};
 const spreadsheet={getId:()=> 'fund-copy',getName:()=> 'Fund copy',getSheetByName:()=>sheet};
 const sandbox=vm.createContext({Date,console,APP_CONFIG:{year:'2026',timezone:'Asia/Ho_Chi_Minh'},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>crypto.createHash('sha256').update(s).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),formatDate:(d,_tz,pattern)=>pattern.replace('yyyy',d.getFullYear()).replace('MM',String(d.getMonth()+1).padStart(2,'0')).replace('dd',String(d.getDate()).padStart(2,'0'))},SpreadsheetApp:{openById:()=>spreadsheet,flush(){rows[1][12]=1000-rows.slice(2).filter(row=>row[0]==='D1'&&row[9]!=='Có').reduce((sum,row)=>sum+Number(row[5]||0),0);}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||'',setProperty(k,v){if(crash==='after-complete'&&!crashed&&k==='FUND_DATA_VERSION_V1_2026'){crashed=true;throw new Error('cache invalidation crash');}properties.set(k,v);}})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 for(const file of ['NormalizationUtils.gs','FundWriteIntentRepository.gs','FundTransactionRepository.gs','FundTransactionService.gs','FundService.gs'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
 const payload={date:'2026-09-02',amount:400,actor:'An',content:'Pay',offset:false,expectedTransaction:{voucher:'D1',date:'2026-09-01',type:'Chi',category:'Dầu',amount:1000,actor:'An',partner:'Bank',content:'Debt',debt:true,offset:false}};
 return {service:sandbox.FundService,rows,notes,writes,properties,payload,crash(value){crash=value;}};
}
for(const point of ['after-values','after-complete'])test(`R8 debt payment recovers ${point} with one append and repaired cache invalidation`,()=>{
 const h=harness();h.crash(point);assert.throws(()=>h.service.addFundDebtPayment('2026',2,h.payload,'same-intent'),/crash/);
 const result=h.service.addFundDebtPayment('2026',2,h.payload,'same-intent');assert.equal(result.remainingDebt,600);assert.equal(h.rows.length,3);assert.equal(h.rows[1][10],'KEEP K');assert.ok(h.properties.has('FUND_DATA_VERSION_V1_2026'));
 const replay=h.service.addFundDebtPayment('2026',2,h.payload,'same-intent');assert.equal(replay.idempotentReplay,true);assert.equal(h.rows.length,3);assert.equal(h.writes.filter(write=>write.c===1).length,1);
 assert.throws(()=>h.service.addFundDebtPayment('2026',2,{...h.payload,amount:401},'same-intent'),/nội dung khác/);
});
test('R8 debt partial write keeps journal/data and blocks reappend for manual reconciliation',()=>{
 const h=harness();h.crash('partial-values');assert.throws(()=>h.service.addFundDebtPayment('2026',2,h.payload,'same-intent'),/crash/);
 // Amount is present but L never written; blank L is the intended false flag,
 // so deliberately simulate a partially missing business field, as in a cell-write failure.
 h.rows[2][8]='';assert.throws(()=>h.service.addFundDebtPayment('2026',2,h.payload,'same-intent'),/REQUIRES_RECONCILIATION/);assert.equal(h.rows.length,3);assert.equal(h.notes.size,1);
});
test('R8 debt rejects a moved/edited source before preparing a journal',()=>{
 const h=harness();h.rows[1][7]='Other';assert.throws(()=>h.service.addFundDebtPayment('2026',2,h.payload,'same-intent'),/dấu vân tay/);assert.equal(h.notes.size,0);assert.equal(h.writes.length,0);
});
for(const offset of [false,true])test(`R8 transaction append over a native unchecked checkbox preserves intent/replay (offset=${offset})`,()=>{
 const h=harness();h.rows[2]=Array(12).fill('');h.rows[2][11]=false;
 const payload={date:'2026-09-02',type:'Chi',category:'Ứng lương',amount:400,actor:'An',partner:'Bank',content:'Pay',offset};
 const ctx={jobId:'transaction-checkbox-'+offset,idempotencyKey:'same-transaction'};
 const result=h.service.addFundTransactions('2026',[payload],ctx);
 assert.equal(result.inserted,1);assert.equal(result.firstRow,3);assert.equal(h.rows.length,3);
 assert.equal(JSON.parse(h.notes.get(3).slice('VTDB_INTENT_V1:'.length)).state,'complete');
 if(!offset)h.rows[2][11]=false;
 const replay=h.service.addFundTransactions('2026',[payload],ctx);
 assert.equal(replay.idempotentReplay,true);assert.equal(h.writes.filter(write=>write.c===1).length,1);
 h.rows[2][11]=!offset;
 assert.throws(()=>h.service.addFundTransactions('2026',[payload],ctx),/REQUIRES_RECONCILIATION/);
 assert.equal(h.writes.filter(write=>write.c===1).length,1);
});
