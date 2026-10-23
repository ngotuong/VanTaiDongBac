import { CashflowModule } from '../../components/cashflow/CashflowModule';
import { loadCashflowInitial } from '../../lib/cashflow-server';
import { loadPlatformContext } from '../../lib/request-context';
export const metadata={title:'Thu chi'};
export default async function Page(){let year='';try{year=(await loadPlatformContext({module:'cashflow'})).workbook.year;return <CashflowModule initialData={await loadCashflowInitial(year)}/>;}catch(error){return <CashflowModule initialData={{year,overview:{},transactions:{},loans:{},options:{},warnings:[]}} initialError={error?.message||'Không tải được module Thu chi.'}/>;}}
