import { EntryModule } from '../../components/entry/EntryModule';
import { loadEntryCatalogs } from '../../lib/entry-server';
export const metadata={title:'Nhập liệu · Vận tải Đông Bắc'};
export default async function Page(){
  try{return <EntryModule initialCatalogs={await loadEntryCatalogs()}/>;}
  catch(error){return <EntryModule initialCatalogs={{}} initialError={error?.message||'Không tải được danh mục nhập liệu.'}/>;}
}
