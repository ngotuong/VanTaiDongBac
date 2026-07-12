function runtimeConfig(env = process.env) {
  return {
    supabaseUrl: String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: String(env.SUPABASE_ANON_KEY || ''),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY || ''),
    appsScriptUrl: String(env.APPS_SCRIPT_URL || ''),
    proxySecret: String(env.APP_PROXY_SECRET || '')
  };
}

module.exports = { runtimeConfig };
