import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const files = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))]
  .sort().filter((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile())
  .map((file) => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const manifest = {
  schemaVersion: 1, capturedAt: new Date().toISOString(), gitHead: git('rev-parse', 'HEAD').trim(),
  gitStatus: git('status', '--short'), sourceTreeSha256: sha(JSON.stringify(files)),
  identity: JSON.parse(fs.readFileSync(path.join(root, 'config/environment-identity.json'))),
  dependencies: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).dependencies,
  migrationFiles: files.filter((file) => file.path.startsWith('supabase/migrations/')).map((file) => file.path),
  // Inventory of source, not an attestation of live schema or deployed artifact.
  files
};
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts/r8-release-manifest.json'));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Source manifest: ${output}; ${files.length} files; SHA256 ${manifest.sourceTreeSha256}`);
