import { ManageReadOnlyModule } from '../../components/manage/ManageReadOnlyModule';
import { EntryModule } from '../../components/entry/EntryModule';
import { loadManageData } from '../../lib/manage-server';
import { loadEntryCatalogs } from '../../lib/entry-server';
export const metadata={title:'Vận hành'};
export default async function Page(){
  try { const data=await loadManageData(); const catalogs=await loadEntryCatalogs().catch(()=>({})); return <ManageReadOnlyModule initialData={data} initialCatalogs={catalogs} entry={<EntryModule initialCatalogs={catalogs}/>}/>; }
  catch(error){ return <ManageReadOnlyModule initialData={null} initialError={error?.message||'Không tải được dữ liệu Vận hành.'}/>; }
}
