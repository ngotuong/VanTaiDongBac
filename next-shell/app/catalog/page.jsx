import { CatalogModule } from '../../components/catalog/CatalogModule';
import { loadCatalogData } from '../../lib/catalog-server';
export const metadata={title:'Danh mục'};
export default async function Page(){
  try{return <CatalogModule initialData={await loadCatalogData()}/>;}
  catch(error){return <CatalogModule initialData={null} initialError={error?.message||'Không tải được Danh mục.'}/>;}
}
