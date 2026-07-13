export function createCatalogBundleRepository(options: { fetchImpl?: typeof fetch; httpError: (status:number,message:string)=>Error }): {
  find(config: { supabaseUrl:string; serviceRoleKey:string }, catalogKey:string): Promise<{ catalog_key:string; payload:unknown; synced_at:string } | null>;
};
