function runtimeConfig(env = process.env) {
  return {
    supabaseUrl: String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: String(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY || ''),
    appsScriptUrl: String(env.APPS_SCRIPT_URL || env.VITE_APP_SERVICE_URL || ''),
    proxySecret: String(env.APP_PROXY_SECRET || ''),
    vapidPublicKey: String(env.WEB_PUSH_VAPID_PUBLIC_KEY || ''),
    vapidPrivateKey: String(env.WEB_PUSH_VAPID_PRIVATE_KEY || ''),
    vapidSubject: String(env.WEB_PUSH_VAPID_SUBJECT || ''),
    cronSecret: String(env.CRON_SECRET || ''),
    syncWatchdogSecret: String(env.SYNC_WATCHDOG_SECRET || ''),
    fundLowBalanceAlertEnabled: String(env.FUND_LOW_BALANCE_ALERT_ENABLED || '').toLowerCase() === 'true',
    defaultWorkbookYear: String(env.DEFAULT_WORKBOOK_YEAR || '2026')
  };
}

module.exports = { runtimeConfig };
