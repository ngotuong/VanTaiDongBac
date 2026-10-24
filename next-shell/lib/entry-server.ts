import 'server-only';
import { loadServerWorkbookContext } from './request-context.js';
import { createServerApiClient } from './platform/server-api-client';
import type { EntryCatalogs, EntryFormType } from './platform/entry-types';
export async function loadEntryCatalogs(formType:EntryFormType|''='',yearInput?:unknown){
  const workbook=await loadServerWorkbookContext({module:'transport',year:yearInput});
  const api=await createServerApiClient();
  const response=await api.get<EntryCatalogs & {catalogs?:EntryCatalogs}>('getCatalogs',{params:{formType,year:workbook.year}});
  return response.catalogs ? {
    ...response.catalogs,
    supabaseCached: response.supabaseCached,
    supabaseSyncedAt: response.supabaseSyncedAt,
    updatedAt: response.updatedAt
  } : response;
}
