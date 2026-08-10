create table if not exists public.notification_rule_states (
  rule_key text primary key,
  condition_active boolean not null default false,
  last_value numeric,
  threshold_value numeric,
  last_evaluated_at timestamptz,
  last_sent_at timestamptz,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_rule_states enable row level security;

revoke all on public.notification_rule_states from public, anon, authenticated;
grant all on public.notification_rule_states to service_role;

comment on table public.notification_rule_states is
  'Server-only state for scheduled notification thresholds and delivery cooldowns.';
