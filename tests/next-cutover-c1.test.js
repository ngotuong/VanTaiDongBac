const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('C1 root layout owns authentication and PWA metadata without a legacy redirect loop', () => {
  const layout = read('next-shell/app/layout.jsx');
  const session = read('next-shell/components/platform/SessionControls.tsx');
  assert.match(layout, /<LoginGate/);
  assert.doesNotMatch(layout, /redirectToLegacyRoot|next\/navigation/);
  assert.match(layout, /manifest: '\/manifest\.json'/);
  assert.match(layout, /width: 'device-width'/);
  assert.match(session, /dongbac\.internal/);
  assert.match(session, /X-VTDB-CSRF': 'session'/);
  assert.match(session, /fetch\('\/api\/session'/);
  assert.doesNotMatch(session, /localStorage\.setItem\([^,]+token/i);
});

test('C1 manifest and interactive data routes are root-scoped', () => {
  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) assert.match(icon.src, /^\/static\/assets\//);
  for (const file of [
    'next-shell/components/report/ReportModule.tsx',
    'next-shell/components/dashboard/DashboardModule.tsx',
    'next-shell/components/manage/ManageReadOnlyModule.tsx',
    'next-shell/components/catalog/CatalogModule.tsx',
    'next-shell/components/cashflow/CashflowModule.tsx'
  ]) assert.doesNotMatch(read(file), /\/next-accounts\//);
});

test('C1 keeps same-origin HttpOnly session lifecycle and explicit sign out', () => {
  const controls = read('next-shell/components/platform/SessionControls.tsx');
  const cookie = read('server/services/session-cookie-service.js');
  assert.match(controls, /credentials: 'same-origin'/);
  assert.match(controls, /method: 'DELETE'/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
});
