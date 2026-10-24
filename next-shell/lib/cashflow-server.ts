import 'server-only';
import { createFundBundleRepository } from '../../server/repositories/fund-bundle-repository.js';
import { createFundRangeService } from '../../server/services/fund-range-service.js';
import { createFundTransactionPageService } from '../../server/services/fund-transaction-page-service.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { loadServerWorkbookContext } from './request-context.js';
import { createServerApiClient } from './platform/server-api-client';
import type { CashflowInitialData, FundCatalog, FundLoans, FundOptions, FundOverview, FundTransactions } from './platform/cashflow-types';

const TABLES={overview:'fund_overview_bundles',transactions:'fund_transaction_bundles',loans:'fund_loan_bundles',catalog:'catalog_bundles'} as const;
function httpError(status:number,message:string){return Object.assign(new Error(message),{status});}
function validYear(value:unknown){const year=String(value||'').trim();if(!/^20\d{2}$/.test(year))throw httpError(400,'Năm Thu chi không hợp lệ.');return year;}
function validMonth(value:unknown){const month=String(value||'').trim();if(month&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw httpError(400,'Tháng Thu chi không hợp lệ.');return month;}
function validDate(value:unknown,label:string){const date=String(value||'').trim();if(date&&!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date))throw httpError(400,`${label} không hợp lệ.`);return date;}
function validGroup(value:unknown){const group=String(value||'incomeCategories').trim();const allowed=['incomeCategories','expenseCategories','actors','partners','loanPartners'];if(!allowed.includes(group))throw httpError(400,'Nhóm danh mục Thu chi không hợp lệ.');return group;}
function validPage(value:unknown){const page=Number.parseInt(String(value||'1'),10);if(!Number.isFinite(page)||page<1||page>100000)throw httpError(400,'Trang giao dịch Thu chi không hợp lệ.');return page;}
function validPageSize(value:unknown){const pageSize=Number.parseInt(String(value||'20'),10);if(!Number.isFinite(pageSize)||pageSize<1||pageSize>100)throw httpError(400,'Số dòng mỗi trang Thu chi không hợp lệ.');return pageSize;}
function publicPayload<T>(row:{payload:unknown;synced_at:string}|null):T|null{if(!row?.payload||typeof row.payload!=='object'||(row.payload as {ok?:boolean}).ok===false)return null;return {...row.payload as object,supabaseCached:true,supabaseSyncedAt:row.synced_at} as T;}
function normalizedText(value:unknown){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();}
function filterTransactionSearch(payload:FundTransactions,search:string){
  if(!search)return payload;
  const query=normalizedText(search);
  const transactions=(payload.transactions||[]).filter((row)=>normalizedText([row.voucher,row.dateText||row.date,row.type,row.category,row.actor,row.partner,row.content].join(' ')).includes(query));
  return {...payload,transactions,totalRows:transactions.length,displayedRows:transactions.length};
}
function catalogFromOptions(options:FundOptions,group:string):FundCatalog{
  const values=(options[group as keyof FundOptions] as string[]|undefined)||[];
  return {ok:true,catalogCacheVersion:'fund_catalog_v2',selectedGroup:group,rows:values.map((value,index)=>({rowIndex:`fallback:${group}:${index}`,value,source:'fallback'})),supabaseCached:true,supabaseSyncedAt:options.supabaseSyncedAt};
}

export async function loadCashflowSurface(input:{year?:unknown;surface?:unknown;month?:unknown;group?:unknown;startDate?:unknown;endDate?:unknown;search?:unknown;page?:unknown;pageSize?:unknown;transactionMode?:unknown;partner?:unknown;forceRefresh?:boolean}={}):Promise<unknown>{
  const workbook=await loadServerWorkbookContext({module:'cashflow',year:input.year});
  const year=validYear(workbook.year);const surface=String(input.surface||'all');const month=validMonth(input.month);const group=validGroup(input.group);const startDate=validDate(input.startDate,'Ngày bắt đầu');const endDate=validDate(input.endDate,'Ngày kết thúc');const search=String(input.search||'').trim().slice(0,200);const page=validPage(input.page);const pageSize=validPageSize(input.pageSize);const transactionMode=input.transactionMode==='debt'?'debt':'all';const partner=String(input.partner||'').trim().slice(0,200);
  if(Boolean(startDate)!==Boolean(endDate))throw httpError(400,'Cần chọn đủ ngày bắt đầu và ngày kết thúc.');
  if(startDate&&endDate&&startDate>endDate)throw httpError(400,'Khoảng ngày Thu chi không hợp lệ.');
  if((startDate&&!startDate.startsWith(`${year}-`))||(endDate&&!endDate.startsWith(`${year}-`)))throw httpError(400,`Khoảng ngày Thu chi phải thuộc năm ${year}.`);
  if(surface==='range'){
    const params={year,startDate,endDate,month,page,pageSize,transactionMode,partner,search,forceRefresh:input.forceRefresh};
    const [overview,transactions,loans]=await Promise.all([
      loadCashflowSurface({...params,surface:'overview'}),
      loadCashflowSurface({...params,surface:'transactions'}),
      loadCashflowSurface({...params,surface:'loans'})
    ]);
    return {overview,transactions,loans};
  }
  if(surface==='all')return loadCashflowInitial(year,Boolean(input.forceRefresh));
  const api=await createServerApiClient();
  const rangeService=createFundRangeService();
  const transactionPageService=createFundTransactionPageService();
  const fallback=async()=>{
    if(surface==='overview')return api.get<FundOverview>('getFundOverview',{params:{year,month,startDate,endDate,forceRefresh:input.forceRefresh?'true':''}});
    if(surface==='transactions')return api.get<FundTransactions>('getFundTransactions',{params:{year,month,startDate,endDate,search,limit:'500',forceRefresh:input.forceRefresh?'true':''}});
    if(surface==='loans')return api.get<FundLoans>('getFundLoanOverview',{params:{year,month,startDate,endDate,forceRefresh:input.forceRefresh?'true':''}});
    if(surface==='options')return api.get<FundOptions>('getFundFormOptions',{params:{year,forceRefresh:'true'}});
    if(surface==='catalog')return api.get<FundCatalog>('getFundCatalog',{params:{year,group,forceRefresh:input.forceRefresh?'true':''}});
    return loadCashflowInitial(year,input.forceRefresh);
  };
  if(input.forceRefresh)return fallback();
  const catalogCacheOnly=surface==='catalog';
  try{
    const config=runtimeConfig();if(!config.supabaseUrl||!config.serviceRoleKey)throw httpError(503,'Cache Quỹ trên Supabase chưa được cấu hình.');
    const repo=createFundBundleRepository({httpError,fetchImpl:(request,init={})=>fetch(request,{...init,signal:AbortSignal.timeout(5000)})});
    const loadDirectTransactionPage=async(manifest:FundTransactions)=>{
      const selectedMonth=String(manifest.selectedMonth||'');const version=String(manifest.pagination?.version||'');const cachePageSize=Number(manifest.pagination?.cachePageSize||0);const expected=Number(manifest.pagination?.pageCount||0);
      if(!selectedMonth||!version||cachePageSize<1||expected<1)throw httpError(503,'Manifest phân trang Thu chi không hợp lệ.');
      const totalRows=Number(manifest.pagination?.totalRows||0);const totalPages=Math.max(1,Math.ceil(totalRows/pageSize));const currentPage=Math.min(page,totalPages);const firstSourceOffset=(currentPage-1)*pageSize;const firstCachePage=Math.floor(firstSourceOffset/cachePageSize)+1;const lastCachePage=Math.floor((firstSourceOffset+pageSize-1)/cachePageSize)+1;
      const pageNumbers=Array.from(new Set([firstCachePage,Math.min(lastCachePage,expected)]));
      const rows=await Promise.all(pageNumbers.map(pageNumber=>repo.find(config,TABLES.transactions,{year,filter_key:`month:${selectedMonth}:version:${version}:page:${pageNumber}`})));
      if(rows.some(row=>!row))throw httpError(503,'Cache trang Thu chi chưa đầy đủ.');
      const bundles=rows.map(row=>publicPayload<FundTransactions>(row)).filter(Boolean) as FundTransactions[];
      return transactionPageService.buildDirectPage(manifest as unknown as Record<string,unknown>,bundles as unknown as Array<Record<string,unknown>>,currentPage,pageSize) as FundTransactions;
    };
    const loadPagedTransactions=async(manifests:FundTransactions[])=>{
      const rows=await Promise.all(manifests.map(async(manifest)=>{
        const selectedMonth=String(manifest.selectedMonth||'');
        const version=String(manifest.pagination?.version||'');
        const expected=Number(manifest.pagination?.pageCount||0);
        if(!selectedMonth||!version||expected<1)throw httpError(503,'Manifest phân trang Thu chi không hợp lệ.');
        const prefix=`month:${selectedMonth}:version:${version}:page:`;
        const pages=await repo.findPages(config,TABLES.transactions,year,prefix);
        if(pages.length!==expected)throw httpError(503,'Cache trang Thu chi chưa đầy đủ.');
        return pages.map(row=>publicPayload<FundTransactions>(row)).filter(Boolean) as FundTransactions[];
      }));
      return transactionPageService.build({manifests,pageBundles:rows.flat(),startDate,endDate,search,page,pageSize,mode:transactionMode,partner}) as FundTransactions;
    };
    if(startDate&&endDate){
      if(surface==='overview'){
        const requestedMonths=rangeService.monthKeys(startDate,endDate);
        const rows=await Promise.all(requestedMonths.map(monthKey=>repo.find(config,TABLES.overview,{year,month_key:monthKey})));
        const cachedRows=rangeService.contiguousCachedRows(rows,requestedMonths);
        if(cachedRows.length){
          const payloads=cachedRows.map(row=>publicPayload<FundOverview>(row)).filter(Boolean) as FundOverview[];
          if(payloads.length===cachedRows.length)return rangeService.buildOverviewRange(payloads as unknown as Array<Record<string,unknown>>,startDate,endDate) as FundOverview;
        }
      }
      if(surface==='transactions'){
        const requestedMonths=rangeService.monthKeys(startDate,endDate);
        const rows=await Promise.all(requestedMonths.map(monthKey=>repo.find(config,TABLES.transactions,{year,filter_key:`month:${monthKey}`})));
        const cachedRows=rangeService.contiguousCachedRows(rows,requestedMonths);
        if(cachedRows.length){
          const payloads=cachedRows.map(row=>publicPayload<FundTransactions>(row)).filter(Boolean) as FundTransactions[];
          if(payloads.length===cachedRows.length){
            if(payloads.every(payload=>transactionPageService.isPagedManifest(payload)))return loadPagedTransactions(payloads);
            if(payloads.some(payload=>transactionPageService.isPagedManifest(payload)))throw httpError(503,'Cache trang Thu chi đang chuyển phiên bản; vui lòng thử lại sau khi đồng bộ hoàn tất.');
            return filterTransactionSearch(rangeService.mergeTransactionBundles(payloads as unknown as Array<Record<string,unknown>>,startDate,endDate) as FundTransactions,search);
          }
        }
      }
      if(surface==='loans'){
        const cached=publicPayload<FundLoans>(await repo.find(config,TABLES.loans,{year,month_key:''}));
        if(cached)return rangeService.buildLoansRange(cached as unknown as Record<string,unknown>,startDate,endDate) as FundLoans;
      }
      throw httpError(503,'Cache Quỹ theo khoảng ngày trên Supabase chưa đầy đủ.');
    }
    const spec=surface==='overview'?[TABLES.overview,{year,month_key:month}]:surface==='transactions'?[TABLES.transactions,{year,filter_key:month?`month:${month}`:'recent_500'}]:surface==='loans'?[TABLES.loans,{year,month_key:month}]:surface==='options'?[TABLES.catalog,{catalog_key:`fund_form_options:${year}`}]:surface==='catalog'?[TABLES.catalog,{catalog_key:`fund_catalog:${year}:${group}`}]:null;
    if(spec){
      const row=await repo.find(config,spec[0] as string,spec[1] as Record<string,string>);
      const cached=publicPayload<Record<string,unknown>>(row);
      const isCatalog=surface==='options'||surface==='catalog';
      if(cached&&(!isCatalog||cached.catalogCacheVersion==='fund_catalog_v2')){
        if(surface==='transactions'&&transactionPageService.isPagedManifest(cached)){
          if(month&&!startDate&&!endDate&&!search&&transactionMode==='all'&&!partner)return loadDirectTransactionPage(cached as FundTransactions);
          return loadPagedTransactions([cached as FundTransactions]);
        }
        return surface==='transactions'?filterTransactionSearch(cached as FundTransactions,search):cached;
      }
      if(surface==='catalog'){
        const options=publicPayload<FundOptions>(await repo.find(config,TABLES.catalog,{catalog_key:`fund_form_options:${year}`}));
        if(options?.catalogCacheVersion==='fund_catalog_v2')return catalogFromOptions(options,group);
        throw httpError(503,'Cache Danh mục Quỹ trên Supabase chưa sẵn sàng.');
      }
      if(isCatalog){
        throw httpError(503,'Cache danh sách Quỹ trên Supabase chưa sẵn sàng.');
      }
    }
  }catch(error){
    if(error&&typeof error==='object'&&'status' in error)throw error;
    throw httpError(503,error instanceof Error?error.message:'Không đọc được cache Quỹ từ Supabase.');
  }
  throw httpError(503,catalogCacheOnly?'Cache Danh mục Quỹ trên Supabase chưa sẵn sàng.':'Cache Quỹ trên Supabase chưa sẵn sàng.');
}

export async function loadCashflowInitial(yearInput?:unknown,forceRefresh=false):Promise<CashflowInitialData>{
  const workbook=await loadServerWorkbookContext({module:'cashflow',year:yearInput});
  const year=validYear(workbook.year);const warnings:string[]=[];
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const datePart=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  const currentYear=datePart('year');const isCurrentYear=year===currentYear;
  const month=isCurrentYear?`${currentYear}-${datePart('month')}`:'';
  const load=<T>(surface:string,empty:T,monthly=false)=>loadCashflowSurface({year,surface,forceRefresh,...(monthly?{month}:{})}).catch(error=>{warnings.push(error instanceof Error?error.message:String(error));return empty;});
  const [overview,transactions,loans,options]=await Promise.all([
    load<FundOverview>('overview',{metrics:[],months:[],incomeCategories:[],expenseCategories:[]},true),
    load<FundTransactions>('transactions',{transactions:[],months:[]},true),
    load<FundLoans>('loans',{metrics:[],loans:[],recentRows:[],months:[]},true),
    load<FundOptions>('options',{})
  ]);
  return {year,overview:overview as FundOverview,transactions:transactions as FundTransactions,loans:loans as FundLoans,options:options as FundOptions,warnings};
}
