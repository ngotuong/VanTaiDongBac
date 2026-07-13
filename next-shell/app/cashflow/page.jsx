import { CashflowModule } from '../../components/cashflow/CashflowModule';
import { loadCashflowInitial } from '../../lib/cashflow-server';
export const metadata={title:'Thu chi · Vận tải Đông Bắc'};
export default async function Page(){try{return <CashflowModule initialData={await loadCashflowInitial('2026')}/>;}catch(error){return <CashflowModule initialData={{year:'2026',overview:{},transactions:{},loans:{},options:{},warnings:[]}} initialError={error?.message||'Không tải được module Thu chi.'}/>;}}
