export type RuntimeConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  appsScriptUrl: string;
  proxySecret: string;
};
export function runtimeConfig(env?: Record<string, string | undefined>): RuntimeConfig;
