const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Next application shell is promoted to the C1 production root', () => {
  const config = read('next-shell/next.config.mjs');
  const page = read('next-shell/app/page.jsx');
  assert.doesNotMatch(config, /output: 'export'/);
  assert.doesNotMatch(config, /basePath/);
  assert.match(page, /<PlatformHome/);
  assert.match(read('package.json'), /build:next-accounts/);
});

test('React Accounts component preserves legacy labels, fields, roles, and accessibility status', () => {
  const legacy = read('index.template.html');
  const react = read('next-shell/components/Accounts.jsx');
  for (const text of ['Đổi mật khẩu', 'Mật khẩu hiện tại', 'Mật khẩu mới', 'Xác nhận mật khẩu mới', 'Quản lý tài khoản', 'Tên đăng nhập', 'Tên hiển thị', 'Cổ đông (chỉ xem)', 'Nhân viên vận hành', 'Quản trị viên', 'Tạo tài khoản']) {
    assert.ok(legacy.includes(text), `legacy markup is missing: ${text}`);
    assert.ok(react.includes(text), `React markup is missing: ${text}`);
  }
  for (const id of ['currentPasswordInput', 'newPasswordInput', 'confirmPasswordInput', 'changePasswordBtn', 'newAccountUsername', 'newAccountDisplayName', 'newAccountRole', 'newAccountPassword', 'createAccountBtn', 'temporaryPasswordBox', 'accountUsersBody', 'accountSettingsStatus']) {
    assert.match(react, new RegExp(`id="${id}"`));
  }
  assert.match(react, /aria-live="polite"/);
  assert.match(react, /minLength=\{6\}/);
});

test('React Accounts canary is off by default and removes duplicate legacy IDs only when enabled', () => {
  const build = read('scripts/build.js');
  const template = read('index.template.html');
  const entry = read('react-accounts/entry.jsx');
  assert.match(build, /VITE_REACT_ACCOUNTS_ENABLED/);
  assert.match(template, /window\.__REACT_ACCOUNTS_ENABLED/);
  assert.match(template, /accountsLegacyRoot/);
  assert.match(template, /accountsReactRoot/);
  assert.match(entry, /if \(!enabled\(window\.__REACT_ACCOUNTS_ENABLED\)\) return false/);
  assert.match(entry, /legacy\.remove\(\)/);
  assert.match(entry, /window\.mountReactAccounts/);
  assert.match(read('.env.example'), /VITE_REACT_ACCOUNTS_ENABLED=false/);
});

test('typed Account client preserves all five stable proxy-local action contracts', () => {
  const client = read('next-shell/lib/account-client.js');
  for (const action of ['changeOwnPassword', 'listUsers', 'createUser', 'updateUser', 'resetUserPassword']) {
    assert.match(client, new RegExp(`'${action}'`));
    assert.match(read('server/services/account-service.js'), new RegExp(`'${action}'`));
  }
  assert.match(client, /@typedef/);
  assert.match(client, /AccountTransport/);
});

test('legacy and React implementations remain available for immediate rollback', () => {
  assert.match(read('client_accounts.html'), /async function changeOwnPassword/);
  assert.match(read('client_accounts.html'), /async function createUserAccount/);
  assert.match(read('index.template.html'), /accounts-react\.js/);
  assert.match(read('react-accounts/entry.jsx'), /window\.changeOwnPassword/);
  assert.match(read('react-accounts/entry.jsx'), /window\.createUserAccount/);
});

test('Vercel runs the complete legacy, React island, and Next shell build', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.buildCommand, 'npm run build:next-accounts');
});
