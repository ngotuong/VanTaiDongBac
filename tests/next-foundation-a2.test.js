const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('A2 root layout is a dynamic server auth guard around the shared shell', () => {
  const rootLayout = read('app/layout.jsx');
  const layout = read('next-shell/app/layout.jsx');
  assert.match(rootLayout, /dynamic = 'force-dynamic'/);
  assert.match(layout, /loadPlatformContext/);
  assert.match(layout, /error\?\.status === 401 \|\| error\?\.status === 403/);
  assert.match(layout, /redirect\(`\$\{protocol\}:\/\/\$\{host\}\/`\)/);
  assert.match(layout, /<WorkbookContextProvider value=\{context\}>/);
  assert.match(layout, /<AppShell context=\{context\}>/);
});

test('A2 shell is role-aware accessible and keeps legacy root as rollback', () => {
  const shell = read('next-shell/components/platform/AppShell.tsx');
  const navigation = read('next-shell/components/platform/ShellNavigation.tsx');
  assert.match(shell, /platform-skip-link/);
  assert.match(shell, /href="\/" className="platform-legacy-link"/);
  assert.match(shell, /shareholder/);
  assert.match(shell, /WRITE_ROLES/);
  assert.match(navigation, /items\.filter\(\(item\) => item\.roles\.includes\(role\)\)/);
  assert.match(navigation, /aria-current=\{active \? 'page'/);
});

test('A2 owns typed server/client API clients and request correlation', () => {
  const server = read('next-shell/lib/platform/server-api-client.ts');
  const client = read('next-shell/lib/platform/client-api-client.ts');
  const contract = read('next-shell/lib/platform/api-contract.ts');
  const observability = read('next-shell/lib/server-observability.js');
  assert.match(server, /cookieStore\.toString\(\)/);
  assert.match(server, /cache: 'no-store'/);
  assert.match(server, /X-Correlation-ID/);
  assert.match(client, /credentials: 'same-origin'/);
  assert.match(contract, /class PlatformApiError/);
  assert.match(observability, /correlationId/);
  assert.doesNotMatch(JSON.stringify({ server, client }), /SUPABASE_SERVICE_ROLE_KEY|APP_PROXY_SECRET/);
});

test('A2 provides loading error not-found and workbook context boundaries', () => {
  for (const file of ['app/loading.jsx', 'app/error.jsx', 'app/not-found.jsx', 'next-shell/components/platform/WorkbookContextProvider.tsx']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  }
  assert.match(read('app/loading.jsx'), /aria-busy="true"/);
  assert.match(read('app/error.jsx'), /role="alert"/);
  assert.match(read('app/not-found.jsx'), /Không tìm thấy trang/);
  assert.match(read('next-shell/components/platform/WorkbookContextProvider.tsx'), /useWorkbookContext/);
});

test('A2 platform tokens enforce touch focus responsive and reduced-motion rules', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});

test('A2 adds real lint and independent TypeScript quality gates', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.lint, /^eslint /);
  assert.match(pkg.scripts.typecheck, /^tsc --noEmit/);
  assert.equal(Boolean(pkg.devDependencies.eslint), true);
  assert.equal(Boolean(pkg.devDependencies.typescript), true);
  assert.equal(fs.existsSync(path.join(root, 'eslint.config.mjs')), true);
  assert.equal(fs.existsSync(path.join(root, 'tsconfig.platform.json')), true);
});

test('A2 foundation and B1-B3 are complete while later modules are not started', () => {
  const roadmap = read('NEXTJS_MIGRATION_PLAN.md');
  assert.match(roadmap, /\| B1 \|[^\n]+\| DONE \|/);
  assert.match(roadmap, /\| B2 \|[^\n]+\| DONE \|/);
  assert.match(roadmap, /\| B3 \|[^\n]+\| DONE \|/);
  for (const checkpoint of ['B4', 'B5', 'B6', 'B7']) {
    assert.match(roadmap, new RegExp(`\\| ${checkpoint} \\|[^\\n]+\\| NOT STARTED \\|`));
  }
});
