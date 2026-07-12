let client;
function config() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL || '', anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' }; }
export function getReportSupabaseClient() {
  const cfg = config();
  if (!cfg.url || !cfg.anonKey || !window.supabase?.createClient) return null;
  if (!client) client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
export async function getReportAccessToken() { const result = await getReportSupabaseClient()?.auth.getSession(); return result?.data?.session?.access_token || ''; }
