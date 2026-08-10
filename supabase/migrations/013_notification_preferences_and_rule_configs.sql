create table if not exists public.notification_preferences (
  user_id uuid not null references public.app_users(user_id) on delete cascade,
  notification_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_key),
  constraint notification_preferences_key_check check (notification_key in ('fund-low-balance'))
);

create table if not exists public.notification_rule_configs (
  rule_key text primary key,
  enabled boolean not null default false,
  threshold_value numeric not null,
  cooldown_minutes integer not null,
  recipient_roles text[] not null,
  notification_body text not null,
  schedule_time time not null default time '08:00',
  updated_by uuid references public.app_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rule_threshold_check check (threshold_value between 1000000 and 1000000000),
  constraint notification_rule_cooldown_check check (cooldown_minutes between 60 and 10080),
  constraint notification_rule_roles_check check (
    cardinality(recipient_roles) > 0 and recipient_roles <@ array['admin', 'shareholder']::text[]
  ),
  constraint notification_rule_body_check check (char_length(btrim(notification_body)) between 1 and 160),
  constraint notification_rule_schedule_check check (schedule_time = time '08:00')
);

create table if not exists public.notification_rule_audit_logs (
  id bigint generated always as identity primary key,
  rule_key text not null,
  changed_by uuid references public.app_users(user_id) on delete set null,
  previous_config jsonb,
  next_config jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.audit_notification_rule_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.updated_by is not null then
    insert into public.notification_rule_audit_logs(rule_key, changed_by, previous_config, next_config)
    values (new.rule_key, new.updated_by, case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  end if;
  return new;
end;
$$;

drop trigger if exists notification_rule_configs_audit on public.notification_rule_configs;
create trigger notification_rule_configs_audit
after insert or update on public.notification_rule_configs
for each row execute function public.audit_notification_rule_config();

insert into public.notification_rule_configs (
  rule_key, enabled, threshold_value, cooldown_minutes, recipient_roles, notification_body, schedule_time
) values (
  'fund-current-balance-below-10m', false, 10000000, 1440,
  array['admin', 'shareholder']::text[], 'Số dư quỹ đã xuống dưới ngưỡng 10 triệu', time '08:00'
) on conflict (rule_key) do nothing;

insert into public.notification_preferences(user_id, notification_key, enabled)
select user_id, 'fund-low-balance', true
from public.app_users
where active = true and role in ('admin', 'shareholder')
on conflict (user_id, notification_key) do nothing;

alter table public.notification_preferences enable row level security;
alter table public.notification_rule_configs enable row level security;
alter table public.notification_rule_audit_logs enable row level security;

revoke all on public.notification_preferences from public, anon, authenticated;
revoke all on public.notification_rule_configs from public, anon, authenticated;
revoke all on public.notification_rule_audit_logs from public, anon, authenticated;
grant all on public.notification_preferences to service_role;
grant all on public.notification_rule_configs to service_role;
grant all on public.notification_rule_audit_logs to service_role;
grant usage, select on sequence public.notification_rule_audit_logs_id_seq to service_role;

comment on table public.notification_preferences is 'Server-managed per-user notification type preferences.';
comment on table public.notification_rule_configs is 'Admin-managed notification rule configuration; scheduling remains deployment-managed.';
comment on table public.notification_rule_audit_logs is 'Immutable audit history for notification rule configuration changes.';
