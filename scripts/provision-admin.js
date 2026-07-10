const crypto = require('node:crypto');

async function request(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (err) {}
  if (!response.ok) throw new Error((data && (data.message || data.error_description || data.error)) || `HTTP ${response.status}`);
  return data;
}

async function main() {
  const username = String(process.argv[2] || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Tên đăng nhập không hợp lệ.');
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!baseUrl || !serviceKey) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const email = `${username}@dongbac.internal`;
  const temporaryPassword = `DB!${crypto.randomBytes(18).toString('base64url')}9a`;

  const list = await request(`${baseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
  let user = (list.users || []).find((item) => String(item.email || '').toLowerCase() === email);
  if (user) {
    user = await request(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PUT', headers, body: JSON.stringify({ password: temporaryPassword, email_confirm: true, user_metadata: { username } })
    });
  } else {
    user = await request(`${baseUrl}/auth/v1/admin/users`, {
      method: 'POST', headers, body: JSON.stringify({ email, password: temporaryPassword, email_confirm: true, user_metadata: { username } })
    });
  }

  await request(`${baseUrl}/rest/v1/app_users?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: user.id, username, email, role: 'admin', active: true, display_name: username }])
  });
  process.stdout.write(JSON.stringify({ ok: true, username, role: 'admin', temporaryPassword }));
}

main().catch((err) => {
  process.stderr.write(err.message || String(err));
  process.exit(1);
});

