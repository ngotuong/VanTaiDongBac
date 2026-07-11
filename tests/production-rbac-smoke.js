/* eslint-disable no-console */
const crypto = require('node:crypto');

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.RBAC_SMOKE_APP_URL || 'https://dongbac.vercel.app';
const suffix = Date.now().toString(36);
const adminName = `smoke_admin_${suffix}`;
const shareholderName = `smoke_share_${suffix}`;
const adminPassword = `Adm@${crypto.randomBytes(12).toString('base64url')}8z`;
const shareholderPassword = 'abc123';
let adminId = '';
let shareholderId = '';

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json'
};

async function expectJson(response, expectedStatus, label) {
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${response.status}: ${body.error || body.message || ''}`);
  }
  return body;
}

async function createRawUser(username, password, role) {
  const auth = await expectJson(await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST', headers: serviceHeaders,
    body: JSON.stringify({ email: `${username}@dongbac.internal`, password, email_confirm: true })
  }), 200, `create ${role} auth user`);
  const user = auth.user || auth;
  await expectJson(await fetch(`${supabaseUrl}/rest/v1/app_users`, {
    method: 'POST', headers: { ...serviceHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: user.id, username, email: `${username}@dongbac.internal`, role, active: true, display_name: username })
  }), 201, `create ${role} profile`);
  return user.id;
}

async function signIn(username, password) {
  const result = await expectJson(await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@dongbac.internal`, password })
  }), 200, `sign in ${username}`);
  return result.access_token;
}

async function appCall(token, method, action, body) {
  return fetch(`${appUrl}/api/app?action=${encodeURIComponent(action)}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify({ action, ...(body || {}) }) : undefined
  });
}

async function cleanupUser(id) {
  if (!id) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: serviceHeaders });
}

(async () => {
  try {
    adminId = await createRawUser(adminName, adminPassword, 'admin');
    const adminToken = await signIn(adminName, adminPassword);
    await expectJson(await appCall(adminToken, 'GET', 'authSession'), 200, 'admin authSession');
    await expectJson(await appCall(adminToken, 'GET', 'listUsers'), 200, 'admin listUsers');

    const created = await expectJson(await appCall(adminToken, 'POST', 'createUser', {
      username: shareholderName,
      displayName: 'Smoke Shareholder',
      role: 'shareholder',
      password: shareholderPassword
    }), 200, 'admin create shareholder');
    shareholderId = created.user.user_id;

    let shareholderToken = await signIn(shareholderName, shareholderPassword);
    const session = await expectJson(await appCall(shareholderToken, 'GET', 'authSession'), 200, 'shareholder authSession');
    if (session.user.role !== 'shareholder') throw new Error('shareholder role was not returned');
    await expectJson(await appCall(shareholderToken, 'GET', 'getStartupData'), 200, 'shareholder read');
    const loanData = await expectJson(await fetch(`${appUrl}/api/app?action=getFundLoanOverview&year=2026`, {
      headers: { Authorization: `Bearer ${shareholderToken}` }
    }), 200, 'shareholder loan read');
    const settledCodes = new Set((loanData.loans || [])
      .filter((item) => item.partner === 'Quang Quân' && Number(item.borrowed) === 5752000 && Number(item.outstanding) === 0)
      .map((item) => item.code));
    if (!settledCodes.has('260622145024') || !settledCodes.has('260704114143')) {
      throw new Error('Quang Quân settlement reconciliation is not reflected in production');
    }
    await expectJson(await appCall(shareholderToken, 'POST', 'submitRows', { formType: 'vanChuyen', rows: [] }), 403, 'shareholder write denied');

    const changedPassword = 'def456';
    await expectJson(await appCall(shareholderToken, 'POST', 'changeOwnPassword', {
      currentPassword: shareholderPassword,
      newPassword: changedPassword
    }), 200, 'shareholder change password');
    shareholderToken = await signIn(shareholderName, changedPassword);

    await expectJson(await appCall(adminToken, 'POST', 'updateUser', {
      userId: shareholderId,
      displayName: 'Smoke Shareholder Updated',
      role: 'shareholder',
      active: true
    }), 200, 'admin update shareholder');
    const reset = await expectJson(await appCall(adminToken, 'POST', 'resetUserPassword', { userId: shareholderId }), 200, 'admin reset password');
    await signIn(shareholderName, reset.temporaryPassword);

    console.log(JSON.stringify({ ok: true, checks: ['admin-list', 'admin-create', 'shareholder-read', 'loan-reconciliation', 'shareholder-write-403', 'change-password-six-characters', 'update-user', 'reset-password'] }));
  } finally {
    await cleanupUser(shareholderId);
    await cleanupUser(adminId);
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
