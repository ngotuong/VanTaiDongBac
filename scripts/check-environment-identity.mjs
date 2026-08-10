import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { identity, assertRuntimeIdentity } = require('../server/environment-identity.js');
const root = path.resolve(import.meta.dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`Environment Identity Guard: ${label} không khớp (${actual || 'missing'} != ${expected}).`);
  }
}

function checkLocalLinks() {
  const claspPath = path.join(root, '.clasp.json');
  if (fs.existsSync(claspPath)) {
    const clasp = readJson('.clasp.json');
    assertEqual('Apps Script scriptId', clasp.scriptId, identity.appsScript.scriptId);
  } else if (process.env.VERCEL !== '1') {
    throw new Error('Environment Identity Guard: thiếu liên kết local .clasp.json.');
  }

  const supabaseRefPath = path.join(root, 'supabase/.temp/project-ref');
  if (fs.existsSync(supabaseRefPath)) {
    assertEqual('Supabase project-ref local', fs.readFileSync(supabaseRefPath, 'utf8').trim(), identity.supabase.projectRef);
  }

  const vercelRepoPath = path.join(root, '.vercel/repo.json');
  if (fs.existsSync(vercelRepoPath)) {
    const linked = readJson('.vercel/repo.json').projects?.find((project) => project.directory === '.');
    assertEqual('Vercel projectId local', linked?.id, identity.vercel.projectId);
    assertEqual('Vercel project name local', linked?.name, identity.vercel.projectName);
    assertEqual('Vercel orgId local', linked?.orgId, identity.vercel.orgId);
  }
}

function checkRuntime() {
  const runtimeRequired = process.argv.includes('--require-runtime') || process.env.VERCEL === '1';
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    appsScriptUrl: process.env.APPS_SCRIPT_URL || process.env.VITE_APP_SERVICE_URL || ''
  };
  assertRuntimeIdentity(config, process.env, { requireRuntime: runtimeRequired });
}

try {
  checkLocalLinks();
  checkRuntime();
  process.stdout.write([
    'Environment Identity Guard PASS',
    `App: ${identity.appId}`,
    `Supabase: ${identity.supabase.projectRef}`,
    `Vercel: ${identity.vercel.projectId}`,
    `Apps Script: ${identity.appsScript.scriptId}`,
    ''
  ].join('\n'));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
