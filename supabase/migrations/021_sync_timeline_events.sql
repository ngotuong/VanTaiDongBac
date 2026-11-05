-- Durable server-only evidence for signal -> queue -> claim -> publication SLA.
-- No business payload or Google Sheet value is stored here.
create table if not exists public.sync_timeline_events (
  event_key text primary key,
  workbook_year text not null check (workbook_year ~ '^20[0-9]{2}$'),
  module text not null check (module in ('transport', 'fund', 'system')),
  generation_id text not null,
  event_name text not null check (event_name in ('signal', 'queued', 'claimed', 'stage_started', 'published', 'failed')),
  stage text,
  cache_key text,
  event_at timestamptz not null,
  build_stamp text not null,
  created_at timestamptz not null default now()
);

create index if not exists sync_timeline_events_generation_idx
  on public.sync_timeline_events (workbook_year, module, generation_id, event_at, event_name);

create index if not exists sync_timeline_events_event_at_idx
  on public.sync_timeline_events (event_at desc);

alter table public.sync_timeline_events enable row level security;
revoke all on public.sync_timeline_events from public, anon, authenticated;
grant all on public.sync_timeline_events to service_role;

comment on table public.sync_timeline_events is
  'Server-only immutable-generation timeline for sync SLA evidence; contains metadata only, never business payload.';
