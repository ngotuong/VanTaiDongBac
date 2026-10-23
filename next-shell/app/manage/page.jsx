import { ManageReadOnlyModule } from '../../components/manage/ManageReadOnlyModule';
import { currentTransportMonthRange, loadManageData } from '../../lib/manage-server';
import { loadPlatformContext } from '../../lib/request-context';
export const metadata={title:'Vận hành'};
export default async function Page(){
  try { const context=await loadPlatformContext({module:'transport'});const range=context.workbook.readOnly?{}:currentTransportMonthRange();const data=await loadManageData({...range,year:context.workbook.year}); return <ManageReadOnlyModule initialData={data}/>; }
  catch(error){ return <ManageReadOnlyModule initialData={null} initialError={error?.message||'Không tải được dữ liệu Vận hành.'}/>; }
}
