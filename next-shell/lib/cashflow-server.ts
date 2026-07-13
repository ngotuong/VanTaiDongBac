import 'server-only';
import { createFundBundleRepository } from '../../api/repositories/fund-bundle-repository.js';
import { runtimeConfig } from '../../api/runtime-config.js';
import { createWorkbookContextService } from '../../api/services/workbook-context-service.js';
import { createServerApiClient } from './platform/server-api-client';
import type { CashflowInitialData, FundCatalog, FundLoans, FundOptions, FundOverview, FundTransactions } from './platform/cashflow-types';

const TABLES={overview:'fund_overview_bundles',transactions:'fund_transaction_bundles',loans:'fund_loan_bundles',catalog:'catalog_bundles'} as const;
function httpError(status:number,message:string){return Object.assign(new Error(message),{status});}
function validYear(value:unknown){const year=String(value||'2026').trim();if(!/^20\d{2}$/.test(year))throw httpError(400,'Năm Thu chi không hợp lệ.');return year;}
function validMonth(value:unknown){const month=String(value||'').trim();if(month&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw httpError(400,'Tháng Thu chi không hợp lệ.');return month;}
function validGroup(value:unknown){const group=String(value||'incomeCategories').trim();const allowed=['incomeCategories','expenseCategories','actors','partners','loanPartners'];if(!allowed.includes(group))throw httpError(400,'Nhóm danh mục Thu chi không hợp lệ.');return group;}
function publicPayload<T>(row:{payload:unknown;synced_at:string}|null):T|null{if(!row?.payload||typeof row.payload!=='object'||(row.payload as {ok?:boolean}).ok===false)return null;return {...row.payload as object,supabaseCached:true,supabaseSyncedAt:row.synced_at} as T;}

export async function loadCashflowSurface(input:{year?:unknown;surface?:unknown;month?:unknown;group?:unknown;forceRefresh?:boolean}={}):Promise<unknown>{
  const year=validYear(input.year);const surface=String(input.surface||'all');const month=validMonth(input.month);const group=validGroup(input.group);
  createWorkbookContextService({httpError}).resolve({module:'cashflow',year});
  const api=await createServerApiClient();
  const fallback=async()=>{
    if(surface==='overview')return api.get<FundOverview>('getFundOverview',{params:{year,month,forceRefresh:input.forceRefresh?'true':''}});
    if(surface==='transactions')return api.get<FundTransactions>('getFundTransactions',{params:{year,month,limit:'500',forceRefresh:input.forceRefresh?'true':''}});
    if(surface==='loans')return api.get<FundLoans>('getFundLoanOverview',{params:{year,month,forceRefresh:input.forceRefresh?'true':''}});
    if(surface==='options')return api.get<FundOptions>('getFundFormOptions',{params:{year}});
    if(surface==='catalog')return api.get<FundCatalog>('getFundCatalog',{params:{year,group,forceRefresh:input.forceRefresh?'true':''}});
    return loadCashflowInitial(year,input.forceRefresh);
  };
  if(input.forceRefresh||surface==='all')return fallback();
  try{
    const config=runtimeConfig();if(!config.supabaseUrl||!config.serviceRoleKey)return fallback();
    const repo=createFundBundleRepository({httpError,fetchImpl:(request,init={})=>fetch(request,{...init,signal:AbortSignal.timeout(5000)})});
    const spec=surface==='overview'?[TABLES.overview,{year,month_key:month}]:surface==='transactions'?[TABLES.transactions,{year,filter_key:month?`month:${month}`:'recent_500'}]:surface==='loans'?[TABLES.loans,{year,month_key:month}]:surface==='options'?[TABLES.catalog,{catalog_key:`fund_form_options:${year}`}]:surface==='catalog'?[TABLES.catalog,{catalog_key:`fund_catalog:${year}:${group}`}]:null;
    if(spec){const cached=publicPayload(await repo.find(config,spec[0] as string,spec[1] as Record<string,string>));if(cached)return cached;}
  }catch{/* Apps Script is the compatibility fallback. */}
  return fallback();
}

export async function loadCashflowInitial(yearInput:unknown='2026',forceRefresh=false):Promise<CashflowInitialData>{
  const year=validYear(yearInput);const warnings:string[]=[];
  const load=<T>(surface:string,empty:T)=>loadCashflowSurface({year,surface,forceRefresh}).catch(error=>{warnings.push(error instanceof Error?error.message:String(error));return empty;});
  const [overview,transactions,loans,options]=await Promise.all([
    load<FundOverview>('overview',{metrics:[],months:[],incomeCategories:[],expenseCategories:[]}),
    load<FundTransactions>('transactions',{transactions:[],months:[]}),
    load<FundLoans>('loans',{metrics:[],loans:[],recentRows:[],months:[]}),
    load<FundOptions>('options',{})
  ]);
  return {year,overview:overview as FundOverview,transactions:transactions as FundTransactions,loans:loans as FundLoans,options:options as FundOptions,warnings};
}
