-- Notification state stays server-only; cooldown reservations need no new schema.
set role service_role;
insert into public.notification_rule_states(rule_key) values ('notification-device-cas');
do $$
declare changed integer;
begin
  update public.notification_rule_states set last_sent_at='2026-10-14 01:00:00+00', last_result='sending:owner'
    where rule_key='notification-device-cas' and last_sent_at is null;
  get diagnostics changed = row_count;
  assert changed = 1, 'first device reservation must succeed';
  update public.notification_rule_states set last_result='sending:stale'
    where rule_key='notification-device-cas' and last_sent_at is null;
  get diagnostics changed = row_count;
  assert changed = 0, 'stale reservation cannot overwrite the owner';
  update public.notification_rule_states set last_result='sent'
    where rule_key='notification-device-cas' and last_result='sending:stale';
  get diagnostics changed = row_count;
  assert changed = 0, 'stale completion cannot finalize another delivery';
  update public.notification_rule_states set last_result='sent'
    where rule_key='notification-device-cas' and last_result='sending:owner';
  get diagnostics changed = row_count;
  assert changed = 1, 'owner can finalize its own delivery';
end $$;
reset role;
