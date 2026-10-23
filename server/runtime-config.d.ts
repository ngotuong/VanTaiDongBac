export type RuntimeConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  appsScriptUrl: string;
  proxySecret: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  cronSecret: string;
  syncWatchdogSecret: string;
  fundLowBalanceAlertEnabled: boolean;
  businessWritesPaused: boolean;
  defaultWorkbookYear: string;
};
export function runtimeConfig(env?: Record<string, string | undefined>): RuntimeConfig;
