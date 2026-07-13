import 'server-only';
import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { createServerApiClient } from './platform/server-api-client';
import type { EntryCatalogs, EntryFormType } from './platform/entry-types';
function httpError(status:number,message:string){return Object.assign(new Error(message),{status});}
export async function loadEntryCatalogs(formType:EntryFormType='vanChuyen'){
  createWorkbookContextService({httpError}).resolve({module:'transport'});
  const api=await createServerApiClient();
  const response=await api.get<EntryCatalogs & {catalogs?:EntryCatalogs}>('getCatalogs',{params:{formType}});
  return response.catalogs || response;
}
