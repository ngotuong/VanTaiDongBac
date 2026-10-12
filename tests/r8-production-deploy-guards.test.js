const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const identity = JSON.parse(fs.readFileSync(path.join(root, 'config/environment-identity.json')));

function blockedActivation({ projectMismatch = false, aliasMismatch = false, gates = {}, backendMismatch = false } = {}) {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'artifacts/r8-production-guard-'));
  const baseline = 'dpl_TestBaseline';
  const record = path.join(dir, 'record.json');
  const log = path.join(dir, 'commands.jsonl');
  fs.writeFileSync(record, JSON.stringify({ checkpoint: 'R8', projectId: identity.vercel.projectId, backendDeploymentId: backendMismatch ? 'wrong-backend' : identity.appsScript.productionDeploymentId, candidate: { id: 'dpl_TestCandidate' }, rollback: { id: baseline }, businessWritesPaused: false, gates: { local: true, publicSmoke: true, ...gates } }));
  const fake = `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(process.env.R8_GUARD_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
const resource = process.argv[3] || '';
if (process.argv[2] !== 'api') throw new Error('Mutation attempted');
if (resource.startsWith('/v9/projects/')) console.log(JSON.stringify({id: '${projectMismatch ? 'wrong-project' : identity.vercel.projectId}'}));
else if (resource.startsWith('/v4/aliases/')) console.log(JSON.stringify({deploymentId: '${aliasMismatch ? 'dpl_Unexpected' : baseline}'}));
else console.log(JSON.stringify({id: resource.split('/').pop(), projectId: '${identity.vercel.projectId}', readyState: 'READY', target: 'production', url: 'invalid.example'}));
`;
  fs.writeFileSync(path.join(dir, 'vercel'), fake, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'npm'), `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o755 });
  try {
    const result = spawnSync(process.execPath, ['scripts/deploy-production.mjs', '--phase=activate', `--expected-production=${baseline}`, `--record=${path.relative(root, record)}`], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, R8_GUARD_LOG: log } });
    const commands = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
    assert.equal(result.status, 1);
    assert.equal(commands.some((args) => ['deploy', 'alias', 'promote'].includes(args[0])), false);
    return result.stderr;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('Production project or baseline alias drift stops before any mutation', () => {
  assert.match(blockedActivation({ projectMismatch: true }), /Project guard failed/);
  assert.match(blockedActivation({ aliasMismatch: true }), /Production alias changed/);
});

test('Production record cannot substitute a Preview or foreign backend', () => {
  assert.match(blockedActivation({ backendMismatch: true }), /record identity failed/);
});

test('Production open-write activation requires every paired backend, parity, role and queue gate', () => {
  const all = { pairedBackend: true, payrollVersionParity: true, browserRoles: true, queueReconciliation: true };
  for (const key of Object.keys(all)) assert.match(blockedActivation({ gates: { ...all, [key]: false } }), /Open-write gates incomplete/);
});

test('Production prepare record cannot escape artifacts directory', () => {
  const result = spawnSync(process.execPath, ['scripts/deploy-production.mjs', '--phase=prepare', '--expected-production=dpl_TestBaseline', `--record=/tmp/r8-guard-${crypto.randomUUID()}.json`, '--writes-paused=true'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Record must stay under artifacts/);
});
