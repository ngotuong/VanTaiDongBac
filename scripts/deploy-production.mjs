import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const identity = JSON.parse(fs.readFileSync(path.join(root, 'config/environment-identity.json')));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--([a-z-]+)=(.+)$/);
  if (!match) throw new Error('Use explicit --name=value arguments.');
  return [match[1], match[2]];
}));
const allowed = new Set(['phase', 'expected-production', 'record', 'writes-paused']);
if (Object.keys(args).some((key) => !allowed.has(key))) throw new Error('Unknown argument.');
if (!['prepare', 'activate', 'rollback'].includes(args.phase) || !/^dpl_[A-Za-z0-9]+$/.test(args['expected-production'] || '') || !args.record) {
  throw new Error('Required: --phase=prepare|activate|rollback --expected-production=dpl_... --record=artifacts/...json');
}
const recordPath = path.resolve(root, args.record);
if (!recordPath.startsWith(path.join(root, 'artifacts') + path.sep)) throw new Error('Record must stay under artifacts/.');

function run(command, values, capture = false) {
  const result = spawnSync(command, values, { cwd: root, encoding: 'utf8', env: { ...process.env, VERCEL_ORG_ID: identity.vercel.orgId, VERCEL_PROJECT_ID: identity.vercel.projectId }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout?.trim();
}
const api = (resource) => JSON.parse(run('vercel', ['api', resource, '--scope', identity.vercel.teamSlug, '--raw'], true));
const aliasId = () => api(`/v4/aliases/${identity.vercel.productionAlias}`).deploymentId;
function deployment(id) {
  const value = api(`/v13/deployments/${id}`);
  if (value.projectId !== identity.vercel.projectId || value.readyState !== 'READY' || value.target !== 'production') throw new Error('Deployment project/environment/READY guard failed.');
  return { id: value.id, url: `https://${value.url}` };
}
async function smoke(url, paused) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const html = await response.text();
  if (response.status !== 200 || response.url.includes('vercel.com/login') || !html.includes('<title>Vận tải Đông Bắc')) throw new Error('Root/title/login smoke failed.');
  const health = await fetch(`${url}/api/app?action=health`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const payload = await health.json();
  if (health.status !== 200 || payload.ok !== true || payload.environmentIdentity?.appsScriptDeploymentId !== identity.appsScript.productionDeploymentId || payload.environmentIdentity?.supabaseProjectRef !== identity.supabase.projectRef || payload.environmentIdentity?.vercelProjectId !== identity.vercel.projectId) throw new Error('Production backend identity smoke failed.');
  if (paused !== undefined && payload.businessWritesPaused !== paused) throw new Error('Maintenance flag smoke failed.');
  const session = await fetch(`${url}/api/app?action=authSession`, { signal: AbortSignal.timeout(30000) });
  if (session.status !== 401) throw new Error('Anonymous session smoke failed.');
}

async function main() {
  run('npm', ['run', 'check:identity']);
  if (api(`/v9/projects/${identity.vercel.projectName}`).id !== identity.vercel.projectId) throw new Error('Project guard failed.');
  const before = aliasId();
  if (before !== args['expected-production']) throw new Error(`Production alias changed: ${before}`);
  const rollback = deployment(before);
  if (args.phase === 'prepare') {
    if (fs.existsSync(recordPath)) throw new Error('Never overwrite a cutover record.');
    if (!['true', 'false'].includes(args['writes-paused'])) throw new Error('Required --writes-paused=true|false.');
    for (const values of [['test'], ['run', 'test:sql'], ['run', 'lint'], ['run', 'typecheck'], ['run', 'build'], ['audit', '--omit=dev', '--audit-level=moderate']]) run('npm', values);
    run('git', ['diff', '--check']);
    const sourceManifest = recordPath.replace(/\.json$/, '-source.json');
    run('node', ['scripts/release-manifest.mjs', sourceManifest]);
    const output = run('vercel', ['deploy', '--prod', '--skip-domain', '--yes', '--force', '--format', 'json', '--project', identity.vercel.projectId, '--scope', identity.vercel.teamSlug, '--env', `APPS_SCRIPT_URL=https://script.google.com/macros/s/${identity.appsScript.productionDeploymentId}/exec`, '--env', `BUSINESS_WRITES_PAUSED=${args['writes-paused']}`], true);
    let parsed;
    try { parsed = JSON.parse(output); } catch { throw new Error('Deployment must return structured metadata.'); }
    const candidate = deployment(parsed.id || parsed.deployment?.id);
    await smoke(candidate.url, args['writes-paused'] === 'true');
    if (aliasId() !== before) throw new Error('Prepare changed Production alias; stop.');
    const source = JSON.parse(fs.readFileSync(sourceManifest));
    fs.mkdirSync(path.dirname(recordPath), { recursive: true });
    fs.writeFileSync(recordPath, JSON.stringify({ schemaVersion: 1, checkpoint: 'R8', preparedAt: new Date().toISOString(), projectId: identity.vercel.projectId, backendDeploymentId: identity.appsScript.productionDeploymentId, sourceTreeSha256: source.sourceTreeSha256, candidate, rollback, businessWritesPaused: args['writes-paused'] === 'true', gates: { local: true, publicSmoke: true }, activations: [] }, null, 2) + '\n');
    console.log(`Production candidate READY, alias unchanged: ${candidate.id}; record ${recordPath}`);
    return;
  }
  const record = JSON.parse(fs.readFileSync(recordPath));
  if (record.projectId !== identity.vercel.projectId || record.backendDeploymentId !== identity.appsScript.productionDeploymentId || record.checkpoint !== 'R8') throw new Error('Cutover record identity failed.');
  const target = deployment(args.phase === 'rollback' ? record.rollback.id : record.candidate.id);
  if (args.phase === 'activate') {
    if (before !== record.rollback.id || !record.gates.local || !record.gates.publicSmoke) throw new Error('Activation baseline/gates failed.');
    if (!record.businessWritesPaused && (!record.gates.pairedBackend || !record.gates.payrollVersionParity || !record.gates.browserRoles || !record.gates.queueReconciliation)) throw new Error('Open-write gates incomplete.');
    await smoke(target.url, record.businessWritesPaused);
  }
  // Only the separately approved Production operation reaches this mutation.
  run('vercel', ['alias', 'set', target.url, identity.vercel.productionAlias, '--scope', identity.vercel.teamSlug]);
  record.activations.push({ phase: args.phase, from: before, to: target.id, at: new Date().toISOString(), smoke: 'pending' });
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
  if (aliasId() !== target.id) throw new Error('Production alias verification failed; stop and reconcile.');
  await smoke(`https://${identity.vercel.productionAlias}`, args.phase === 'activate' ? record.businessWritesPaused : undefined);
  record.activations.at(-1).smoke = 'PASS';
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
  console.log(`Production ${args.phase} PASS: ${target.id}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
