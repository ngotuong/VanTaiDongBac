const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('client_auth.html').replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const plain = (value) => JSON.parse(JSON.stringify(value));

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    contains: (item) => values.has(item),
    values
  };
}

function element(id, initialClasses = []) {
  return {
    id,
    tagName: 'DIV',
    value: '',
    textContent: '',
    disabled: false,
    dataset: {},
    style: {},
    classList: classList(initialClasses),
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; }
  };
}

function loadAuth(overrides = {}) {
  const elements = {
    authGate: element('authGate', ['hidden']), loader: element('loader'), authStatus: element('authStatus'),
    authUsername: element('authUsername'), authPassword: element('authPassword'), usernameSignInBtn: element('usernameSignInBtn'),
    authUserPanel: element('authUserPanel', ['hidden']), authUserEmail: element('authUserEmail'), app: element('app')
  };
  elements.app.className = 'app';
  const body = element('body');
  body.children = [elements.authGate, elements.app, elements.loader];
  const storage = new Map();
  const context = vm.createContext({
    window: {
      __SUPABASE_CONFIG: { url: ' https://example.supabase.co ', anonKey: ' anon-key ', reportsEnabled: 'true', authEnabled: 'true' },
      supabase: null,
      location: { reload() { context.reloads += 1; } }
    },
    document: {
      body,
      getElementById: (id) => elements[id] || null,
      querySelector: (selector) => selector === '.app' ? elements.app : null
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    sessionStorage: { clear() { context.sessionClears += 1; } },
    currentAuthUser: null,
    getCurrentRole: () => context.currentAuthUser?.role || 'operator',
    getRoleLabel: (role) => ({ admin: 'Quản trị viên', operator: 'Vận hành', shareholder: 'Cổ đông' }[role] || role),
    applyRoleUi: () => { context.roleApplications += 1; },
    callFetchApi: async () => ({ ok: true, user: { username: 'tester', role: 'operator' } }),
    init: () => { context.initCalls += 1; },
    reloads: 0,
    sessionClears: 0,
    roleApplications: 0,
    initCalls: 0,
    ...overrides
  });
  new vm.Script(source, { filename: 'client_auth.html' }).runInContext(context);
  return { context, elements, storage };
}

test('Auth client preserves config normalization and one persistent Supabase client', () => {
  let creations = 0;
  let createArgs;
  const client = { auth: {} };
  const loaded = loadAuth();
  loaded.context.window.supabase = {
    createClient(...args) { creations += 1; createArgs = args; return client; }
  };
  assert.deepEqual(plain(loaded.context.getSupabaseConfig()), {
    url: 'https://example.supabase.co', anonKey: 'anon-key', reportsEnabled: true, authEnabled: true
  });
  assert.equal(loaded.context.isAuthEnabled(), true);
  assert.equal(loaded.context.getSupabaseClient(), client);
  assert.equal(loaded.context.getSupabaseClient(), client);
  assert.equal(creations, 1);
  assert.deepEqual(plain(createArgs), [
    'https://example.supabase.co', 'anon-key',
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  ]);
});

test('Auth access token preserves empty and active-session behavior', async () => {
  const noClient = loadAuth();
  assert.equal(await noClient.context.getSupabaseAccessToken(), '');

  const active = loadAuth();
  active.context.window.supabase = {
    createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } } }) } })
  };
  assert.equal(await active.context.getSupabaseAccessToken(), 'token-1');
});

test('Auth gate preserves inert state, remembered username, user label, and role application', () => {
  const loaded = loadAuth();
  loaded.storage.set('dongbac_auth_username', 'remembered');
  loaded.context.showAuthGate('Đăng nhập lại.');
  assert.equal(loaded.elements.authGate.classList.contains('hidden'), false);
  assert.equal(loaded.elements.app.classList.contains('hidden'), true);
  assert.equal(loaded.elements.authStatus.textContent, 'Đăng nhập lại.');
  assert.equal(loaded.elements.authUsername.value, 'remembered');
  assert.equal(loaded.elements.authUsername.focused, true);
  assert.equal(loaded.elements.app.attributes.inert, '');

  loaded.context.hideAuthGate({ username: 'admin', displayName: 'Admin DB', role: 'admin' });
  assert.equal(loaded.context.currentAuthUser.role, 'admin');
  assert.equal(loaded.elements.authGate.classList.contains('hidden'), true);
  assert.equal(loaded.elements.app.classList.contains('hidden'), false);
  assert.equal(loaded.elements.authUserEmail.textContent, 'Admin DB · Quản trị viên');
  assert.equal(loaded.context.roleApplications, 1);
  assert.equal(loaded.storage.get('dongbac_auth_username'), 'admin');
  assert.equal('inert' in loaded.elements.app.attributes, false);
});

test('Username sign-in preserves validation, internal email, error text, storage, and reload', async () => {
  const loaded = loadAuth();
  let credentials;
  let authError = null;
  loaded.context.window.supabase = {
    createClient: () => ({ auth: { signInWithPassword: async (value) => { credentials = value; return { error: authError }; } } })
  };
  loaded.elements.authUsername.value = 'Bad User';
  loaded.elements.authPassword.value = 'secret';
  await loaded.context.signInWithUsername();
  assert.equal(loaded.elements.authStatus.textContent, 'Tên đăng nhập không hợp lệ.');

  loaded.elements.authUsername.value = ' Test.User ';
  loaded.elements.authPassword.value = 'secret';
  authError = { message: 'invalid' };
  await loaded.context.signInWithUsername();
  assert.equal(loaded.elements.authStatus.textContent, 'Tên đăng nhập hoặc mật khẩu không đúng.');
  assert.equal(loaded.elements.usernameSignInBtn.disabled, false);

  authError = null;
  await loaded.context.signInWithUsername();
  assert.deepEqual(plain(credentials), { email: 'test.user@dongbac.internal', password: 'secret' });
  assert.equal(loaded.storage.get('dongbac_auth_username'), 'test.user');
  assert.equal(loaded.context.reloads, 1);
});

test('Auth bootstrap preserves disabled, missing-session, success, and denied-account flows', async () => {
  const disabled = loadAuth();
  disabled.context.window.__SUPABASE_CONFIG.authEnabled = 'false';
  await disabled.context.bootstrapAuthenticatedApp();
  assert.equal(disabled.context.initCalls, 1);
  assert.equal(disabled.elements.authGate.classList.contains('hidden'), true);

  const missing = loadAuth();
  missing.context.window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } }) };
  await missing.context.bootstrapAuthenticatedApp();
  assert.equal(missing.elements.authGate.classList.contains('hidden'), false);

  const success = loadAuth();
  success.context.window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'auth-user' } } }, error: null }) } }) };
  await success.context.bootstrapAuthenticatedApp();
  assert.equal(success.context.initCalls, 1);
  assert.equal(success.context.currentAuthUser.username, 'tester');

  let signOuts = 0;
  const denied = loadAuth({ callFetchApi: async () => { throw new Error('Tài khoản bị khóa.'); } });
  denied.context.window.supabase = { createClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: {} } }, error: null }),
    signOut: async () => { signOuts += 1; }
  } }) };
  await denied.context.bootstrapAuthenticatedApp();
  assert.equal(signOuts, 1);
  assert.equal(denied.elements.authStatus.textContent, 'Tài khoản bị khóa.');
});

test('Sign-out preserves Supabase sign-out, session clear, and gate message', async () => {
  let signOuts = 0;
  const loaded = loadAuth();
  loaded.context.window.supabase = { createClient: () => ({ auth: { signOut: async () => { signOuts += 1; } } }) };
  await loaded.context.signOutCurrentUser();
  assert.equal(signOuts, 1);
  assert.equal(loaded.context.sessionClears, 1);
  assert.equal(loaded.elements.authStatus.textContent, 'Bạn đã đăng xuất.');
});

test('client_auth is loaded after config and uniquely owns Auth globals', () => {
  for (const file of ['index.template.html', 'client.html']) {
    const html = read(file);
    assert.ok(html.indexOf("include('client_config')") < html.indexOf("include('client_auth')"));
    assert.ok(html.indexOf("include('client_auth')") < html.indexOf("include('client_api')"));
  }
  const fragments = fs.readdirSync(root).filter((name) => /^client_.*\.html$/.test(name));
  for (const functionName of ['isAuthEnabled', 'getSupabaseAccessToken', 'getSupabaseConfig', 'getSupabaseClient', 'showAuthGate', 'signInWithUsername', 'signOutCurrentUser', 'bootstrapAuthenticatedApp']) {
    const owners = fragments.filter((file) => new RegExp(`function ${functionName}\\s*\\(`).test(read(file)));
    assert.deepEqual(owners, ['client_auth.html'], `${functionName} must have one frontend owner`);
  }
});
