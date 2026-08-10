export type EnvironmentIdentityManifest = {
  schemaVersion: number;
  appId: string;
  displayName: string;
  supabase: { projectRef: string; projectName: string; url: string };
  vercel: {
    projectId: string;
    projectName: string;
    orgId: string;
    teamSlug: string;
    productionAlias: string;
    previewAlias: string;
  };
  appsScript: {
    scriptId: string;
    productionDeploymentId: string;
    previewDeploymentId: string;
  };
};

export const identity: EnvironmentIdentityManifest;
export function supabaseProjectRef(value: string): string;
export function appsScriptDeploymentId(value: string): string;
export function assertRuntimeIdentity(
  config: { supabaseUrl: string; appsScriptUrl: string },
  env?: Record<string, string | undefined>,
  options?: { requireRuntime?: boolean }
): true;
export function publicEnvironmentIdentity(
  config: { supabaseUrl: string; appsScriptUrl: string },
  env?: Record<string, string | undefined>
): {
  appId: string;
  supabaseProjectRef: string;
  vercelProjectId: string;
  vercelEnvironment: string;
  appsScriptDeploymentId: string | null;
};
