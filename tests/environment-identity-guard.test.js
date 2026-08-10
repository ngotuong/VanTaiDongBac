const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const manifest = require('../config/environment-identity.json');
const {
  supabaseProjectRef,
  appsScriptDeploymentId,
  assertRuntimeIdentity,
  publicEnvironmentIdentity
} = require('../server/environment-identity');

const previewAppsScriptUrl = `https://script.google.com/macros/s/${manifest.appsScript.previewDeploymentId}/exec`;
const validConfig = { supabaseUrl: manifest.supabase.url, appsScriptUrl: previewAppsScriptUrl };

test('canonical identity keeps Vận tải separate from the personal-loan project', () => {
  assert.equal(manifest.appId, 'vantaidongbac');
  assert.equal(manifest.supabase.projectRef, 'lyquwesyjbpalnwfxzwl');
  assert.notEqual(manifest.supabase.projectRef, 'hmfxnstrqfqpvsgfmjmd');
  assert.equal(manifest.vercel.projectId, 'prj_ksh9aZZowziqFw2G2tWJzbnwtSOG');
});

test('runtime identity parser exposes only stable public fingerprints', () => {
  assert.equal(supabaseProjectRef(manifest.supabase.url), manifest.supabase.projectRef);
  assert.equal(appsScriptDeploymentId(previewAppsScriptUrl), manifest.appsScript.previewDeploymentId);
  assert.equal(assertRuntimeIdentity(validConfig, { VERCEL_PROJECT_ID: manifest.vercel.projectId }), true);
  assert.deepEqual(publicEnvironmentIdentity(validConfig, { VERCEL_ENV: 'production' }), {
    appId: manifest.appId,
    supabaseProjectRef: manifest.supabase.projectRef,
    vercelProjectId: manifest.vercel.projectId,
    vercelEnvironment: 'production',
    appsScriptDeploymentId: manifest.appsScript.previewDeploymentId
  });
});

test('runtime identity fails closed for cross-project configuration', () => {
  assert.throws(
    () => assertRuntimeIdentity({ ...validConfig, supabaseUrl: 'https://hmfxnstrqfqpvsgfmjmd.supabase.co' }),
    /Supabase project không khớp/
  );
  assert.throws(
    () => assertRuntimeIdentity({ ...validConfig, appsScriptUrl: 'https://script.google.com/macros/s/WRONG/exec' }),
    /Apps Script deployment không khớp/
  );
  assert.throws(
    () => assertRuntimeIdentity(validConfig, { VERCEL_PROJECT_ID: 'prj_wrong' }),
    /Vercel project không khớp/
  );
});

test('build and preview deploy both execute the canonical guard', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const guardScript = fs.readFileSync(path.join(root, 'scripts/check-environment-identity.mjs'), 'utf8');
  const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy-preview.mjs'), 'utf8');
  assert.equal(packageJson.scripts['check:identity'], 'node scripts/check-environment-identity.mjs');
  assert.match(packageJson.scripts.build, /check-environment-identity\.mjs/);
  assert.match(packageJson.scripts['build:next-accounts'], /check-environment-identity\.mjs/);
  assert.match(deployScript, /check:identity/);
  assert.match(deployScript, /environment-identity\.json/);
  assert.match(guardScript, /fs\.existsSync\(claspPath\)/);
  assert.match(guardScript, /process\.env\.VERCEL !== '1'/);
  assert.match(guardScript, /assertRuntimeIdentity\(config, process\.env, \{ requireRuntime: runtimeRequired \}\)/);
});
