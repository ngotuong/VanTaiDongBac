-- Web Push foundation. Subscriptions are server-only credentials tied to one
-- allowlisted app user. This migration does not add offline data or caching.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(user_id) on delete cascade,
  endpoint_hash text not null,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_hash_format
    check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  constraint web_push_subscriptions_user_endpoint_key
    unique (user_id, endpoint_hash)
);

create index if not exists web_push_subscriptions_user_idx
  on public.web_push_subscriptions (user_id, updated_at desc);

alter table public.web_push_subscriptions enable row level security;

revoke all on public.web_push_subscriptions from public, anon, authenticated;
grant all on public.web_push_subscriptions to service_role;

comment on table public.web_push_subscriptions is
  'Server-only Web Push endpoints for active internal app users; never exposed through direct browser Supabase access.';
