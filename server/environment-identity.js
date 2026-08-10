const identity = require('../config/environment-identity.json');

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function supabaseProjectRef(value) {
  if (!value) return '';
  try {
    const host = new URL(String(value)).hostname.toLowerCase();
    const suffix = '.supabase.co';
    return host.endsWith(suffix) ? host.slice(0, -suffix.length) : '';
  } catch {
    return '';
  }
}

function appsScriptDeploymentId(value) {
  if (!value) return '';
  const match = String(value).match(/\/macros\/s\/([^/]+)\/exec(?:[/?#]|$)/);
  return match ? match[1] : '';
}

function allowedAppsScriptDeployments() {
  return new Set([
    identity.appsScript.productionDeploymentId,
    identity.appsScript.previewDeploymentId
  ]);
}

function assertRuntimeIdentity(config, env = process.env, options = {}) {
  const requireRuntime = options.requireRuntime === true;
  const actualSupabaseRef = supabaseProjectRef(config.supabaseUrl);
  const actualAppsScriptDeployment = appsScriptDeploymentId(config.appsScriptUrl);

  if (requireRuntime && !actualSupabaseRef) {
    throw httpError(503, 'Environment Identity Guard: thiếu SUPABASE_URL hợp lệ.');
  }
  if (actualSupabaseRef && actualSupabaseRef !== identity.supabase.projectRef) {
    throw httpError(503, `Environment Identity Guard: Supabase project không khớp (${actualSupabaseRef}).`);
  }
  if (requireRuntime && !actualAppsScriptDeployment) {
    throw httpError(503, 'Environment Identity Guard: thiếu APPS_SCRIPT_URL hợp lệ.');
  }
  if (actualAppsScriptDeployment && !allowedAppsScriptDeployments().has(actualAppsScriptDeployment)) {
    throw httpError(503, `Environment Identity Guard: Apps Script deployment không khớp (${actualAppsScriptDeployment}).`);
  }
  if (env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== identity.vercel.projectId) {
    throw httpError(503, `Environment Identity Guard: Vercel project không khớp (${env.VERCEL_PROJECT_ID}).`);
  }
  return true;
}

function publicEnvironmentIdentity(config, env = process.env) {
  return {
    appId: identity.appId,
    supabaseProjectRef: supabaseProjectRef(config.supabaseUrl) || identity.supabase.projectRef,
    vercelProjectId: identity.vercel.projectId,
    vercelEnvironment: String(env.VERCEL_ENV || 'local'),
    appsScriptDeploymentId: appsScriptDeploymentId(config.appsScriptUrl) || null
  };
}

module.exports = {
  identity,
  supabaseProjectRef,
  appsScriptDeploymentId,
  assertRuntimeIdentity,
  publicEnvironmentIdentity
};
