const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fund alert endpoint reserves live sends for cron and admin-managed settings/dry-run', () => {
  const api = read('api/fund-alerts.js');
  assert.match(api, /req\.headers\.authorization !== `Bearer \$\{config\.cronSecret\}`/);
  assert.match(api, /assertAdmin\(user\)/);
  assert.match(api, /assertSameOrigin\(req, httpError\)/);
  assert.match(api, /service\.dryRun\(config, override\)/);
  assert.match(api, /service\.run\(config\)/);
  assert.match(api, /settings\.updateRule\(config, user/);
});

test('fund alert Settings card is admin-only and cannot send notifications', () => {
  const settings = read('next-shell/components/settings/SettingsModule.tsx');
  const card = read('next-shell/components/settings/FundAlertSettings.tsx');
  assert.match(settings, /isAdmin && <FundAlertSettings/);
  assert.match(card, /post\('dryRun'/);
  assert.match(card, /Kiểm tra bản nháp — không gửi/);
  assert.doesNotMatch(card, /action: ['"]send/);
});

test('migration 013 keeps preferences, configs and audit history server-only', () => {
  const migration = read('supabase/migrations/013_notification_preferences_and_rule_configs.sql');
  for (const table of ['notification_preferences', 'notification_rule_configs', 'notification_rule_audit_logs']) assert.match(migration, new RegExp(table));
  assert.match(migration, /audit_notification_rule_config/);
  assert.match(migration, /revoke all .* from public, anon, authenticated/si);
  assert.match(migration, /grant all .* to service_role/si);
});

test('migration 012 keeps notification rule state server-only', () => {
  const migration = read('supabase/migrations/012_notification_rule_states.sql');
  assert.match(migration, /notification_rule_states/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all .* from public, anon, authenticated/i);
  assert.match(migration, /grant all .* to service_role/i);
});

test('production cron remains intentionally absent from Vercel config', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.crons, undefined);
});
