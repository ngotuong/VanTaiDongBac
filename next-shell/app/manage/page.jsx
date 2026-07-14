import { ManageReadOnlyModule } from '../../components/manage/ManageReadOnlyModule';
import { EntryModule } from '../../components/entry/EntryModule';
import { loadManageData } from '../../lib/manage-server';
export const metadata={title:'Vận hành'};
export default async function Page(){
  try { const data=await loadManageData(); return <ManageReadOnlyModule initialData={data} entry={<EntryModule initialCatalogs={{}}/>}/>; }
  catch(error){ return <ManageReadOnlyModule initialData={null} initialError={error?.message||'Không tải được dữ liệu Vận hành.'}/>; }
}
